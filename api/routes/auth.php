<?php
declare(strict_types=1);

function needs_setup(): bool
{
    return (int)query('SELECT COUNT(*) FROM users')->fetchColumn() === 0;
}

function session_payload(?array $u): array
{
    return [
        'needsSetup' => $u ? false : needs_setup(),
        'user' => $u ? public_user($u) : null,
        'ownerName' => $u ? query('SELECT name FROM owners WHERE id = ?', [$u['owner_id']])->fetchColumn() : null,
    ];
}

function auth_status(): array
{
    return session_payload(current_user());
}

/** Création du tout premier compte (propriétaire + super administrateur). Possible une seule fois. */
function auth_setup(): array
{
    $d = body();
    $ownerName = required_string($d, 'ownerName', "Le nom de l'entreprise");
    $name = required_string($d, 'name', 'Le nom');
    $login = normalize_login(required_string($d, 'login', "L'identifiant"));
    $password = (string)($d['password'] ?? '');
    validate_password($password);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        // Verrou : empêche deux installations simultanées
        if ((int)query('SELECT COUNT(*) FROM users FOR UPDATE')->fetchColumn() > 0) {
            throw new HttpError(409, 'Le compte principal existe déjà');
        }
        $ownerId = uuid();
        $userId = uuid();
        query('INSERT INTO owners (id, name) VALUES (?, ?)', [$ownerId, $ownerName]);
        query('INSERT INTO settings (owner_id) VALUES (?)', [$ownerId]);
        query(
            'INSERT INTO users (id, owner_id, name, login, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
            [$userId, $ownerId, $name, $login, password_hash($password, PASSWORD_DEFAULT), 'super_admin']
        );
        audit($ownerId, $userId, 'owner', $ownerId, 'create', null, ['name' => $ownerName]);
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    start_session();
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    return session_payload(current_user());
}

function auth_login(): array
{
    $d = body();
    $login = normalize_login((string)($d['login'] ?? ''));
    $password = (string)($d['password'] ?? '');
    if ($login === '' || $password === '') {
        throw new HttpError(422, 'Identifiant et mot de passe obligatoires');
    }
    if (too_many_attempts($login)) {
        throw new HttpError(429, 'Trop de tentatives. Réessayez dans ' . LOGIN_WINDOW_MINUTES . ' minutes.');
    }
    $u = query('SELECT * FROM users WHERE login = ? AND deleted_at IS NULL', [$login])->fetch();
    if (!$u || !password_verify($password, $u['password_hash'])) {
        record_failed_attempt($login);
        throw new HttpError(401, 'Identifiant ou mot de passe incorrect');
    }
    if (!$u['active']) {
        throw new HttpError(403, 'Ce compte est désactivé');
    }
    if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
        query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
    }
    query('UPDATE users SET last_login_at = ? WHERE id = ?', [now_utc(), $u['id']]);
    query('DELETE FROM login_attempts WHERE login = ?', [$login]);
    start_session();
    session_regenerate_id(true);
    $_SESSION['user_id'] = $u['id'];
    return session_payload(current_user());
}

function auth_logout(): array
{
    start_session();
    $_SESSION = [];
    session_destroy();
    return ['ok' => true];
}

function auth_change_password(): array
{
    $u = require_user();
    $d = body();
    if (!password_verify((string)($d['currentPassword'] ?? ''), $u['password_hash'])) {
        throw new HttpError(422, 'Mot de passe actuel incorrect');
    }
    $new = (string)($d['newPassword'] ?? '');
    validate_password($new);
    query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $u['id']]);
    audit($u['owner_id'], $u['id'], 'user', $u['id'], 'password', null, null);
    return ['ok' => true];
}
