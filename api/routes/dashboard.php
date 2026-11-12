<?php
declare(strict_types=1);

// Tableau de bord. Montants dans la devise principale (unité minimale).

/** Situation de chaque engin en service aujourd'hui : attendu, déjà payé pour ce jour, reste. */
function today_lines(array $u, array $s, string $today): array
{
    $sql = 'SELECT v.id, d.id AS d_id, d.name AS d_name FROM vehicles v
            LEFT JOIN assignments a ON a.vehicle_id = v.id AND a.start_date <= ? AND (a.end_date IS NULL OR a.end_date >= ?)
            LEFT JOIN drivers d ON d.id = a.driver_id
            WHERE v.owner_id = ? AND v.deleted_at IS NULL AND v.status = ?';
    $params = [$today, $today, $u['owner_id'], 'active'];
    if ($u['role'] === 'driver') {
        $sql .= ' AND d.user_id = ?';
        $params[] = $u['id'];
    }
    $rows = query($sql, $params)->fetchAll();
    $vehicles = ledger_vehicles(array_column($rows, 'id'));
    $marks = load_marks(array_column($rows, 'id'), $today, $today);
    $defaultRest = json_decode($s['rest_weekdays'], true) ?: [];

    $lines = [];
    foreach ($rows as $r) {
        $v = $vehicles[$r['id']];
        $mark = $marks[$v['id'] . '|' . $today] ?? null;
        $e = expected_for($v, $today, $defaultRest, $mark);
        $status = $e['kind'] === 'due' && !$r['d_id'] ? 'no_driver' : $e['kind'];
        $expected = $status === 'due' ? $e['expected'] : 0;
        $paid = (int)(paid_by_day('vehicle_id', $v['id'], $today, $today)[$v['id'] . '|' . $today] ?? 0);
        $remaining = max($expected - $paid, 0);
        $lines[] = [
            'vehicleId' => $v['id'],
            'vehicleName' => $v['name'],
            'type' => $v['type'],
            'driverId' => $r['d_id'],
            'driverName' => $r['d_name'],
            'status' => $status,
            'amount' => $expected ?: (amount_from_history($v['amounts'], $today)['amount'] ?? 0),
            'paid' => $paid,
            'remaining' => $remaining,
            'state' => pay_state($expected, $paid, $remaining),
            'currency' => $e['currency'],
        ];
    }
    usort($lines, fn($a, $b) => strcmp($a['vehicleName'], $b['vehicleName']));
    return $lines;
}

/** Argent reçu (versements non annulés) sur une période, converti au taux enregistré avec chaque versement. */
/** $includeDriverExpenses : compter aussi les dépenses payées par les chauffeurs (revenu, mais pas d'argent en caisse). */
function received_between(string $ownerId, string $from, string $to, string $base, ?string $driverId = null, bool $includeDriverExpenses = false): ?int
{
    $sql = 'SELECT amount, currency, rate FROM payments WHERE owner_id = ? AND paid_on BETWEEN ? AND ? AND cancelled_at IS NULL'
        . ($includeDriverExpenses ? '' : " AND method <> 'driver_expense'");
    $params = [$ownerId, $from, $to];
    if ($driverId) {
        $sql .= ' AND driver_id = ?';
        $params[] = $driverId;
    }
    $sum = 0;
    foreach (query($sql, $params)->fetchAll() as $p) {
        $v = convert_amount((int)$p['amount'], $p['currency'], $base, $p['rate'] === null ? null : (float)$p['rate']);
        if ($v === null) {
            return null;
        }
        $sum += $v;
    }
    return $sum;
}

function dashboard_get(): array
{
    $u = require_user();
    if (!role_can($u['role'], 'dashboard.view') && !role_can($u['role'], 'dashboard.own')) {
        throw new HttpError(403, "Vous n'avez pas accès au tableau de bord");
    }
    $s = load_settings($u['owner_id']);
    $base = $s['base_currency'];
    $rateRow = effective_rate($u['owner_id'], $s['rate_mode']);
    $rate = $rateRow ? (float)$rateRow['rate'] : null;
    $today = today_for($s['timezone']);
    $lines = today_lines($u, $s, $today);

    $missingRate = false;
    $sumLines = function (string $field) use ($lines, $base, $rate, &$missingRate): int {
        $t = 0;
        foreach ($lines as $l) {
            $v = convert_amount($l[$field], $l['currency'], $base, $rate);
            if ($v === null) {
                $missingRate = true;
            } else {
                $t += $v;
            }
        }
        return $t;
    };
    // « amount » vaut le montant habituel même les jours non dus : on ne compte que les jours dus
    $expectedToday = 0;
    foreach ($lines as $l) {
        if ($l['status'] !== 'due') {
            continue;
        }
        $v = convert_amount($l['amount'], $l['currency'], $base, $rate);
        if ($v === null) {
            $missingRate = true;
        } else {
            $expectedToday += $v;
        }
    }

    // Dettes (arriérés) : jours passés non payés, par chauffeur
    $driverFilter = $u['role'] === 'driver' ? ' AND d.user_id = ?' : '';
    $params = $u['role'] === 'driver' ? [$u['owner_id'], $u['id']] : [$u['owner_id']];
    $drivers = query(
        "SELECT d.id, d.name, MIN(a.start_date) AS first_day FROM drivers d JOIN assignments a ON a.driver_id = d.id
         WHERE d.owner_id = ? AND d.deleted_at IS NULL $driverFilter GROUP BY d.id, d.name",
        $params
    )->fetchAll();
    $totalDebt = 0;
    $debtors = [];
    $yesterday = add_days($today, -1);
    foreach ($drivers as $d) {
        if ($d['first_day'] > $yesterday) {
            continue;
        }
        $sum = summarize_ledger(driver_ledger($s, $d['id'], $d['first_day'], $yesterday), $today);
        $debt = total_in((array)$sum['arrears'], $base, $rate);
        if ($debt === null) {
            $missingRate = true;
            continue;
        }
        if ($debt > 0) {
            $totalDebt += $debt;
            $debtors[] = ['driverId' => $d['id'], 'driverName' => $d['name'], 'debt' => $debt, 'unpaidDays' => $sum['unpaidDays']];
        }
    }
    usort($debtors, fn($a, $b) => $b['debt'] <=> $a['debt']);

    $count = fn(string $st) => count(array_filter($lines, fn($l) => $l['status'] === $st));
    $monthStart = substr($today, 0, 8) . '01';
    $ownDriver = $u['role'] === 'driver' ? (query('SELECT id FROM drivers WHERE user_id = ?', [$u['id']])->fetchColumn() ?: '-') : null;
    $receivedMonth = received_between($u['owner_id'], $monthStart, $today, $base, $ownDriver, true);
    $expensesMonth = 0;
    if (!$ownDriver) {
        foreach (query('SELECT amount, currency, rate FROM expenses WHERE owner_id = ? AND cancelled_at IS NULL AND spent_on BETWEEN ? AND ?', [$u['owner_id'], $monthStart, $today])->fetchAll() as $e) {
            $v = convert_amount((int)$e['amount'], $e['currency'], $base, $e['rate'] !== null ? (float)$e['rate'] : $rate);
            $v === null ? $missingRate = true : $expensesMonth += $v;
        }
    }
    $alerts = [];
    if (!$ownDriver) {
        foreach (reminders_query($u, null)['reminders'] as $r) {
            if ($r['state'] === 'overdue' || $r['state'] === 'soon') {
                $alerts[] = $r;
            }
        }
    }
    return [
        'currency' => $base,
        'date' => $today,
        'rate' => public_rate($rateRow),
        'today' => [
            'expected' => $expectedToday,
            'paid' => $sumLines('paid'),
            'debt' => $sumLines('remaining'),
            'received' => received_between($u['owner_id'], $today, $today, $base, $ownDriver) ?? 0,
        ],
        'month' => ['expected' => 0, 'paid' => $receivedMonth ?? 0, 'expenses' => $expensesMonth, 'profit' => ($receivedMonth ?? 0) - $expensesMonth],
        'cash' => role_can($u['role'], 'cash.manage') ? balance_of(cash_entries($u['owner_id'], null, $today)) : null,
        'alerts' => $alerts,
        'vehicles' => [
            'total' => count($lines),
            'working' => $count('due'),
            'resting' => $count('rest'),
            'noDriver' => $count('no_driver'),
            'immobilized' => $count('breakdown'),
        ],
        'missingRate' => $missingRate,
        'lines' => $lines,
        'totalDebt' => $totalDebt,
        'debtors' => array_slice($debtors, 0, 10),
    ];
}
