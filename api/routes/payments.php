<?php
declare(strict_types=1);

// Versements, grand livre des chauffeurs, journées marquées (repos / panne / montant exceptionnel).

const PAYMENT_METHODS = ['cash', 'mobile_money', 'bank']; // driver_expense : réservé aux dépenses payées par le chauffeur
const ADVANCE_DAYS = 31; // jours à venir qu'on peut payer d'avance

/** Le chauffeur connecté (rôle chauffeur) n'accède qu'à sa propre fiche. */
function driver_access(array $u, string $driverId): array
{
    $d = query('SELECT * FROM drivers WHERE id = ? AND owner_id = ? AND deleted_at IS NULL', [$driverId, $u['owner_id']])->fetch();
    if (!$d) {
        throw new HttpError(404, 'Chauffeur introuvable');
    }
    if (!role_can($u['role'], 'drivers.view') && $d['user_id'] !== $u['id']) {
        throw new HttpError(403, "Vous n'avez pas accès à cette fiche");
    }
    return $d;
}

function public_payment(array $p): array
{
    return [
        'id' => $p['id'],
        'receiptNo' => (int)$p['receipt_no'],
        'driverId' => $p['driver_id'],
        'driverName' => $p['driver_name'] ?? null,
        'driverPhone' => $p['driver_phone'] ?? null,
        'vehicleId' => $p['vehicle_id'],
        'vehicleName' => $p['vehicle_name'] ?? null,
        'kind' => $p['kind'],
        'amount' => (int)$p['amount'],
        'currency' => $p['currency'],
        'method' => $p['method'],
        'reference' => $p['reference'],
        'paidOn' => $p['paid_on'],
        'rate' => $p['rate'] === null ? null : (float)$p['rate'],
        'note' => $p['note'],
        'createdAt' => $p['created_at'],
        'createdByName' => $p['created_by_name'] ?? null,
        'cancelled' => $p['cancelled_at'] !== null,
        'cancelReason' => $p['cancel_reason'],
    ];
}

const PAYMENT_SELECT = 'SELECT p.*, d.name AS driver_name, d.phone AS driver_phone, v.name AS vehicle_name, u.name AS created_by_name
    FROM payments p JOIN drivers d ON d.id = p.driver_id
    LEFT JOIN vehicles v ON v.id = p.vehicle_id LEFT JOIN users u ON u.id = p.created_by';

function payment_detail(string $ownerId, string $id): array
{
    $p = query(PAYMENT_SELECT . ' WHERE p.id = ? AND p.owner_id = ?', [$id, $ownerId])->fetch();
    if (!$p) {
        throw new HttpError(404, 'Versement introuvable');
    }
    $alloc = query(
        'SELECT a.day, a.vehicle_id, a.amount, a.currency, v.name AS vehicle_name FROM payment_allocations a
         JOIN vehicles v ON v.id = a.vehicle_id WHERE a.payment_id = ? ORDER BY a.day',
        [$id]
    )->fetchAll();
    return public_payment($p) + ['allocations' => array_map(fn($a) => [
        'date' => $a['day'], 'vehicleId' => $a['vehicle_id'], 'vehicleName' => $a['vehicle_name'],
        'amount' => (int)$a['amount'], 'currency' => $a['currency'],
    ], $alloc)];
}

/** Grand livre + résumé d'un chauffeur : du premier jour d'affectation jusqu'à aujourd'hui + 31 jours. */
function ledger_payload(array $u, array $driver): array
{
    $s = load_settings($u['owner_id']);
    $today = today_for($s['timezone']);
    $first = driver_first_day($driver['id']);
    $days = $first ? driver_ledger($s, $driver['id'], $first, add_days($today, ADVANCE_DAYS)) : [];
    $payments = query(PAYMENT_SELECT . ' WHERE p.driver_id = ? ORDER BY p.paid_on DESC, p.receipt_no DESC LIMIT 30', [$driver['id']])->fetchAll();
    return [
        'driver' => ['id' => $driver['id'], 'name' => $driver['name'], 'phone' => $driver['phone']],
        'today' => $today,
        'days' => $days,
        'summary' => summarize_ledger($days, $today),
        'rate' => public_rate(effective_rate($u['owner_id'], $s['rate_mode'], false)),
        'payments' => array_map('public_payment', $payments),
    ];
}

function drivers_ledger(string $id): array
{
    $u = require_user();
    return ledger_payload($u, driver_access($u, $id));
}

/** Pour le chauffeur connecté : sa propre situation. */
function me_ledger(): array
{
    $u = require_permission('dashboard.own');
    $d = query('SELECT * FROM drivers WHERE user_id = ? AND deleted_at IS NULL', [$u['id']])->fetch();
    if (!$d) {
        throw new HttpError(404, 'Aucune fiche chauffeur liée à ce compte');
    }
    return ledger_payload($u, $d);
}

function payments_list(): array
{
    $u = require_permission('payments.view');
    $s = load_settings($u['owner_id']);
    $date = valid_date($_GET['date'] ?? today_for($s['timezone']), 'Date');
    $rows = query(PAYMENT_SELECT . ' WHERE p.owner_id = ? AND p.paid_on = ? ORDER BY p.receipt_no DESC', [$u['owner_id'], $date])->fetchAll();
    return ['date' => $date, 'payments' => array_map('public_payment', $rows)];
}

function payments_get(string $id): array
{
    $u = require_user();
    $p = payment_detail($u['owner_id'], $id);
    if (!role_can($u['role'], 'payments.view')) {
        driver_access($u, $p['driverId']); // un chauffeur ne voit que ses reçus
    }
    $p['ownerName'] = query('SELECT name FROM owners WHERE id = ?', [$u['owner_id']])->fetchColumn();
    return $p;
}

/**
 * Enregistre un versement. Idempotent : si l'id existe déjà (renvoi après coupure réseau), on renvoie l'existant.
 * daily : `days` = journées choisies dans l'ordre ; le montant doit être entièrement réparti (dernière journée partielle possible).
 * extra : versement hors journalier, ne paie aucune journée.
 */
function payments_create(): array
{
    $u = require_permission('payments.create');
    $d = body();
    $method = (string)($d['method'] ?? '');
    if (!in_array($method, PAYMENT_METHODS, true)) {
        throw new HttpError(422, 'Choisissez le mode de paiement : espèces, Mobile Money ou banque');
    }
    $existing = existing_payment($u, (string)($d['id'] ?? ''));
    if ($existing) {
        return $existing;
    }
    db()->beginTransaction();
    try {
        $id = record_payment($u, $d, $method);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return payment_detail($u['owner_id'], $id);
}

/** Si ce versement (même id généré par l'appareil) existe déjà, le renvoie : pas de doublon. */
function existing_payment(array $u, string $id): ?array
{
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id)) {
        throw new HttpError(422, 'Identifiant invalide');
    }
    $owner = query('SELECT owner_id FROM payments WHERE id = ?', [$id])->fetchColumn();
    if ($owner === false) {
        return null;
    }
    if ($owner !== $u['owner_id']) {
        throw new HttpError(409, 'Identifiant déjà utilisé');
    }
    return payment_detail($u['owner_id'], $id);
}

/**
 * Enregistre un versement (à appeler DANS une transaction). Retourne son id.
 * $method : cash | mobile_money | bank, ou driver_expense (dépense payée par le chauffeur, sans entrée en caisse).
 */
function record_payment(array $u, array $d, string $method): string
{
    $id = (string)$d['id'];
    $kind = ($d['kind'] ?? '') === 'extra' ? 'extra' : 'daily';
    $amount = (int)($d['amount'] ?? 0);
    if (!is_int($d['amount'] ?? null) || $amount <= 0 || $amount > MAX_AMOUNT) {
        throw new HttpError(422, 'Montant invalide');
    }
    $currency = valid_currency($d['currency'] ?? '');
    $s = load_settings($u['owner_id']);
    $today = today_for($s['timezone']);
    $paidOn = valid_date($d['paidOn'] ?? $today, 'Date du versement');
    if ($paidOn > $today) {
        throw new HttpError(422, "La date de réception ne peut pas être dans le futur");

    }
    $note = optional_string($d, 'note', 255);
    if ($kind === 'extra' && $note === null) {
        throw new HttpError(422, 'Indiquez le motif du versement exceptionnel');
    }
    $reference = optional_string($d, 'reference', 80);
    $rateRow = effective_rate($u['owner_id'], $s['rate_mode'], false);
    $rate = $rateRow ? (float)$rateRow['rate'] : null;

    {
        $driver = query(
            'SELECT * FROM drivers WHERE id = ? AND owner_id = ? AND deleted_at IS NULL FOR UPDATE',
            [(string)($d['driverId'] ?? ''), $u['owner_id']]
        )->fetch();
        if (!$driver) {
            throw new HttpError(404, 'Chauffeur introuvable');
        }

        $allocations = [];
        $vehicleId = null;
        if ($kind === 'daily') {
            $chosen = array_values((array)($d['days'] ?? []));
            if (!$chosen) {
                throw new HttpError(422, 'Choisissez au moins une journée à payer');
            }
            $dates = array_map(fn($x) => valid_date($x['date'] ?? '', 'Journée'), $chosen);
            $maxDay = add_days($today, ADVANCE_DAYS);
            if (max($dates) > $maxDay) {
                throw new HttpError(422, 'On ne peut pas payer plus de ' . ADVANCE_DAYS . " jours d'avance");
            }
            // Le grand livre (verrouillé par le FOR UPDATE sur le chauffeur) donne le reste dû de chaque journée
            $ledger = [];
            foreach (driver_ledger($s, $driver['id'], min($dates), max($dates)) as $day) {
                $ledger[$day['vehicleId'] . '|' . $day['date']] = $day;
            }
            $selected = [];
            foreach ($chosen as $i => $x) {
                $key = ((string)($x['vehicleId'] ?? '')) . '|' . $dates[$i];
                $day = $ledger[$key] ?? null;
                if (!$day) {
                    throw new HttpError(422, "Le {$dates[$i]}, ce chauffeur ne conduisait pas cet engin");
                }
                if ($day['remaining'] <= 0) {
                    throw new HttpError(422, "La journée du {$dates[$i]} ne doit rien (déjà payée, repos ou panne)");
                }
                $selected[$key] = $day;
            }
            [$allocations, $leftover] = allocate_payment($amount, $currency, $rate, array_values($selected));
            if ($leftover > 0) {
                throw new HttpError(422, 'Le montant dépasse ce qui reste dû sur les journées choisies (surplus : '
                    . $leftover . ' ' . $currency . '). Choisissez une journée de plus, ou enregistrez le surplus comme versement exceptionnel.');
            }
            if (count($allocations) < count($selected)) {
                throw new HttpError(422, "Le montant ne suffit pas pour toutes les journées choisies : décochez la ou les dernières");
            }
            $vehicleId = $allocations[0]['vehicleId'];
        } else {
            $vehicleId = query('SELECT vehicle_id FROM assignments WHERE driver_id = ? AND end_date IS NULL', [$driver['id']])->fetchColumn() ?: null;
        }

        // Numéro de reçu séquentiel : verrou sur le propriétaire pour éviter deux numéros identiques
        query('SELECT id FROM owners WHERE id = ? FOR UPDATE', [$u['owner_id']]);
        $no = (int)query('SELECT COALESCE(MAX(receipt_no), 0) + 1 FROM payments WHERE owner_id = ?', [$u['owner_id']])->fetchColumn();
        query(
            'INSERT INTO payments (id, owner_id, receipt_no, driver_id, vehicle_id, kind, amount, currency, method, reference, paid_on, rate, note, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $u['owner_id'], $no, $driver['id'], $vehicleId, $kind, $amount, $currency, $method, $reference, $paidOn,
             $rate === null ? null : number_format($rate, 6, '.', ''), $note, $u['id']]
        );
        foreach ($allocations as $a) {
            query(
                'INSERT INTO payment_allocations (owner_id, payment_id, driver_id, vehicle_id, day, amount, currency) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$u['owner_id'], $id, $driver['id'], $a['vehicleId'], $a['date'], $a['amount'], $a['currency']]
            );
        }
        audit($u['owner_id'], $u['id'], 'payment', $id, 'create', null, [
            'receipt' => $no, 'driver' => $driver['name'], 'kind' => $kind, 'amount' => $amount, 'currency' => $currency,
            'method' => $method, 'paidOn' => $paidOn, 'days' => array_column($allocations, 'date'),
        ]);
    }
    return $id;
}

/** Annule un versement (motif obligatoire) : les journées qu'il payait redeviennent dues. */
function payments_cancel(string $id): array
{
    $u = require_permission('payments.edit');
    $reason = required_string(body(), 'reason', "Le motif d'annulation", 255);
    db()->beginTransaction();
    try {
        $p = query('SELECT * FROM payments WHERE id = ? AND owner_id = ? FOR UPDATE', [$id, $u['owner_id']])->fetch();
        if (!$p) {
            throw new HttpError(404, 'Versement introuvable');
        }
        if ($p['cancelled_at'] !== null) {
            throw new HttpError(422, 'Ce versement est déjà annulé');
        }
        query('UPDATE payments SET cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ?', [now_utc(), $u['id'], $reason, $id]);
        audit($u['owner_id'], $u['id'], 'payment', $id, 'cancel', ['cancelled' => false], ['cancelled' => true, 'reason' => $reason]);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return payment_detail($u['owner_id'], $id);
}

/**
 * Marque une journée d'un engin : repos, panne, montant exceptionnel, ou retire la marque (clear).
 * Refusé si les versements déjà reçus pour ce jour dépassent le nouveau montant attendu.
 */
function vehicles_mark_day(string $id): array
{
    $u = require_permission('days.mark');
    $d = body();
    $s = load_settings($u['owner_id']);
    $date = valid_date($d['date'] ?? '', 'Date');
    $kind = (string)($d['kind'] ?? '');
    if (!in_array($kind, ['rest', 'breakdown', 'override', 'clear'], true)) {
        throw new HttpError(422, 'Type de journée invalide');
    }
    $reason = optional_string($d, 'reason', 255);
    db()->beginTransaction();
    try {
        $v = find_vehicle($u['owner_id'], $id, true);
        if ($date < $v['service_date']) {
            throw new HttpError(422, "Cette date précède la mise en service de l'engin");
        }
        $amount = null;
        $currency = null;
        if ($kind === 'override') {
            $amount = valid_amount($d['amount'] ?? null);
            $currency = valid_currency($d['currency'] ?? $v['currency']);
            if ($reason === null) {
                throw new HttpError(422, 'Indiquez la raison du montant exceptionnel');
            }
        }
        $old = query('SELECT * FROM day_marks WHERE vehicle_id = ? AND day = ? FOR UPDATE', [$id, $date])->fetch() ?: null;
        $activeOld = ($old && $old['deleted_at'] === null) ? $old : null;

        // Nouveau montant attendu ce jour-là
        $v['amounts'] = query('SELECT amount, currency, effective_from FROM vehicle_amounts WHERE vehicle_id = ? ORDER BY effective_from', [$id])->fetchAll();
        $newMark = $kind === 'clear' ? null : ['kind' => $kind, 'amount' => $amount, 'currency' => $currency];
        if ($kind === 'clear' && query(
            'SELECT 1 FROM breakdowns WHERE vehicle_id = ? AND deleted_at IS NULL AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)',
            [$id, $date, $date]
        )->fetchColumn()) {
            $newMark = ['kind' => 'breakdown', 'amount' => null, 'currency' => null];
        }
        $e = expected_for($v, $date, json_decode($s['rest_weekdays'], true) ?: [], $newMark);
        $paid = (int)query(
            'SELECT COALESCE(SUM(a.amount), 0) FROM payment_allocations a JOIN payments p ON p.id = a.payment_id AND p.cancelled_at IS NULL
             WHERE a.vehicle_id = ? AND a.day = ?',
            [$id, $date]
        )->fetchColumn();
        if ($paid > $e['expected']) {
            throw new HttpError(422, 'Des versements ont déjà été reçus pour ce jour (' . $paid . ' ' . $e['currency']
                . ') : annulez-les d\'abord ou choisissez un montant au moins égal');
        }

        $markId = $old['id'] ?? uuid();
        if ($kind === 'clear') {
            if ($activeOld) {
                query('UPDATE day_marks SET deleted_at = ?, updated_by = ? WHERE id = ?', [now_utc(), $u['id'], $old['id']]);
            }
        } elseif ($old) {
            query(
                'UPDATE day_marks SET kind = ?, amount = ?, currency = ?, reason = ?, updated_by = ?, deleted_at = NULL WHERE id = ?',
                [$kind, $amount, $currency, $reason, $u['id'], $old['id']]
            );
        } else {
            query(
                'INSERT INTO day_marks (id, owner_id, vehicle_id, day, kind, amount, currency, reason, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$markId, $u['owner_id'], $id, $date, $kind, $amount, $currency, $reason, $u['id'], $u['id']]
            );
        }
        audit(
            $u['owner_id'], $u['id'], 'day_mark', $markId, 'set',
            $activeOld ? ['vehicle' => $v['name'], 'date' => $date, 'kind' => $activeOld['kind'], 'amount' => $activeOld['amount'], 'reason' => $activeOld['reason']] : null,
            $kind === 'clear' ? null : ['vehicle' => $v['name'], 'date' => $date, 'kind' => $kind, 'amount' => $amount, 'currency' => $currency, 'reason' => $reason]
        );
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return vehicles_days($id);
}

/** Journées d'un engin (vue par engin) : chauffeur du jour, attendu, payé, marque. 30 derniers jours + 7 à venir par défaut. */
function vehicles_days(string $id): array
{
    $u = require_permission('vehicles.view');
    $s = load_settings($u['owner_id']);
    $v = find_vehicle($u['owner_id'], $id);
    $today = today_for($s['timezone']);
    $from = valid_date($_GET['from'] ?? add_days($today, -30), 'Début');
    $to = valid_date($_GET['to'] ?? add_days($today, 7), 'Fin');
    if ($from < $v['service_date']) {
        $from = $v['service_date'];
    }
    $v = ledger_vehicles([$id])[$id];
    $marks = load_marks([$id], $from, $to);
    $paid = paid_by_day('vehicle_id', $id, $from, $to);
    $assignments = query(
        'SELECT a.*, d.name AS driver_name FROM assignments a JOIN drivers d ON d.id = a.driver_id
         WHERE a.vehicle_id = ? AND a.start_date <= ? AND (a.end_date IS NULL OR a.end_date >= ?)',
        [$id, $to, $from]
    )->fetchAll();
    $defaultRest = json_decode($s['rest_weekdays'], true) ?: [];
    $days = [];
    for ($d = $from; $d <= $to; $d = add_days($d, 1)) {
        $driver = null;
        foreach ($assignments as $a) {
            if ($a['start_date'] <= $d && ($a['end_date'] === null || $a['end_date'] >= $d)) {
                $driver = ['id' => $a['driver_id'], 'name' => $a['driver_name']];
            }
        }
        $key = $id . '|' . $d;
        $mark = $marks[$key] ?? null;
        $e = expected_for($v, $d, $defaultRest, $mark);
        $expected = $driver ? $e['expected'] : 0; // sans chauffeur, rien n'est dû
        $p = $paid[$key] ?? 0;
        $remaining = max($expected - $p, 0);
        $days[] = [
            'date' => $d, 'driver' => $driver, 'kind' => $driver || $e['kind'] !== 'due' ? $e['kind'] : 'no_driver',
            'expected' => $expected, 'currency' => $e['currency'], 'paid' => $p, 'remaining' => $remaining,
            'state' => pay_state($expected, $p, $remaining),
            'breakdownId' => $mark['breakdown_id'] ?? null,
            'mark' => ($mark && !isset($mark['breakdown_id'])) ? ['kind' => $mark['kind'], 'amount' => $mark['amount'] === null ? null : (int)$mark['amount'], 'currency' => $mark['currency'], 'reason' => $mark['reason']] : null,
        ];
    }
    return ['vehicleId' => $id, 'today' => $today, 'days' => array_reverse($days)];
}
