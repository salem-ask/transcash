<?php
declare(strict_types=1);

// Sessions, utilisateur courant et contrôle des droits.

const LOGIN_MAX_ATTEMPTS = 8;      // échecs autorisés…
const LOGIN_WINDOW_MINUTES = 15;   // …sur cette durée

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('transcash_sid');
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 30, // 30 jours : on reste connecté sur son téléphone
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    ini_set('session.gc_maxlifetime', (string)(60 * 60 * 24 * 30));
    session_start();
}

function permissions(): array
{
    static $p = null;
    if ($p === null) {
        $p = json_decode((string)file_get_contents(__DIR__ . '/../permissions.json'), true)['permissions'];
    }
    return $p;
}

function role_can(string $role, string $permission): bool
{
    return in_array($role, permissions()[$permission] ?? [], true);
}

function public_user(array $u): array
{
    return [
        'id' => $u['id'],
        'ownerId' => $u['owner_id'],
        'name' => $u['name'],
        'login' => $u['login'],
        'role' => $u['role'],
        'active' => (bool)$u['active'],
        'lastLoginAt' => $u['last_login_at'] ?? null,
    ];
}

/** Utilisateur connecté, ou null. Vérifie à chaque requête qu'il est toujours actif. */
function current_user(): ?array
{
    start_session();
    $id = $_SESSION['user_id'] ?? null;
    if (!$id) {
        return null;
    }
    $u = query('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND active = 1', [$id])->fetch();
    if (!$u) {
        $_SESSION = [];
        return null;
    }
    return $u;
}

function require_user(): array
{
    $u = current_user();
    if (!$u) {
        throw new HttpError(401, 'Veuillez vous connecter');
    }
    return $u;
}

function require_permission(string $permission): array
{
    $u = require_user();
    if (!role_can($u['role'], $permission)) {
        throw new HttpError(403, "Vous n'avez pas le droit d'effectuer cette action");
    }
    return $u;
}

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
}

function too_many_attempts(string $login): bool
{
    $since = gmdate('Y-m-d H:i:s', time() - LOGIN_WINDOW_MINUTES * 60);
    $n = (int)query(
        'SELECT COUNT(*) FROM login_attempts WHERE (login = ? OR ip = ?) AND created_at > ?',
        [$login, client_ip(), $since]
    )->fetchColumn();
    return $n >= LOGIN_MAX_ATTEMPTS;
}

function record_failed_attempt(string $login): void
{
    query('INSERT INTO login_attempts (login, ip, created_at) VALUES (?, ?, ?)', [$login, client_ip(), now_utc()]);
}

function normalize_login(string $login): string
{
    $login = trim(mb_strtolower($login));
    // Numéro de téléphone : on retire espaces, tirets, points et parenthèses
    if (preg_match('/^[+0-9 ().-]+$/', $login)) {
        $login = preg_replace('/[ ().-]/', '', $login);
    }
    return $login;
}

function validate_password(string $password): void
{
    if (mb_strlen($password) < 8) {
        throw new HttpError(422, 'Le mot de passe doit contenir au moins 8 caractères');
    }
}
