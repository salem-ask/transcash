<?php
declare(strict_types=1);

// Phase 5 : données brutes d'une période pour les rapports.
// Le calcul du rapport (totaux, par engin, par chauffeur…) est fait par src/domain/report.ts,
// le même code pour l'application en ligne et la démo.

const REPORT_MAX_DAYS = 400;

function reports_data(): array
{
    $u = require_permission('reports.view');
    $s = load_settings($u['owner_id']);
    $today = today_for($s['timezone']);
    $from = valid_date($_GET['from'] ?? substr($today, 0, 8) . '01', 'Début');
    $to = valid_date($_GET['to'] ?? $today, 'Fin');
    if ($to < $from) {
        throw new HttpError(422, 'La fin de la période précède son début');
    }
    if ((new DateTimeImmutable($from))->diff(new DateTimeImmutable($to))->days > REPORT_MAX_DAYS) {
        throw new HttpError(422, 'Période trop longue (' . REPORT_MAX_DAYS . ' jours maximum)');
    }
    $daysTo = $to < $today ? $to : $today; // pas de dette sur les jours à venir
    $rateRow = effective_rate($u['owner_id'], $s['rate_mode'], false);

    $vehicles = query(
        'SELECT id, name, type, plate, status, service_date FROM vehicles WHERE owner_id = ? AND deleted_at IS NULL ORDER BY name',
        [$u['owner_id']]
    )->fetchAll();
    $drivers = query('SELECT id, name, phone FROM drivers WHERE owner_id = ? AND deleted_at IS NULL ORDER BY name', [$u['owner_id']])->fetchAll();

    // Journées de chaque engin : chauffeur du jour, attendu, payé
    $days = [];
    if ($daysTo >= $from && $vehicles) {
        $ids = array_column($vehicles, 'id');
        $ledgerVehicles = ledger_vehicles($ids);
        $marks = load_marks($ids, $from, $daysTo);
        $defaultRest = json_decode($s['rest_weekdays'], true) ?: [];
        $in = implode(',', array_fill(0, count($ids), '?'));
        $assignments = query(
            "SELECT vehicle_id, driver_id, start_date, end_date FROM assignments WHERE vehicle_id IN ($in) AND start_date <= ? AND (end_date IS NULL OR end_date >= ?)",
            [...$ids, $daysTo, $from]
        )->fetchAll();
        $paid = [];
        foreach (query(
            "SELECT a.vehicle_id, a.day, SUM(a.amount) AS total FROM payment_allocations a
             JOIN payments p ON p.id = a.payment_id AND p.cancelled_at IS NULL
             WHERE a.owner_id = ? AND a.day BETWEEN ? AND ? GROUP BY a.vehicle_id, a.day",
            [$u['owner_id'], $from, $daysTo]
        )->fetchAll() as $r) {
            $paid[$r['vehicle_id'] . '|' . $r['day']] = (int)$r['total'];
        }
        foreach ($ledgerVehicles as $v) {
            $start = max($from, $v['service_date']);
            for ($d = $start; $d <= $daysTo; $d = add_days($d, 1)) {
                $driverId = null;
                foreach ($assignments as $a) {
                    if ($a['vehicle_id'] === $v['id'] && $a['start_date'] <= $d && ($a['end_date'] === null || $a['end_date'] >= $d)) {
                        $driverId = $a['driver_id'];
                    }
                }
                $e = expected_for($v, $d, $defaultRest, $marks[$v['id'] . '|' . $d] ?? null);
                $p = $paid[$v['id'] . '|' . $d] ?? 0;
                if (!$driverId && $p === 0) {
                    // Sans chauffeur : rien n'est dû ; on garde la journée seulement si c'est une panne (immobilisation)
                    if ($e['kind'] !== 'breakdown') {
                        continue;
                    }
                }
                $days[] = [
                    'vehicleId' => $v['id'], 'date' => $d, 'driverId' => $driverId,
                    'kind' => $e['kind'], 'expected' => $driverId ? $e['expected'] : 0, 'paid' => $p, 'currency' => $e['currency'],
                ];
            }
        }
    }

    $payments = array_map(fn($p) => [
        'id' => $p['id'], 'receiptNo' => (int)$p['receipt_no'], 'date' => $p['paid_on'], 'driverId' => $p['driver_id'],
        'vehicleId' => $p['vehicle_id'], 'kind' => $p['kind'], 'method' => $p['method'], 'amount' => (int)$p['amount'],
        'currency' => $p['currency'], 'rate' => $p['rate'] === null ? null : (float)$p['rate'], 'reference' => $p['reference'],
    ], query(
        'SELECT * FROM payments WHERE owner_id = ? AND cancelled_at IS NULL AND paid_on BETWEEN ? AND ? ORDER BY paid_on, receipt_no',
        [$u['owner_id'], $from, $to]
    )->fetchAll());

    $expenses = array_map(fn($e) => [
        'id' => $e['id'], 'date' => $e['spent_on'], 'vehicleId' => $e['vehicle_id'], 'driverId' => $e['driver_id'],
        'category' => $e['category'], 'amount' => (int)$e['amount'], 'currency' => $e['currency'],
        'rate' => $e['rate'] === null ? null : (float)$e['rate'], 'paidBy' => $e['paid_by'], 'note' => $e['note'], 'supplier' => $e['supplier'],
    ], query(
        'SELECT * FROM expenses WHERE owner_id = ? AND cancelled_at IS NULL AND spent_on BETWEEN ? AND ? ORDER BY spent_on',
        [$u['owner_id'], $from, $to]
    )->fetchAll());

    return [
        'ownerName' => query('SELECT name FROM owners WHERE id = ?', [$u['owner_id']])->fetchColumn(),
        'from' => $from, 'to' => $to, 'today' => $today,
        'currency' => $s['base_currency'],
        'rate' => $rateRow ? (float)$rateRow['rate'] : null,
        'vehicles' => array_map(fn($v) => ['id' => $v['id'], 'name' => $v['name'], 'type' => $v['type'], 'plate' => $v['plate'], 'status' => $v['status']], $vehicles),
        'drivers' => array_map(fn($d) => ['id' => $d['id'], 'name' => $d['name'], 'phone' => $d['phone']], $drivers),
        'days' => $days,
        'payments' => $payments,
        'expenses' => $expenses,
    ];
}
