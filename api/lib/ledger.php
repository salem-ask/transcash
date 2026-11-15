<?php
declare(strict_types=1);

// Grand livre des journées (même logique que src/domain/ledger.ts — modifier les deux ensemble).

function add_days(string $date, int $n): string
{
    return (new DateTimeImmutable($date))->modify(($n >= 0 ? '+' : '') . $n . ' day')->format('Y-m-d');
}

/** Engins avec leur historique de montants, indexés par id. */
function ledger_vehicles(array $ids): array
{
    if (!$ids) {
        return [];
    }
    $in = implode(',', array_fill(0, count($ids), '?'));
    $out = [];
    foreach (query("SELECT * FROM vehicles WHERE id IN ($in)", array_values($ids))->fetchAll() as $v) {
        $v['amounts'] = query(
            'SELECT amount, currency, effective_from FROM vehicle_amounts WHERE vehicle_id = ? ORDER BY effective_from',
            [$v['id']]
        )->fetchAll();
        $out[$v['id']] = $v;
    }
    return $out;
}

function amount_from_history(array $amounts, string $date): ?array
{
    $found = null;
    foreach ($amounts as $a) {
        if ($a['effective_from'] <= $date) {
            $found = $a;
        }
    }
    return $found ? ['amount' => (int)$found['amount'], 'currency' => $found['currency']] : null;
}

/** Marques actives (repos, panne, montant exceptionnel) indexées « vehicule|jour ». */
function load_marks(array $vehicleIds, string $from, string $to): array
{
    if (!$vehicleIds) {
        return [];
    }
    $in = implode(',', array_fill(0, count($vehicleIds), '?'));
    $rows = query(
        "SELECT * FROM day_marks WHERE vehicle_id IN ($in) AND day BETWEEN ? AND ? AND deleted_at IS NULL",
        [...array_values($vehicleIds), $from, $to]
    )->fetchAll();
    $out = [];
    foreach ($rows as $m) {
        $out[$m['vehicle_id'] . '|' . $m['day']] = $m;
    }
    // Immobilisations : chaque jour devient « panne », sauf si une marque explicite existe déjà ce jour-là
    $breakdowns = query(
        "SELECT * FROM breakdowns WHERE vehicle_id IN ($in) AND deleted_at IS NULL AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)",
        [...array_values($vehicleIds), $to, $from]
    )->fetchAll();
    foreach ($breakdowns as $b) {
        $end = ($b['end_date'] !== null && $b['end_date'] < $to) ? $b['end_date'] : $to;
        for ($d = max($b['start_date'], $from); $d <= $end; $d = add_days($d, 1)) {
            $key = $b['vehicle_id'] . '|' . $d;
            if (!isset($out[$key])) {
                $out[$key] = ['kind' => 'breakdown', 'amount' => null, 'currency' => null, 'reason' => $b['reason'], 'breakdown_id' => $b['id']];
            }
        }
    }
    return $out;
}

/** Ce qui est attendu un jour donné pour un engin. */
/**
 * Mode de versement de l'entreprise à une date : « fixed » (montant fixe, dette si non payé) ou
 * « free » (montant libre : rien n'est dû, le montant de l'engin n'est qu'un objectif indicatif).
 * Historisé par date d'effet (table payment_modes) ; sans historique : « fixed ».
 */
function payment_mode_on(string $ownerId, string $date): string
{
    static $cache = [];
    $cache[$ownerId] ??= query('SELECT mode, effective_from FROM payment_modes WHERE owner_id = ? ORDER BY effective_from', [$ownerId])->fetchAll();
    $mode = 'fixed';
    foreach ($cache[$ownerId] as $m) {
        if ($m['effective_from'] <= $date) {
            $mode = $m['mode'];
        }
    }
    return $mode;
}

/**
 * Ce qui est attendu un jour donné pour un engin. En mode libre, rien n'est dû :
 * `expected` vaut 0 et `objective` garde le montant habituel (indicatif), `free` = true.
 */
function expected_for(array $v, string $date, array $defaultRest, ?array $mark): array
{
    $e = expected_for_fixed($v, $date, $defaultRest, $mark);
    $e['objective'] = $e['expected'];
    $e['free'] = false;
    if ($e['kind'] === 'due' && isset($v['owner_id']) && payment_mode_on($v['owner_id'], $date) === 'free') {
        $e['expected'] = 0;
        $e['free'] = true;
    }
    return $e;
}

function expected_for_fixed(array $v, string $date, array $defaultRest, ?array $mark): array
{
    $base = amount_from_history($v['amounts'], $date);
    $currency = ($mark && $mark['kind'] === 'override' && $mark['currency']) ? $mark['currency'] : ($base['currency'] ?? 'CDF');
    if (!$base) {
        return ['kind' => 'not_started', 'expected' => 0, 'currency' => $currency, 'override' => false];
    }
    if ($mark && $mark['kind'] === 'breakdown') {
        return ['kind' => 'breakdown', 'expected' => 0, 'currency' => $currency, 'override' => false];
    }
    if ($mark && $mark['kind'] === 'rest') {
        return ['kind' => 'rest', 'expected' => 0, 'currency' => $currency, 'override' => false];
    }
    if ($mark && $mark['kind'] === 'override') {
        return ['kind' => 'due', 'expected' => (int)$mark['amount'], 'currency' => $currency, 'override' => true];
    }
    $rest = $v['rest_weekdays'] === null ? $defaultRest : (json_decode($v['rest_weekdays'], true) ?: []);
    if (in_array(weekday_of($date), $rest, true)) {
        return ['kind' => 'rest', 'expected' => 0, 'currency' => $currency, 'override' => false];
    }
    return ['kind' => 'due', 'expected' => $base['amount'], 'currency' => $currency, 'override' => false];
}

function pay_state(int $expected, int $paid, int $remaining): string
{
    if ($expected === 0) {
        return $paid > 0 ? 'paid' : 'none';
    }
    return $remaining === 0 ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid');
}

/** Montants déjà payés (versements non annulés) indexés « vehicule|jour ». */
function paid_by_day(string $column, string $ref, string $from, string $to): array
{
    $rows = query(
        "SELECT a.vehicle_id, a.day, SUM(a.amount) AS total FROM payment_allocations a
         JOIN payments p ON p.id = a.payment_id AND p.cancelled_at IS NULL
         WHERE a.$column = ? AND a.day BETWEEN ? AND ? GROUP BY a.vehicle_id, a.day",
        [$ref, $from, $to]
    )->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $out[$r['vehicle_id'] . '|' . $r['day']] = (int)$r['total'];
    }
    return $out;
}

/** Journées d'un chauffeur (selon ses affectations) entre deux dates incluses. */
function driver_ledger(array $settings, string $driverId, string $from, string $to): array
{
    $assignments = query(
        'SELECT a.*, v.name AS vehicle_name FROM assignments a JOIN vehicles v ON v.id = a.vehicle_id
         WHERE a.driver_id = ? AND a.start_date <= ? AND (a.end_date IS NULL OR a.end_date >= ?)',
        [$driverId, $to, $from]
    )->fetchAll();
    $vehicleIds = array_unique(array_column($assignments, 'vehicle_id'));
    $vehicles = ledger_vehicles($vehicleIds);
    $marks = load_marks($vehicleIds, $from, $to);
    $paid = paid_by_day('driver_id', $driverId, $from, $to);
    $defaultRest = json_decode($settings['rest_weekdays'], true) ?: [];

    $days = [];
    foreach ($assignments as $a) {
        $v = $vehicles[$a['vehicle_id']];
        $end = ($a['end_date'] !== null && $a['end_date'] < $to) ? $a['end_date'] : $to;
        for ($d = max($a['start_date'], $from); $d <= $end; $d = add_days($d, 1)) {
            $key = $v['id'] . '|' . $d;
            $mark = $marks[$key] ?? null;
            $e = expected_for($v, $d, $defaultRest, $mark);
            $p = $paid[$key] ?? 0;
            $remaining = max($e['expected'] - $p, 0);
            $days[] = [
                'date' => $d,
                'vehicleId' => $v['id'],
                'vehicleName' => $v['name'],
                'kind' => $e['kind'],
                'expected' => $e['expected'],
                'currency' => $e['currency'],
                'paid' => $p,
                'remaining' => $remaining,
                'state' => pay_state($e['expected'], $p, $remaining),
                'override' => $e['override'],
                'free' => $e['free'],
                'objective' => $e['objective'],
                'reason' => $mark['reason'] ?? null,
            ];
        }
    }
    usort($days, fn($x, $y) => [$x['date'], $x['vehicleName']] <=> [$y['date'], $y['vehicleName']]);
    return $days;
}

/** Arriérés (jours passés), reste du jour, avance (jours futurs payés) — par devise. */
function summarize_ledger(array $days, string $today): array
{
    $arrears = $dueToday = $advance = [];
    $unpaidDays = 0;
    $add = function (array &$t, string $c, int $n): void {
        if ($n) {
            $t[$c] = ($t[$c] ?? 0) + $n;
        }
    };
    foreach ($days as $d) {
        if ($d['date'] < $today) {
            $add($arrears, $d['currency'], $d['remaining']);
            if ($d['remaining'] > 0) {
                $unpaidDays++;
            }
        } elseif ($d['date'] === $today) {
            $add($dueToday, $d['currency'], $d['remaining']);
        } else {
            $add($advance, $d['currency'], $d['paid']);
        }
    }
    // Objets JSON même vides
    return ['arrears' => (object)$arrears, 'dueToday' => (object)$dueToday, 'advance' => (object)$advance, 'unpaidDays' => $unpaidDays];
}

/** Total multi-devises converti dans une devise ; null si un taux manque. */
function total_in(array $totals, string $to, ?float $rate): ?int
{
    $sum = 0;
    foreach ($totals as $c => $n) {
        $v = convert_amount((int)$n, $c, $to, $rate);
        if ($v === null) {
            return null;
        }
        $sum += $v;
    }
    return $sum;
}

/**
 * Répartit un versement sur les journées choisies, dans l'ordre (miroir de allocate() en TypeScript).
 * Retourne [allocations, reste non affecté dans la devise du versement].
 */
function allocate_payment(int $amount, string $currency, ?float $rate, array $selected): array
{
    $left = $amount;
    $cur = $currency;
    $allocations = [];
    foreach ($selected as $d) {
        if ($left <= 0) {
            break;
        }
        if ($d['remaining'] <= 0) {
            continue;
        }
        if ($d['currency'] !== $cur) {
            $converted = convert_amount($left, $cur, $d['currency'], $rate);
            if ($converted === null) {
                throw new HttpError(422, 'Taux de change indisponible : saisissez un taux dans les paramètres');
            }
            $left = $converted;
            $cur = $d['currency'];
        }
        $part = min($d['remaining'], $left);
        $allocations[] = ['date' => $d['date'], 'vehicleId' => $d['vehicleId'], 'amount' => $part, 'currency' => $d['currency']];
        $left -= $part;
    }
    $leftover = ($cur === $currency || $left === 0) ? $left : (int)convert_amount($left, $cur, $currency, $rate);
    return [$allocations, $leftover];
}

/** Première date d'affectation d'un chauffeur (début de son grand livre). */
function driver_first_day(string $driverId): ?string
{
    $d = query('SELECT MIN(start_date) FROM assignments WHERE driver_id = ?', [$driverId])->fetchColumn();
    return $d ?: null;
}
