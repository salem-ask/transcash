<?php
declare(strict_types=1);

// Engins : création, modification, retrait du parc, affectation du chauffeur.

function find_vehicle(string $ownerId, string $id, bool $lock = false): array
{
    $v = query(
        'SELECT * FROM vehicles WHERE id = ? AND owner_id = ? AND deleted_at IS NULL' . ($lock ? ' FOR UPDATE' : ''),
        [$id, $ownerId]
    )->fetch();
    if (!$v) {
        throw new HttpError(404, 'Engin introuvable');
    }
    return $v;
}

function current_assignment_of_vehicle(string $vehicleId): ?array
{
    $a = query('SELECT * FROM assignments WHERE vehicle_id = ? AND end_date IS NULL', [$vehicleId])->fetch();
    return $a ?: null;
}

function public_vehicle(array $v, ?array $driver = null): array
{
    return [
        'id' => $v['id'],
        'type' => $v['type'],
        'name' => $v['name'],
        'plate' => $v['plate'],
        'model' => $v['model'],
        'dailyAmount' => (int)$v['daily_amount'],
        'currency' => $v['currency'],
        'restWeekdays' => $v['rest_weekdays'] === null ? null : json_decode($v['rest_weekdays'], true),
        'serviceDate' => $v['service_date'],
        'status' => $v['status'],
        'notes' => $v['notes'],
        'currentDriver' => $driver,
    ];
}

function public_assignment(array $a): array
{
    return [
        'id' => $a['id'],
        'vehicleId' => $a['vehicle_id'],
        'vehicleName' => $a['vehicle_name'] ?? null,
        'driverId' => $a['driver_id'],
        'driverName' => $a['driver_name'] ?? null,
        'startDate' => $a['start_date'],
        'endDate' => $a['end_date'],
    ];
}

/** Lit et valide les champs du formulaire engin. */
function vehicle_input(array $d, ?array $existing): array
{
    $type = (string)($d['type'] ?? $existing['type'] ?? '');
    if (!in_array($type, VEHICLE_TYPES, true)) {
        throw new HttpError(422, "Type d'engin invalide");
    }
    $plate = optional_string($d, 'plate', 30);
    return [
        'type' => $type,
        'name' => required_string($d, 'name', 'Le nom', 100),
        'plate' => $plate === null ? null : strtoupper(preg_replace('/\s+/', ' ', $plate)),
        'model' => optional_string($d, 'model', 100),
        'rest_weekdays' => array_key_exists('restWeekdays', $d) && $d['restWeekdays'] !== null
            ? json_encode(valid_weekdays($d['restWeekdays']))
            : null,
        'notes' => optional_string($d, 'notes', 2000),
    ];
}

function assert_plate_free(string $ownerId, ?string $plate, ?string $exceptId = null): void
{
    if ($plate === null) {
        return;
    }
    $other = query(
        'SELECT name FROM vehicles WHERE owner_id = ? AND plate = ? AND id <> ?',
        [$ownerId, $plate, $exceptId ?? '']
    )->fetchColumn();
    if ($other !== false) {
        throw new HttpError(409, "L'immatriculation $plate est déjà utilisée par « $other »");
    }
}

function vehicles_list(): array
{
    $u = require_permission('vehicles.view');
    $rows = query(
        'SELECT v.*, d.id AS d_id, d.name AS d_name, d.phone AS d_phone, a.start_date AS a_start
         FROM vehicles v
         LEFT JOIN assignments a ON a.vehicle_id = v.id AND a.end_date IS NULL
         LEFT JOIN drivers d ON d.id = a.driver_id
         WHERE v.owner_id = ? AND v.deleted_at IS NULL
         ORDER BY v.status, v.name',
        [$u['owner_id']]
    )->fetchAll();
    return ['vehicles' => array_map(
        fn($r) => public_vehicle($r, $r['d_id'] ? ['id' => $r['d_id'], 'name' => $r['d_name'], 'phone' => $r['d_phone'], 'since' => $r['a_start']] : null),
        $rows
    )];
}

function vehicle_detail(string $ownerId, string $id): array
{
    $v = find_vehicle($ownerId, $id);
    $history = query(
        'SELECT a.*, d.name AS driver_name FROM assignments a JOIN drivers d ON d.id = a.driver_id
         WHERE a.vehicle_id = ? ORDER BY a.start_date DESC, a.created_at DESC',
        [$id]
    )->fetchAll();
    $current = null;
    foreach ($history as $a) {
        if ($a['end_date'] === null) {
            $d = query('SELECT id, name, phone FROM drivers WHERE id = ?', [$a['driver_id']])->fetch();
            $current = $d + ['since' => $a['start_date']];
        }
    }
    $amounts = query(
        'SELECT amount, currency, effective_from FROM vehicle_amounts WHERE vehicle_id = ? ORDER BY effective_from DESC',
        [$id]
    )->fetchAll();
    return [
        'vehicle' => public_vehicle($v, $current),
        'assignments' => array_map('public_assignment', $history),
        'amounts' => array_map(fn($r) => [
            'amount' => (int)$r['amount'], 'currency' => $r['currency'], 'effectiveFrom' => $r['effective_from'],
        ], $amounts),
    ];
}

function vehicles_get(string $id): array
{
    $u = require_permission('vehicles.view');
    return vehicle_detail($u['owner_id'], $id);
}

function vehicles_create(): array
{
    $u = require_permission('vehicles.manage');
    $d = body();
    $f = vehicle_input($d, null);
    $amount = valid_amount($d['dailyAmount'] ?? null);
    $currency = valid_currency($d['currency'] ?? '');
    $tz = load_settings($u['owner_id'])['timezone'];
    $serviceDate = valid_date($d['serviceDate'] ?? today_for($tz), 'Date de mise en service');
    assert_plate_free($u['owner_id'], $f['plate']);

    $id = uuid();
    db()->beginTransaction();
    try {
        query(
            'INSERT INTO vehicles (id, owner_id, type, name, plate, model, daily_amount, currency, rest_weekdays,
             service_date, notes, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $u['owner_id'], $f['type'], $f['name'], $f['plate'], $f['model'], $amount, $currency,
             $f['rest_weekdays'], $serviceDate, $f['notes'], $u['id'], $u['id']]
        );
        query(
            'INSERT INTO vehicle_amounts (id, owner_id, vehicle_id, amount, currency, effective_from, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uuid(), $u['owner_id'], $id, $amount, $currency, $serviceDate, $u['id']]
        );
        audit($u['owner_id'], $u['id'], 'vehicle', $id, 'create', null, $f + ['daily_amount' => $amount, 'currency' => $currency]);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return vehicle_detail($u['owner_id'], $id);
}

/**
 * Modification. Si le montant journalier change, il s'applique à partir de `amountFrom`
 * (par défaut aujourd'hui) : les jours précédents gardent l'ancien montant.
 */
function vehicles_update(string $id): array
{
    $u = require_permission('vehicles.manage');
    $d = body();
    db()->beginTransaction();
    try {
        $old = find_vehicle($u['owner_id'], $id, true);
        $f = vehicle_input($d + ['type' => $old['type']], $old);
        assert_plate_free($u['owner_id'], $f['plate'], $id);
        $before = $old; // pour le journal
        if (array_key_exists('serviceDate', $d) && $d['serviceDate'] !== $old['service_date']) {
            $old['service_date'] = change_service_date($u, $old, (string)$d['serviceDate']);
        }
        $amount = array_key_exists('dailyAmount', $d) ? valid_amount($d['dailyAmount']) : (int)$old['daily_amount'];
        $currency = array_key_exists('currency', $d) ? valid_currency($d['currency']) : $old['currency'];

        query(
            'UPDATE vehicles SET type = ?, name = ?, plate = ?, model = ?, rest_weekdays = ?, notes = ?,
             daily_amount = ?, currency = ?, updated_by = ? WHERE id = ?',
            [$f['type'], $f['name'], $f['plate'], $f['model'], $f['rest_weekdays'], $f['notes'],
             $amount, $currency, $u['id'], $id]
        );
        if ($amount !== (int)$old['daily_amount'] || $currency !== $old['currency']) {
            $tz = load_settings($u['owner_id'])['timezone'];
            $from = valid_date($d['amountFrom'] ?? today_for($tz), 'Date du nouveau montant');
            if ($from < $old['service_date']) {
                $from = $old['service_date'];
            }
            // Remplace un éventuel changement déjà prévu le même jour, et annule ceux prévus après
            query('DELETE FROM vehicle_amounts WHERE vehicle_id = ? AND effective_from >= ?', [$id, $from]);
            query(
                'INSERT INTO vehicle_amounts (id, owner_id, vehicle_id, amount, currency, effective_from, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [uuid(), $u['owner_id'], $id, $amount, $currency, $from, $u['id']]
            );
        }
        $new = find_vehicle($u['owner_id'], $id);
        audit($u['owner_id'], $u['id'], 'vehicle', $id, 'update', audit_fields($before), audit_fields($new));
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return vehicle_detail($u['owner_id'], $id);
}

/**
 * Change la date de mise en service (à appeler DANS une transaction). Reculer : le premier montant journalier
 * s'applique dès la nouvelle date. Avancer : refusé s'il existe déjà une affectation, un versement, une marque
 * ou une immobilisation avant la nouvelle date. Retourne la nouvelle date.
 */
function change_service_date(array $u, array $v, string $value): string
{
    $service = valid_date($value, 'Date de mise en service');
    $today = today_for(load_settings($u['owner_id'])['timezone']);
    if ($service > $today) {
        throw new HttpError(422, 'La mise en service ne peut pas être dans le futur');
    }
    $id = $v['id'];
    if ($service > $v['service_date']) {
        $first = query(
            "SELECT MIN(x) FROM (
               SELECT MIN(start_date) AS x FROM assignments WHERE vehicle_id = ?
               UNION ALL SELECT MIN(a.day) FROM payment_allocations a JOIN payments p ON p.id = a.payment_id AND p.cancelled_at IS NULL WHERE a.vehicle_id = ?
               UNION ALL SELECT MIN(day) FROM day_marks WHERE vehicle_id = ? AND deleted_at IS NULL
               UNION ALL SELECT MIN(start_date) FROM breakdowns WHERE vehicle_id = ? AND deleted_at IS NULL
             ) t",
            [$id, $id, $id, $id]
        )->fetchColumn();
        if ($first && $service > $first) {
            throw new HttpError(422, "L'engin a déjà de l'activité le $first (chauffeur, versement ou journée) : la mise en service ne peut pas être après cette date");
        }
        // Montants : celui en vigueur à la nouvelle date devient le premier ; les plus anciens ne servent plus
        $keep = query('SELECT id FROM vehicle_amounts WHERE vehicle_id = ? AND effective_from <= ? ORDER BY effective_from DESC LIMIT 1', [$id, $service])->fetchColumn();
        if ($keep) {
            query('DELETE FROM vehicle_amounts WHERE vehicle_id = ? AND effective_from < ? AND id <> ?', [$id, $service, $keep]);
            query('UPDATE vehicle_amounts SET effective_from = ? WHERE id = ?', [$service, $keep]);
        }
    } else {
        // Reculer : le premier montant s'applique dès la nouvelle date
        query('UPDATE vehicle_amounts SET effective_from = ? WHERE vehicle_id = ? ORDER BY effective_from LIMIT 1', [$service, $id]);
    }
    query('UPDATE vehicles SET service_date = ?, updated_by = ? WHERE id = ?', [$service, $u['id'], $id]);
    return $service;
}

function audit_fields(array $row): array
{
    return array_diff_key($row, array_flip(['created_at', 'updated_at', 'created_by', 'updated_by', 'owner_id', 'deleted_at']));
}

/** Retire l'engin du parc (vendu, hors service…) ou le remet en service. Retirer termine l'affectation. */
function vehicles_set_status(string $id): array
{
    $u = require_permission('vehicles.manage');
    $d = body();
    $status = ($d['status'] ?? '') === 'retired' ? 'retired' : 'active';
    $tz = load_settings($u['owner_id'])['timezone'];
    $date = valid_date($d['date'] ?? today_for($tz), 'Date');
    db()->beginTransaction();
    try {
        $v = find_vehicle($u['owner_id'], $id, true);
        if ($status === 'retired' && ($a = current_assignment_of_vehicle($id))) {
            end_assignment($a, $date, $u['id']);
        }
        query('UPDATE vehicles SET status = ?, updated_by = ? WHERE id = ?', [$status, $u['id'], $id]);
        audit($u['owner_id'], $u['id'], 'vehicle', $id, 'status', ['status' => $v['status']], ['status' => $status, 'date' => $date]);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return vehicle_detail($u['owner_id'], $id);
}

function end_assignment(array $a, string $endDate, string $userId): void
{
    if ($endDate < $a['start_date']) {
        throw new HttpError(422, 'La date de fin ne peut pas précéder le début de l\'affectation (' . $a['start_date'] . ')');
    }
    query('UPDATE assignments SET end_date = ?, ended_by = ? WHERE id = ?', [$endDate, $userId, $a['id']]);
}

/**
 * Affecte un chauffeur à l'engin à partir de `startDate`.
 * Le chauffeur précédent de l'engin termine la veille. Un chauffeur ne conduit qu'un engin à la fois.
 */
function vehicles_assign(string $id): array
{
    $u = require_permission('vehicles.manage');
    $d = body();
    $tz = load_settings($u['owner_id'])['timezone'];
    $start = valid_date($d['startDate'] ?? today_for($tz), 'Date de début');
    $driverId = (string)($d['driverId'] ?? '');

    db()->beginTransaction();
    try {
        $v = find_vehicle($u['owner_id'], $id, true);
        if ($v['status'] !== 'active') {
            throw new HttpError(422, 'Cet engin est retiré du parc');
        }
        if ($start < $v['service_date']) {
            throw new HttpError(422, 'La date de début précède la mise en service de l\'engin (' . $v['service_date'] . ')');
        }
        $driver = query(
            'SELECT * FROM drivers WHERE id = ? AND owner_id = ? AND deleted_at IS NULL FOR UPDATE',
            [$driverId, $u['owner_id']]
        )->fetch();
        if (!$driver) {
            throw new HttpError(404, 'Chauffeur introuvable');
        }
        if (!$driver['active']) {
            throw new HttpError(422, 'Ce chauffeur est désactivé');
        }
        $busy = query(
            'SELECT a.*, v.name AS vehicle_name FROM assignments a JOIN vehicles v ON v.id = a.vehicle_id
             WHERE a.driver_id = ? AND a.end_date IS NULL',
            [$driverId]
        )->fetch();
        if ($busy && $busy['vehicle_id'] === $id) {
            throw new HttpError(422, "{$driver['name']} conduit déjà cet engin");
        }
        if ($busy) {
            throw new HttpError(409, "{$driver['name']} conduit déjà « {$busy['vehicle_name']} ». Retirez-le d'abord de cet engin.");
        }
        // Aucune affectation passée de ce chauffeur ne doit chevaucher la nouvelle
        $overlap = query(
            'SELECT 1 FROM assignments WHERE driver_id = ? AND end_date >= ?',
            [$driverId, $start]
        )->fetchColumn();
        if ($overlap) {
            throw new HttpError(422, 'Ce chauffeur avait déjà une affectation à cette date');
        }
        if ($current = current_assignment_of_vehicle($id)) {
            if ($start <= $current['start_date']) {
                throw new HttpError(422, 'La date de début doit être postérieure au ' . $current['start_date'] . ' (début du chauffeur actuel)');
            }
            end_assignment($current, previous_day($start), $u['id']);
        } else {
            $last = query('SELECT MAX(end_date) FROM assignments WHERE vehicle_id = ?', [$id])->fetchColumn();
            if ($last && $start <= $last) {
                throw new HttpError(422, "La date de début doit être postérieure au $last (fin du chauffeur précédent)");
            }
        }
        $aid = uuid();
        query(
            'INSERT INTO assignments (id, owner_id, vehicle_id, driver_id, start_date, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [$aid, $u['owner_id'], $id, $driverId, $start, $u['id']]
        );
        audit($u['owner_id'], $u['id'], 'assignment', $aid, 'create', null, ['vehicle' => $v['name'], 'driver' => $driver['name'], 'start' => $start]);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return vehicle_detail($u['owner_id'], $id);
}

/** Retire le chauffeur actuel de l'engin ; il conduit encore le jour `endDate` inclus. */
function vehicles_unassign(string $id): array
{
    $u = require_permission('vehicles.manage');
    $d = body();
    $tz = load_settings($u['owner_id'])['timezone'];
    $end = valid_date($d['endDate'] ?? today_for($tz), 'Date de fin');
    db()->beginTransaction();
    try {
        find_vehicle($u['owner_id'], $id, true);
        $a = current_assignment_of_vehicle($id);
        if (!$a) {
            throw new HttpError(422, "Cet engin n'a pas de chauffeur");
        }
        end_assignment($a, $end, $u['id']);
        audit($u['owner_id'], $u['id'], 'assignment', $a['id'], 'end', ['end' => null], ['end' => $end]);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return vehicle_detail($u['owner_id'], $id);
}
