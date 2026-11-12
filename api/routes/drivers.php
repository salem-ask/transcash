<?php
declare(strict_types=1);

// Chauffeurs : fiche, historique des engins conduits, accès de consultation.

function find_driver(string $ownerId, string $id, bool $lock = false): array
{
    $d = query(
        'SELECT * FROM drivers WHERE id = ? AND owner_id = ? AND deleted_at IS NULL' . ($lock ? ' FOR UPDATE' : ''),
        [$id, $ownerId]
    )->fetch();
    if (!$d) {
        throw new HttpError(404, 'Chauffeur introuvable');
    }
    return $d;
}

function public_driver(array $d, ?array $vehicle = null): array
{
    return [
        'id' => $d['id'],
        'name' => $d['name'],
        'phone' => $d['phone'],
        'idNumber' => $d['id_number'],
        'licenseNumber' => $d['license_number'],
        'address' => $d['address'],
        'notes' => $d['notes'],
        'active' => (bool)$d['active'],
        'hasAccount' => $d['user_id'] !== null,
        'currentVehicle' => $vehicle,
    ];
}

function driver_input(array $d): array
{
    $phone = normalize_login(required_string($d, 'phone', 'Le téléphone', 30));
    if (!preg_match('/^\+?[0-9]{6,15}$/', $phone)) {
        throw new HttpError(422, 'Numéro de téléphone invalide');
    }
    return [
        'name' => required_string($d, 'name', 'Le nom'),
        'phone' => $phone,
        'id_number' => optional_string($d, 'idNumber', 60),
        'license_number' => optional_string($d, 'licenseNumber', 60),
        'address' => optional_string($d, 'address', 255),
        'notes' => optional_string($d, 'notes', 2000),
    ];
}

function drivers_list(): array
{
    $u = require_permission('drivers.view');
    $rows = query(
        'SELECT d.*, v.id AS v_id, v.name AS v_name, v.type AS v_type, v.plate AS v_plate, a.start_date AS a_start
         FROM drivers d
         LEFT JOIN assignments a ON a.driver_id = d.id AND a.end_date IS NULL
         LEFT JOIN vehicles v ON v.id = a.vehicle_id
         WHERE d.owner_id = ? AND d.deleted_at IS NULL
         ORDER BY d.active DESC, d.name',
        [$u['owner_id']]
    )->fetchAll();
    return ['drivers' => array_map(
        fn($r) => public_driver($r, $r['v_id'] ? ['id' => $r['v_id'], 'name' => $r['v_name'], 'type' => $r['v_type'], 'plate' => $r['v_plate'], 'since' => $r['a_start']] : null),
        $rows
    )];
}

function driver_detail(string $ownerId, string $id): array
{
    $d = find_driver($ownerId, $id);
    $history = query(
        'SELECT a.*, v.name AS vehicle_name FROM assignments a JOIN vehicles v ON v.id = a.vehicle_id
         WHERE a.driver_id = ? ORDER BY a.start_date DESC, a.created_at DESC',
        [$id]
    )->fetchAll();
    $current = null;
    foreach ($history as $a) {
        if ($a['end_date'] === null) {
            $v = query('SELECT id, name, type, plate FROM vehicles WHERE id = ?', [$a['vehicle_id']])->fetch();
            $current = $v + ['since' => $a['start_date']];
        }
    }
    return ['driver' => public_driver($d, $current), 'assignments' => array_map('public_assignment', $history)];
}

function drivers_get(string $id): array
{
    $u = require_permission('drivers.view');
    return driver_detail($u['owner_id'], $id);
}

function assert_phone_free(string $ownerId, string $phone, ?string $exceptId = null): void
{
    $other = query(
        'SELECT name FROM drivers WHERE owner_id = ? AND phone = ? AND id <> ? AND deleted_at IS NULL',
        [$ownerId, $phone, $exceptId ?? '']
    )->fetchColumn();
    if ($other !== false) {
        throw new HttpError(409, "Ce numéro est déjà celui de $other");
    }
}

function drivers_create(): array
{
    $u = require_permission('drivers.manage');
    $f = driver_input(body());
    assert_phone_free($u['owner_id'], $f['phone']);
    $id = uuid();
    query(
        'INSERT INTO drivers (id, owner_id, name, phone, id_number, license_number, address, notes, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$id, $u['owner_id'], $f['name'], $f['phone'], $f['id_number'], $f['license_number'], $f['address'], $f['notes'], $u['id'], $u['id']]
    );
    audit($u['owner_id'], $u['id'], 'driver', $id, 'create', null, $f);
    return driver_detail($u['owner_id'], $id);
}

function drivers_update(string $id): array
{
    $u = require_permission('drivers.manage');
    $d = body();
    db()->beginTransaction();
    try {
        $old = find_driver($u['owner_id'], $id, true);
        $f = driver_input($d);
        assert_phone_free($u['owner_id'], $f['phone'], $id);
        $active = array_key_exists('active', $d) ? (bool)$d['active'] : (bool)$old['active'];
        if (!$active && $old['active']) {
            $busy = query(
                'SELECT v.name FROM assignments a JOIN vehicles v ON v.id = a.vehicle_id WHERE a.driver_id = ? AND a.end_date IS NULL',
                [$id]
            )->fetchColumn();
            if ($busy !== false) {
                throw new HttpError(422, "Retirez d'abord ce chauffeur de « $busy » avant de le désactiver");
            }
        }
        query(
            'UPDATE drivers SET name = ?, phone = ?, id_number = ?, license_number = ?, address = ?, notes = ?, active = ?, updated_by = ?
             WHERE id = ?',
            [$f['name'], $f['phone'], $f['id_number'], $f['license_number'], $f['address'], $f['notes'], $active ? 1 : 0, $u['id'], $id]
        );
        // Un chauffeur désactivé perd aussi son accès de consultation
        if ($old['user_id']) {
            query('UPDATE users SET name = ?, active = ? WHERE id = ?', [$f['name'], $active ? 1 : 0, $old['user_id']]);
        }
        audit($u['owner_id'], $u['id'], 'driver', $id, 'update', audit_fields($old), $f + ['active' => $active]);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return driver_detail($u['owner_id'], $id);
}

/** Crée l'accès de consultation du chauffeur : identifiant = son numéro de téléphone. */
function drivers_create_account(string $id): array
{
    $u = require_permission('users.manage');
    $password = (string)(body()['password'] ?? '');
    validate_password($password);
    db()->beginTransaction();
    try {
        $d = find_driver($u['owner_id'], $id, true);
        if ($d['user_id']) {
            throw new HttpError(409, 'Ce chauffeur a déjà un accès');
        }
        if (!$d['active']) {
            throw new HttpError(422, 'Ce chauffeur est désactivé');
        }
        if (query('SELECT 1 FROM users WHERE login = ?', [$d['phone']])->fetchColumn()) {
            throw new HttpError(409, 'Un compte utilise déjà ce numéro comme identifiant');
        }
        $userId = uuid();
        query(
            'INSERT INTO users (id, owner_id, name, login, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
            [$userId, $u['owner_id'], $d['name'], $d['phone'], password_hash($password, PASSWORD_DEFAULT), 'driver']
        );
        query('UPDATE drivers SET user_id = ? WHERE id = ?', [$userId, $id]);
        audit($u['owner_id'], $u['id'], 'user', $userId, 'create', null, ['name' => $d['name'], 'login' => $d['phone'], 'role' => 'driver']);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return driver_detail($u['owner_id'], $id);
}
