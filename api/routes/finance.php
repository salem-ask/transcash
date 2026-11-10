<?php
declare(strict_types=1);

// Phase 4 : dépenses, caisse (retraits / apports), immobilisations, échéances, journal d'activité.
// Pas de clôture : tout reste modifiable, chaque modification est tracée dans audit_log.

const EXPENSE_CATEGORIES = ['fuel', 'repair', 'parts', 'maintenance', 'tax', 'insurance', 'fine', 'salary', 'other'];
const REMINDER_KINDS = ['insurance', 'vignette', 'oil_change', 'inspection', 'other'];

function valid_uuid(mixed $v, string $label = 'Identifiant'): string
{
    $v = (string)$v;
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $v)) {
        throw new HttpError(422, "$label invalide");
    }
    return strtolower($v);
}

function money_input(array $d): array
{
    $amount = $d['amount'] ?? null;
    if (!is_int($amount) || $amount <= 0 || $amount > MAX_AMOUNT) {
        throw new HttpError(422, 'Montant invalide');
    }
    return [$amount, valid_currency($d['currency'] ?? '')];
}

function owner_vehicle_or_null(array $u, mixed $vehicleId): ?array
{
    if ($vehicleId === null || $vehicleId === '') {
        return null;
    }
    return find_vehicle($u['owner_id'], (string)$vehicleId);
}

function current_rate_value(array $u): ?float
{
    $s = load_settings($u['owner_id']);
    $r = effective_rate($u['owner_id'], $s['rate_mode'], false);
    return $r ? (float)$r['rate'] : null;
}

// ---------------------------------------------------------------- Dépenses

const EXPENSE_SELECT = 'SELECT e.*, v.name AS vehicle_name, d.name AS driver_name, u.name AS created_by_name
    FROM expenses e LEFT JOIN vehicles v ON v.id = e.vehicle_id LEFT JOIN drivers d ON d.id = e.driver_id
    LEFT JOIN users u ON u.id = e.created_by';

function public_expense(array $e): array
{
    return [
        'id' => $e['id'],
        'vehicleId' => $e['vehicle_id'],
        'vehicleName' => $e['vehicle_name'] ?? null,
        'breakdownId' => $e['breakdown_id'],
        'category' => $e['category'],
        'amount' => (int)$e['amount'],
        'currency' => $e['currency'],
        'spentOn' => $e['spent_on'],
        'paidBy' => $e['paid_by'],
        'driverId' => $e['driver_id'],
        'driverName' => $e['driver_name'] ?? null,
        'paymentId' => $e['payment_id'],
        'supplier' => $e['supplier'],
        'note' => $e['note'],
        'rate' => $e['rate'] === null ? null : (float)$e['rate'],
        'createdByName' => $e['created_by_name'] ?? null,
        'createdAt' => $e['created_at'],
        'cancelled' => $e['cancelled_at'] !== null,
        'cancelReason' => $e['cancel_reason'],
    ];
}

function expense_detail(string $ownerId, string $id): array
{
    $e = query(EXPENSE_SELECT . ' WHERE e.id = ? AND e.owner_id = ?', [$id, $ownerId])->fetch();
    if (!$e) {
        throw new HttpError(404, 'Dépense introuvable');
    }
    return public_expense($e);
}

function expenses_list(): array
{
    $u = require_permission('expenses.manage');
    $s = load_settings($u['owner_id']);
    $today = today_for($s['timezone']);
    $from = valid_date($_GET['from'] ?? substr($today, 0, 8) . '01', 'Début');
    $to = valid_date($_GET['to'] ?? $today, 'Fin');
    $sql = EXPENSE_SELECT . ' WHERE e.owner_id = ? AND e.spent_on BETWEEN ? AND ?';
    $params = [$u['owner_id'], $from, $to];
    if (!empty($_GET['vehicleId'])) {
        $sql .= ' AND e.vehicle_id = ?';
        $params[] = (string)$_GET['vehicleId'];
    }
    $rows = query($sql . ' ORDER BY e.spent_on DESC, e.created_at DESC', $params)->fetchAll();
    $totals = [];
    foreach ($rows as $r) {
        if ($r['cancelled_at'] === null) {
            $totals[$r['currency']] = ($totals[$r['currency']] ?? 0) + (int)$r['amount'];
        }
    }
    return ['from' => $from, 'to' => $to, 'expenses' => array_map('public_expense', $rows), 'totals' => (object)$totals];
}

/** Champs communs (catégorie, engin, immobilisation liée, fournisseur, note). */
function expense_fields(array $u, array $d): array
{
    $category = (string)($d['category'] ?? '');
    if (!in_array($category, EXPENSE_CATEGORIES, true)) {
        throw new HttpError(422, 'Choisissez une catégorie de dépense');
    }
    $vehicle = owner_vehicle_or_null($u, $d['vehicleId'] ?? null);
    $breakdownId = null;
    if (!empty($d['breakdownId'])) {
        $b = query('SELECT * FROM breakdowns WHERE id = ? AND owner_id = ? AND deleted_at IS NULL', [(string)$d['breakdownId'], $u['owner_id']])->fetch();
        if (!$b || ($vehicle && $b['vehicle_id'] !== $vehicle['id'])) {
            throw new HttpError(422, 'Immobilisation introuvable pour cet engin');
        }
        $breakdownId = $b['id'];
        $vehicle = $vehicle ?? find_vehicle($u['owner_id'], $b['vehicle_id']);
    }
    return [
        'category' => $category,
        'vehicle_id' => $vehicle['id'] ?? null,
        'breakdown_id' => $breakdownId,
        'supplier' => optional_string($d, 'supplier', 150),
        'note' => optional_string($d, 'note', 255),
    ];
}

/**
 * Nouvelle dépense. paidBy = cash : sortie de caisse.
 * paidBy = driver : le chauffeur l'a payée lui-même ; elle compte comme un versement sur les journées choisies.
 */
function expenses_create(): array
{
    $u = require_permission('expenses.manage');
    $d = body();
    $id = valid_uuid($d['id'] ?? '');
    $existing = query('SELECT owner_id FROM expenses WHERE id = ?', [$id])->fetchColumn();
    if ($existing !== false) {
        if ($existing !== $u['owner_id']) {
            throw new HttpError(409, 'Identifiant déjà utilisé');
        }
        return expense_detail($u['owner_id'], $id);
    }
    $f = expense_fields($u, $d);
    [$amount, $currency] = money_input($d);
    $s = load_settings($u['owner_id']);
    $today = today_for($s['timezone']);
    $spentOn = valid_date($d['spentOn'] ?? $today, 'Date de la dépense');
    if ($spentOn > $today) {
        throw new HttpError(422, 'La date de la dépense ne peut pas être dans le futur');
    }
    $paidBy = ($d['paidBy'] ?? 'cash') === 'driver' ? 'driver' : 'cash';

    db()->beginTransaction();
    try {
        $driverId = null;
        $paymentId = null;
        if ($paidBy === 'driver') {
            if (!role_can($u['role'], 'payments.create')) {
                throw new HttpError(403, "Vous n'avez pas le droit d'enregistrer un versement");
            }
            $driverId = (string)($d['driverId'] ?? '');
            $paymentId = uuid();
            $label = 'Dépense payée par le chauffeur' . ($f['note'] ? ' : ' . $f['note'] : '');
            record_payment($u, [
                'id' => $paymentId, 'driverId' => $driverId, 'kind' => 'daily', 'amount' => $amount, 'currency' => $currency,
                'paidOn' => $spentOn, 'days' => $d['days'] ?? [], 'note' => mb_substr($label, 0, 255),
            ], 'driver_expense');
            if ($f['vehicle_id'] === null) {
                $f['vehicle_id'] = query('SELECT vehicle_id FROM payments WHERE id = ?', [$paymentId])->fetchColumn() ?: null;
            }
        }
        query(
            'INSERT INTO expenses (id, owner_id, vehicle_id, breakdown_id, category, amount, currency, spent_on, paid_by, driver_id, payment_id, supplier, note, rate, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $u['owner_id'], $f['vehicle_id'], $f['breakdown_id'], $f['category'], $amount, $currency, $spentOn, $paidBy,
             $driverId, $paymentId, $f['supplier'], $f['note'], current_rate_value($u), $u['id'], $u['id']]
        );
        audit($u['owner_id'], $u['id'], 'expense', $id, 'create', null, $f + compact('amount', 'currency', 'spentOn', 'paidBy'));
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return expense_detail($u['owner_id'], $id);
}

/** Modification (tracée). Une dépense payée par le chauffeur ne change ni de montant ni de date : annulez-la et refaites-la. */
function expenses_update(string $id): array
{
    $u = require_permission('expenses.manage');
    $d = body();
    db()->beginTransaction();
    try {
        $old = query('SELECT * FROM expenses WHERE id = ? AND owner_id = ? FOR UPDATE', [$id, $u['owner_id']])->fetch();
        if (!$old) {
            throw new HttpError(404, 'Dépense introuvable');
        }
        if ($old['cancelled_at'] !== null) {
            throw new HttpError(422, 'Cette dépense est annulée');
        }
        $f = expense_fields($u, $d + ['vehicleId' => $old['vehicle_id']]);
        if ($old['paid_by'] === 'driver') {
            $amount = (int)$old['amount'];
            $currency = $old['currency'];
            $spentOn = $old['spent_on'];
            if ((isset($d['amount']) && $d['amount'] !== $amount) || (isset($d['currency']) && $d['currency'] !== $currency) || (isset($d['spentOn']) && $d['spentOn'] !== $spentOn)) {
                throw new HttpError(422, 'Dépense payée par le chauffeur : pour changer le montant ou la date, annulez-la puis saisissez-la à nouveau');
            }
            $f['vehicle_id'] = $old['vehicle_id'];
        } else {
            [$amount, $currency] = money_input($d);
            $s = load_settings($u['owner_id']);
            $spentOn = valid_date($d['spentOn'] ?? $old['spent_on'], 'Date de la dépense');
            if ($spentOn > today_for($s['timezone'])) {
                throw new HttpError(422, 'La date de la dépense ne peut pas être dans le futur');
            }
        }
        query(
            'UPDATE expenses SET vehicle_id = ?, breakdown_id = ?, category = ?, amount = ?, currency = ?, spent_on = ?, supplier = ?, note = ?, updated_by = ? WHERE id = ?',
            [$f['vehicle_id'], $f['breakdown_id'], $f['category'], $amount, $currency, $spentOn, $f['supplier'], $f['note'], $u['id'], $id]
        );
        $new = query('SELECT * FROM expenses WHERE id = ?', [$id])->fetch();
        audit($u['owner_id'], $u['id'], 'expense', $id, 'update', audit_fields($old), audit_fields($new));
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return expense_detail($u['owner_id'], $id);
}

function expenses_cancel(string $id): array
{
    $u = require_permission('expenses.manage');
    $reason = required_string(body(), 'reason', "Le motif d'annulation", 255);
    db()->beginTransaction();
    try {
        $e = query('SELECT * FROM expenses WHERE id = ? AND owner_id = ? FOR UPDATE', [$id, $u['owner_id']])->fetch();
        if (!$e) {
            throw new HttpError(404, 'Dépense introuvable');
        }
        if ($e['cancelled_at'] !== null) {
            throw new HttpError(422, 'Cette dépense est déjà annulée');
        }
        query('UPDATE expenses SET cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ?', [now_utc(), $u['id'], $reason, $id]);
        if ($e['payment_id']) {
            // Le versement correspondant est annulé aussi : les journées redeviennent dues
            query('UPDATE payments SET cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ? AND cancelled_at IS NULL',
                [now_utc(), $u['id'], "Dépense annulée : $reason", $e['payment_id']]);
        }
        audit($u['owner_id'], $u['id'], 'expense', $id, 'cancel', ['cancelled' => false], ['cancelled' => true, 'reason' => $reason]);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return expense_detail($u['owner_id'], $id);
}

// ---------------------------------------------------------------- Caisse

function public_movement(array $m): array
{
    return [
        'id' => $m['id'], 'kind' => $m['kind'], 'amount' => (int)$m['amount'], 'currency' => $m['currency'],
        'movedOn' => $m['moved_on'], 'note' => $m['note'], 'createdByName' => $m['created_by_name'] ?? null,
        'cancelled' => $m['cancelled_at'] !== null, 'cancelReason' => $m['cancel_reason'],
    ];
}

/** Toutes les écritures de caisse (non annulées) jusqu'à une date : versements reçus, dépenses de caisse, retraits, apports. */
function cash_entries(string $ownerId, ?string $from, string $to): array
{
    $range = $from ? ' BETWEEN ? AND ?' : ' <= ?';
    $p = $from ? [$ownerId, $from, $to] : [$ownerId, $to];
    $entries = [];
    foreach (query(
        "SELECT p.id, p.paid_on AS day, p.amount, p.currency, p.receipt_no, p.kind, p.method, d.name AS who FROM payments p
         JOIN drivers d ON d.id = p.driver_id WHERE p.owner_id = ? AND p.cancelled_at IS NULL AND p.method <> 'driver_expense' AND p.paid_on$range",
        $p
    )->fetchAll() as $r) {
        $entries[] = ['type' => 'payment', 'id' => $r['id'], 'date' => $r['day'], 'direction' => 'in', 'amount' => (int)$r['amount'],
            'currency' => $r['currency'], 'label' => $r['who'], 'method' => $r['method'], 'receiptNo' => (int)$r['receipt_no'], 'note' => null];
    }
    foreach (query(
        "SELECT e.id, e.spent_on AS day, e.amount, e.currency, e.category, e.note, v.name AS vehicle FROM expenses e
         LEFT JOIN vehicles v ON v.id = e.vehicle_id WHERE e.owner_id = ? AND e.cancelled_at IS NULL AND e.paid_by = 'cash' AND e.spent_on$range",
        $p
    )->fetchAll() as $r) {
        $entries[] = ['type' => 'expense', 'id' => $r['id'], 'date' => $r['day'], 'direction' => 'out', 'amount' => (int)$r['amount'],
            'currency' => $r['currency'], 'label' => $r['vehicle'], 'category' => $r['category'], 'note' => $r['note']];
    }
    foreach (query(
        "SELECT id, moved_on AS day, amount, currency, kind, note FROM cash_movements WHERE owner_id = ? AND cancelled_at IS NULL AND moved_on$range",
        $p
    )->fetchAll() as $r) {
        $entries[] = ['type' => $r['kind'], 'id' => $r['id'], 'date' => $r['day'], 'direction' => $r['kind'] === 'deposit' ? 'in' : 'out',
            'amount' => (int)$r['amount'], 'currency' => $r['currency'], 'label' => null, 'note' => $r['note']];
    }
    usort($entries, fn($a, $b) => strcmp($b['date'], $a['date']));
    return $entries;
}

function balance_of(array $entries): array
{
    $b = ['CDF' => 0, 'USD' => 0];
    foreach ($entries as $e) {
        $b[$e['currency']] += $e['direction'] === 'in' ? $e['amount'] : -$e['amount'];
    }
    return $b;
}

/** Caisse : solde actuel (FC et $), solde au début de la période, écritures de la période. */
function cash_get(): array
{
    $u = require_permission('cash.manage');
    $s = load_settings($u['owner_id']);
    $today = today_for($s['timezone']);
    $from = valid_date($_GET['from'] ?? add_days($today, -30), 'Début');
    $to = valid_date($_GET['to'] ?? $today, 'Fin');
    $period = cash_entries($u['owner_id'], $from, $to);
    $in = $out = ['CDF' => 0, 'USD' => 0];
    foreach ($period as $e) {
        $e['direction'] === 'in' ? $in[$e['currency']] += $e['amount'] : $out[$e['currency']] += $e['amount'];
    }
    $movements = query(
        'SELECT m.*, u.name AS created_by_name FROM cash_movements m LEFT JOIN users u ON u.id = m.created_by
         WHERE m.owner_id = ? AND m.moved_on BETWEEN ? AND ? ORDER BY m.moved_on DESC, m.created_at DESC',
        [$u['owner_id'], $from, $to]
    )->fetchAll();
    return [
        'from' => $from, 'to' => $to,
        'balance' => balance_of(cash_entries($u['owner_id'], null, $today)),
        'opening' => balance_of(cash_entries($u['owner_id'], null, add_days($from, -1))),
        'totalIn' => $in, 'totalOut' => $out,
        'entries' => $period,
        'movements' => array_map('public_movement', $movements),
    ];
}

function movement_input(array $d, array $s): array
{
    $kind = ($d['kind'] ?? '') === 'deposit' ? 'deposit' : 'withdrawal';
    [$amount, $currency] = money_input($d);
    $movedOn = valid_date($d['movedOn'] ?? today_for($s['timezone']), 'Date');
    if ($movedOn > today_for($s['timezone'])) {
        throw new HttpError(422, 'La date ne peut pas être dans le futur');
    }
    return ['kind' => $kind, 'amount' => $amount, 'currency' => $currency, 'moved_on' => $movedOn, 'note' => optional_string($d, 'note', 255)];
}

function cash_movement_create(): array
{
    $u = require_permission('cash.manage');
    $d = body();
    $id = valid_uuid($d['id'] ?? '');
    if (!query('SELECT 1 FROM cash_movements WHERE id = ?', [$id])->fetchColumn()) {
        $m = movement_input($d, load_settings($u['owner_id']));
        query(
            'INSERT INTO cash_movements (id, owner_id, kind, amount, currency, moved_on, note, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$id, $u['owner_id'], $m['kind'], $m['amount'], $m['currency'], $m['moved_on'], $m['note'], $u['id'], $u['id']]
        );
        audit($u['owner_id'], $u['id'], 'cash_movement', $id, 'create', null, $m);
    }
    return cash_get();
}

function cash_movement_update(string $id): array
{
    $u = require_permission('cash.manage');
    $old = query('SELECT * FROM cash_movements WHERE id = ? AND owner_id = ?', [$id, $u['owner_id']])->fetch();
    if (!$old || $old['cancelled_at'] !== null) {
        throw new HttpError(404, 'Mouvement introuvable ou annulé');
    }
    $m = movement_input(body() + ['kind' => $old['kind']], load_settings($u['owner_id']));
    query('UPDATE cash_movements SET kind = ?, amount = ?, currency = ?, moved_on = ?, note = ?, updated_by = ? WHERE id = ?',
        [$m['kind'], $m['amount'], $m['currency'], $m['moved_on'], $m['note'], $u['id'], $id]);
    audit($u['owner_id'], $u['id'], 'cash_movement', $id, 'update', audit_fields($old), $m);
    return cash_get();
}

function cash_movement_cancel(string $id): array
{
    $u = require_permission('cash.manage');
    $reason = required_string(body(), 'reason', "Le motif d'annulation", 255);
    $old = query('SELECT * FROM cash_movements WHERE id = ? AND owner_id = ?', [$id, $u['owner_id']])->fetch();
    if (!$old || $old['cancelled_at'] !== null) {
        throw new HttpError(404, 'Mouvement introuvable ou déjà annulé');
    }
    query('UPDATE cash_movements SET cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ?', [now_utc(), $u['id'], $reason, $id]);
    audit($u['owner_id'], $u['id'], 'cash_movement', $id, 'cancel', ['cancelled' => false], ['cancelled' => true, 'reason' => $reason]);
    return cash_get();
}

// ---------------------------------------------------------------- Immobilisations

function public_breakdown(array $b): array
{
    return [
        'id' => $b['id'], 'vehicleId' => $b['vehicle_id'], 'vehicleName' => $b['vehicle_name'] ?? null,
        'startDate' => $b['start_date'], 'endDate' => $b['end_date'], 'reason' => $b['reason'],
        'expenses' => isset($b['exp_cdf']) ? (object)array_filter(['CDF' => (int)$b['exp_cdf'], 'USD' => (int)$b['exp_usd']]) : (object)[],
        'cancelled' => $b['deleted_at'] !== null, 'cancelReason' => $b['cancel_reason'],
    ];
}

const BREAKDOWN_SELECT = "SELECT b.*, v.name AS vehicle_name,
    (SELECT COALESCE(SUM(amount), 0) FROM expenses e WHERE e.breakdown_id = b.id AND e.cancelled_at IS NULL AND e.currency = 'CDF') AS exp_cdf,
    (SELECT COALESCE(SUM(amount), 0) FROM expenses e WHERE e.breakdown_id = b.id AND e.cancelled_at IS NULL AND e.currency = 'USD') AS exp_usd
    FROM breakdowns b JOIN vehicles v ON v.id = b.vehicle_id";

function breakdowns_of_vehicle(string $vehicleId): array
{
    return array_map('public_breakdown', query(BREAKDOWN_SELECT . ' WHERE b.vehicle_id = ? ORDER BY b.start_date DESC', [$vehicleId])->fetchAll());
}

function vehicles_breakdowns(string $id): array
{
    $u = require_permission('vehicles.view');
    find_vehicle($u['owner_id'], $id);
    return ['breakdowns' => breakdowns_of_vehicle($id)];
}

/**
 * Vérifie qu'une immobilisation [start, end] est possible : pas de chevauchement avec une autre,
 * et aucun versement déjà reçu sur ces jours (sauf jour marqué explicitement, qui reste prioritaire).
 */
function assert_breakdown_free(array $vehicle, string $start, ?string $end, ?string $exceptId): void
{
    if ($start < $vehicle['service_date']) {
        throw new HttpError(422, "L'immobilisation commence avant la mise en service de l'engin");
    }
    if ($end !== null && $end < $start) {
        throw new HttpError(422, 'La fin ne peut pas précéder le début');
    }
    $overlap = query(
        'SELECT start_date FROM breakdowns WHERE vehicle_id = ? AND deleted_at IS NULL AND id <> ?
         AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)',
        [$vehicle['id'], $exceptId ?? '', $end ?? '9999-12-31', $start]
    )->fetchColumn();
    if ($overlap !== false) {
        throw new HttpError(422, "Une autre immobilisation couvre déjà ces jours (depuis le $overlap)");
    }
    $paid = query(
        "SELECT a.day FROM payment_allocations a JOIN payments p ON p.id = a.payment_id AND p.cancelled_at IS NULL
         LEFT JOIN day_marks m ON m.vehicle_id = a.vehicle_id AND m.day = a.day AND m.deleted_at IS NULL
         WHERE a.vehicle_id = ? AND a.day BETWEEN ? AND ? AND m.id IS NULL ORDER BY a.day LIMIT 1",
        [$vehicle['id'], $start, $end ?? '9999-12-31']
    )->fetchColumn();
    if ($paid !== false) {
        throw new HttpError(422, "Un versement a déjà été reçu pour le $paid : annulez-le d'abord, ou commencez l'immobilisation après cette date");
    }
}

function breakdowns_create(string $id): array
{
    $u = require_permission('days.mark');
    $d = body();
    $reason = required_string($d, 'reason', 'La cause', 255);
    $start = valid_date($d['startDate'] ?? '', 'Début');
    $end = empty($d['endDate']) ? null : valid_date($d['endDate'], 'Fin');
    db()->beginTransaction();
    try {
        $v = find_vehicle($u['owner_id'], $id, true);
        assert_breakdown_free($v, $start, $end, null);
        $bid = uuid();
        query('INSERT INTO breakdowns (id, owner_id, vehicle_id, start_date, end_date, reason, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$bid, $u['owner_id'], $id, $start, $end, $reason, $u['id'], $u['id']]);
        audit($u['owner_id'], $u['id'], 'breakdown', $bid, 'create', null, ['vehicle' => $v['name'], 'start' => $start, 'end' => $end, 'reason' => $reason]);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return ['breakdowns' => breakdowns_of_vehicle($id)];
}

/** Modifier les dates / la cause ; donner une date de fin = remise en service. */
function breakdowns_update(string $id): array
{
    $u = require_permission('days.mark');
    $d = body();
    db()->beginTransaction();
    try {
        $old = query('SELECT * FROM breakdowns WHERE id = ? AND owner_id = ? AND deleted_at IS NULL FOR UPDATE', [$id, $u['owner_id']])->fetch();
        if (!$old) {
            throw new HttpError(404, 'Immobilisation introuvable');
        }
        $v = find_vehicle($u['owner_id'], $old['vehicle_id'], true);
        $start = valid_date($d['startDate'] ?? $old['start_date'], 'Début');
        $end = array_key_exists('endDate', $d) ? (empty($d['endDate']) ? null : valid_date($d['endDate'], 'Fin')) : $old['end_date'];
        $reason = array_key_exists('reason', $d) ? required_string($d, 'reason', 'La cause', 255) : $old['reason'];
        assert_breakdown_free($v, $start, $end, $id);
        query('UPDATE breakdowns SET start_date = ?, end_date = ?, reason = ?, updated_by = ? WHERE id = ?', [$start, $end, $reason, $u['id'], $id]);
        audit($u['owner_id'], $u['id'], 'breakdown', $id, 'update',
            ['start' => $old['start_date'], 'end' => $old['end_date'], 'reason' => $old['reason']], ['start' => $start, 'end' => $end, 'reason' => $reason]);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return ['breakdowns' => breakdowns_of_vehicle($old['vehicle_id'])];
}

function breakdowns_cancel(string $id): array
{
    $u = require_permission('days.mark');
    $reason = required_string(body(), 'reason', "Le motif d'annulation", 255);
    $b = query('SELECT * FROM breakdowns WHERE id = ? AND owner_id = ? AND deleted_at IS NULL', [$id, $u['owner_id']])->fetch();
    if (!$b) {
        throw new HttpError(404, 'Immobilisation introuvable');
    }
    query('UPDATE breakdowns SET deleted_at = ?, cancel_reason = ?, updated_by = ? WHERE id = ?', [now_utc(), $reason, $u['id'], $id]);
    audit($u['owner_id'], $u['id'], 'breakdown', $id, 'cancel', ['cancelled' => false], ['cancelled' => true, 'reason' => $reason]);
    return ['breakdowns' => breakdowns_of_vehicle($b['vehicle_id'])];
}

// ---------------------------------------------------------------- Échéances

function public_reminder(array $r, string $today): array
{
    $state = $r['done_at'] ? 'done' : ($r['due_date'] < $today ? 'overdue' : ($r['due_date'] <= add_days($today, (int)$r['notify_days']) ? 'soon' : 'later'));
    return [
        'id' => $r['id'], 'vehicleId' => $r['vehicle_id'], 'vehicleName' => $r['vehicle_name'] ?? null, 'kind' => $r['kind'],
        'label' => $r['label'], 'dueDate' => $r['due_date'], 'notifyDays' => (int)$r['notify_days'], 'notes' => $r['notes'],
        'doneAt' => $r['done_at'], 'state' => $state,
    ];
}

function reminders_query(array $u, ?string $vehicleId): array
{
    $s = load_settings($u['owner_id']);
    $today = today_for($s['timezone']);
    $sql = 'SELECT r.*, v.name AS vehicle_name FROM reminders r JOIN vehicles v ON v.id = r.vehicle_id
            WHERE r.owner_id = ? AND r.deleted_at IS NULL AND v.status = ?';
    $params = [$u['owner_id'], 'active'];
    if ($vehicleId) {
        $sql .= ' AND r.vehicle_id = ?';
        $params[] = $vehicleId;
    } else {
        $sql .= ' AND r.done_at IS NULL';
    }
    $rows = query($sql . ' ORDER BY (r.done_at IS NOT NULL), r.due_date', $params)->fetchAll();
    return ['today' => $today, 'reminders' => array_map(fn($r) => public_reminder($r, $today), $rows)];
}

function reminders_list(): array
{
    $u = require_permission('vehicles.view');
    return reminders_query($u, empty($_GET['vehicleId']) ? null : (string)$_GET['vehicleId']);
}

function reminder_input(array $d): array
{
    $kind = (string)($d['kind'] ?? '');
    if (!in_array($kind, REMINDER_KINDS, true)) {
        throw new HttpError(422, "Type d'échéance invalide");
    }
    $label = optional_string($d, 'label', 100);
    if ($kind === 'other' && $label === null) {
        throw new HttpError(422, "Précisez le nom de l'échéance");
    }
    $notify = (int)($d['notifyDays'] ?? 7);
    if ($notify < 0 || $notify > 180) {
        throw new HttpError(422, "Le délai d'alerte doit être entre 0 et 180 jours");
    }
    return ['kind' => $kind, 'label' => $label, 'due_date' => valid_date($d['dueDate'] ?? '', 'Échéance'), 'notify_days' => $notify, 'notes' => optional_string($d, 'notes', 255)];
}

function reminders_create(string $id): array
{
    $u = require_permission('vehicles.manage');
    find_vehicle($u['owner_id'], $id);
    $r = reminder_input(body());
    $rid = uuid();
    query('INSERT INTO reminders (id, owner_id, vehicle_id, kind, label, due_date, notify_days, notes, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$rid, $u['owner_id'], $id, $r['kind'], $r['label'], $r['due_date'], $r['notify_days'], $r['notes'], $u['id'], $u['id']]);
    audit($u['owner_id'], $u['id'], 'reminder', $rid, 'create', null, $r);
    return reminders_query($u, $id);
}

function find_reminder(array $u, string $id): array
{
    $r = query('SELECT * FROM reminders WHERE id = ? AND owner_id = ? AND deleted_at IS NULL', [$id, $u['owner_id']])->fetch();
    if (!$r) {
        throw new HttpError(404, 'Échéance introuvable');
    }
    return $r;
}

function reminders_update(string $id): array
{
    $u = require_permission('vehicles.manage');
    $old = find_reminder($u, $id);
    $r = reminder_input(body());
    query('UPDATE reminders SET kind = ?, label = ?, due_date = ?, notify_days = ?, notes = ?, updated_by = ? WHERE id = ?',
        [$r['kind'], $r['label'], $r['due_date'], $r['notify_days'], $r['notes'], $u['id'], $id]);
    audit($u['owner_id'], $u['id'], 'reminder', $id, 'update', audit_fields($old), $r);
    return reminders_query($u, $old['vehicle_id']);
}

/** Marquer comme fait (renouvelé) ; si une prochaine date est donnée, la nouvelle échéance est créée. */
function reminders_done(string $id): array
{
    $u = require_permission('vehicles.manage');
    $d = body();
    $r = find_reminder($u, $id);
    if ($r['done_at']) {
        throw new HttpError(422, 'Échéance déjà faite');
    }
    $s = load_settings($u['owner_id']);
    $doneAt = valid_date($d['doneAt'] ?? today_for($s['timezone']), 'Date');
    db()->beginTransaction();
    try {
        query('UPDATE reminders SET done_at = ?, done_by = ?, updated_by = ? WHERE id = ?', [$doneAt, $u['id'], $u['id'], $id]);
        if (!empty($d['nextDueDate'])) {
            $next = valid_date($d['nextDueDate'], 'Prochaine échéance');
            query('INSERT INTO reminders (id, owner_id, vehicle_id, kind, label, due_date, notify_days, notes, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [uuid(), $u['owner_id'], $r['vehicle_id'], $r['kind'], $r['label'], $next, $r['notify_days'], $r['notes'], $u['id'], $u['id']]);
        }
        audit($u['owner_id'], $u['id'], 'reminder', $id, 'done', null, ['doneAt' => $doneAt, 'next' => $d['nextDueDate'] ?? null]);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return reminders_query($u, $r['vehicle_id']);
}

function reminders_cancel(string $id): array
{
    $u = require_permission('vehicles.manage');
    $r = find_reminder($u, $id);
    query('UPDATE reminders SET deleted_at = ?, updated_by = ? WHERE id = ?', [now_utc(), $u['id'], $id]);
    audit($u['owner_id'], $u['id'], 'reminder', $id, 'delete', audit_fields($r), null);
    return reminders_query($u, $r['vehicle_id']);
}

// ---------------------------------------------------------------- Bilan d'un engin

/** Bilan d'un engin sur une période : versements reçus, dépenses, bénéfice (dans la devise principale). */
function vehicles_finance(string $id): array
{
    $u = require_permission('vehicles.view');
    find_vehicle($u['owner_id'], $id);
    $s = load_settings($u['owner_id']);
    $today = today_for($s['timezone']);
    $from = valid_date($_GET['from'] ?? substr($today, 0, 8) . '01', 'Début');
    $to = valid_date($_GET['to'] ?? $today, 'Fin');
    $base = $s['base_currency'];
    $rate = current_rate_value($u);
    $sum = function (string $sql, array $params) use ($base, $rate): ?int {
        $t = 0;
        foreach (query($sql, $params)->fetchAll() as $r) {
            $v = convert_amount((int)$r['amount'], $r['currency'], $base, $r['rate'] !== null ? (float)$r['rate'] : $rate);
            if ($v === null) {
                return null;
            }
            $t += $v;
        }
        return $t;
    };
    $revenue = $sum('SELECT amount, currency, rate FROM payments WHERE vehicle_id = ? AND cancelled_at IS NULL AND paid_on BETWEEN ? AND ?', [$id, $from, $to]);
    $expenses = $sum('SELECT amount, currency, rate FROM expenses WHERE vehicle_id = ? AND cancelled_at IS NULL AND spent_on BETWEEN ? AND ?', [$id, $from, $to]);
    $current = query('SELECT * FROM breakdowns WHERE vehicle_id = ? AND deleted_at IS NULL AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)', [$id, $today, $today])->fetch();
    return [
        'from' => $from, 'to' => $to, 'currency' => $base,
        'revenue' => $revenue, 'expenses' => $expenses,
        'profit' => ($revenue === null || $expenses === null) ? null : $revenue - $expenses,
        'currentBreakdown' => $current ? public_breakdown($current) : null,
    ];
}

// ---------------------------------------------------------------- Journal d'activité

function audit_list(): array
{
    $u = require_permission('audit.view');
    $limit = min(max((int)($_GET['limit'] ?? 50), 1), 200);
    $sql = 'SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.owner_id = ?';
    $params = [$u['owner_id']];
    if (!empty($_GET['before'])) {
        $sql .= ' AND a.id < ?';
        $params[] = (int)$_GET['before'];
    }
    if (!empty($_GET['entity'])) {
        $sql .= ' AND a.entity = ?';
        $params[] = (string)$_GET['entity'];
    }
    $rows = query($sql . " ORDER BY a.id DESC LIMIT $limit", $params)->fetchAll();
    return ['entries' => array_map(fn($r) => [
        'id' => (int)$r['id'], 'entity' => $r['entity'], 'entityId' => $r['entity_id'], 'action' => $r['action'],
        'userName' => $r['user_name'], 'createdAt' => $r['created_at'],
        'oldValue' => $r['old_value'] === null ? null : json_decode($r['old_value'], true),
        'newValue' => $r['new_value'] === null ? null : json_decode($r['new_value'], true),
    ], $rows)];
}
