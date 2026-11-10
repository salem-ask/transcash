<?php
declare(strict_types=1);

const ROLES = ['super_admin', 'admin', 'accountant', 'manager', 'driver'];

/** Un administrateur ne peut ni créer ni modifier un super administrateur. */
function assert_can_assign(array $actor, string $role): void
{
    if (!in_array($role, ROLES, true)) {
        throw new HttpError(422, 'Rôle invalide');
    }
    if ($role === 'super_admin' && $actor['role'] !== 'super_admin') {
        throw new HttpError(403, 'Seul un super administrateur peut attribuer ce rôle');
    }
}

function users_list(): array
{
    $u = require_permission('users.view');
    $rows = query(
        'SELECT * FROM users WHERE owner_id = ? AND deleted_at IS NULL ORDER BY active DESC, name',
        [$u['owner_id']]
    )->fetchAll();
    return ['users' => array_map('public_user', $rows)];
}

function users_create(): array
{
    $actor = require_permission('users.manage');
    $d = body();
    $name = required_string($d, 'name', 'Le nom');
    $login = normalize_login(required_string($d, 'login', "L'identifiant"));
    $role = (string)($d['role'] ?? '');
    assert_can_assign($actor, $role);
    $password = (string)($d['password'] ?? '');
    validate_password($password);
    if (query('SELECT 1 FROM users WHERE login = ?', [$login])->fetchColumn()) {
        throw new HttpError(409, 'Cet identifiant est déjà utilisé');
    }
    $id = uuid();
    query(
        'INSERT INTO users (id, owner_id, name, login, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
        [$id, $actor['owner_id'], $name, $login, password_hash($password, PASSWORD_DEFAULT), $role]
    );
    audit($actor['owner_id'], $actor['id'], 'user', $id, 'create', null, compact('name', 'login', 'role'));
    return users_list();
}

function users_update(string $id): array
{
    $actor = require_permission('users.manage');
    $target = query(
        'SELECT * FROM users WHERE id = ? AND owner_id = ? AND deleted_at IS NULL',
        [$id, $actor['owner_id']]
    )->fetch();
    if (!$target) {
        throw new HttpError(404, 'Utilisateur introuvable');
    }
    if ($target['role'] === 'super_admin' && $actor['role'] !== 'super_admin') {
        throw new HttpError(403, 'Seul un super administrateur peut modifier ce compte');
    }
    $d = body();
    $name = array_key_exists('name', $d) ? required_string($d, 'name', 'Le nom') : $target['name'];
    $role = (string)($d['role'] ?? $target['role']);
    $active = array_key_exists('active', $d) ? (bool)$d['active'] : (bool)$target['active'];
    if ($target['id'] === $actor['id'] && ($role !== $target['role'] || !$active)) {
        throw new HttpError(422, 'Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte');
    }
    if ($role !== $target['role']) {
        assert_can_assign($actor, $role);
    }
    query('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', [$name, $role, $active ? 1 : 0, $id]);
    if (!empty($d['password'])) {
        validate_password((string)$d['password']);
        query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash((string)$d['password'], PASSWORD_DEFAULT), $id]);
    }
    audit(
        $actor['owner_id'], $actor['id'], 'user', $id, 'update',
        ['name' => $target['name'], 'role' => $target['role'], 'active' => (bool)$target['active']],
        ['name' => $name, 'role' => $role, 'active' => $active, 'passwordReset' => !empty($d['password'])]
    );
    return users_list();
}
