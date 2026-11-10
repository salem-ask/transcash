<?php
declare(strict_types=1);

// Tableau de bord. Montants dans la devise principale (unité minimale).
// Phase 2 : montant attendu aujourd'hui et état du parc. Versements et dettes : phase 3.

/**
 * Ce que chaque engin en service doit rapporter aujourd'hui.
 * Un engin rapporte s'il est en service, a un chauffeur aujourd'hui et que ce n'est pas un jour de repos.
 */
function expected_today(array $u, array $s, ?array $rate): array
{
    $today = today_for($s['timezone']);
    $weekday = weekday_of($today);
    $sql = 'SELECT v.*, d.id AS d_id, d.name AS d_name FROM vehicles v
            LEFT JOIN assignments a ON a.vehicle_id = v.id AND a.start_date <= ? AND (a.end_date IS NULL OR a.end_date >= ?)
            LEFT JOIN drivers d ON d.id = a.driver_id
            WHERE v.owner_id = ? AND v.deleted_at IS NULL AND v.status = ?';
    $params = [$today, $today, $u['owner_id'], 'active'];
    if ($u['role'] === 'driver') {
        $sql .= ' AND d.user_id = ?';
        $params[] = $u['id'];
    }
    $rows = query($sql . ' ORDER BY v.name', $params)->fetchAll();

    $lines = [];
    $total = 0;
    $missingRate = false;
    foreach ($rows as $v) {
        $amount = amount_on($v['id'], $today);
        $rest = in_array($weekday, vehicle_rest_days($v, $s), true);
        $status = !$amount ? 'not_started' : ($rest ? 'rest' : ($v['d_id'] ? 'due' : 'no_driver'));
        $converted = null;
        if ($status === 'due') {
            $converted = convert_amount($amount['amount'], $amount['currency'], $s['base_currency'], $rate ? (float)$rate['rate'] : null);
            if ($converted === null) {
                $missingRate = true;
            } else {
                $total += $converted;
            }
        }
        $lines[] = [
            'vehicleId' => $v['id'],
            'vehicleName' => $v['name'],
            'type' => $v['type'],
            'driverName' => $v['d_name'],
            'status' => $status,
            'amount' => $amount['amount'] ?? 0,
            'currency' => $amount['currency'] ?? $s['base_currency'],
        ];
    }
    return ['date' => $today, 'total' => $total, 'missingRate' => $missingRate, 'lines' => $lines];
}

function dashboard_get(): array
{
    $u = require_user();
    if (!role_can($u['role'], 'dashboard.view') && !role_can($u['role'], 'dashboard.own')) {
        throw new HttpError(403, "Vous n'avez pas accès au tableau de bord");
    }
    $s = load_settings($u['owner_id']);
    $rate = effective_rate($u['owner_id'], $s['rate_mode']);
    $exp = expected_today($u, $s, $rate);

    $count = fn(string $st) => count(array_filter($exp['lines'], fn($l) => $l['status'] === $st));
    $active = count($exp['lines']);
    return [
        'currency' => $s['base_currency'],
        'date' => $exp['date'],
        'rate' => public_rate($rate),
        'today' => ['expected' => $exp['total'], 'paid' => 0, 'debt' => 0],
        'month' => ['expected' => 0, 'paid' => 0, 'expenses' => 0, 'profit' => 0],
        'vehicles' => [
            'total' => $active,
            'working' => $count('due'),
            'resting' => $count('rest'),
            'noDriver' => $count('no_driver'),
            'immobilized' => 0,
        ],
        'missingRate' => $exp['missingRate'],
        'lines' => $exp['lines'],
        'totalDebt' => 0,
    ];
}
