<?php
declare(strict_types=1);

// Sauvegarde : toutes les données de l'entreprise en un fichier JSON (super administrateur).
// Les mots de passe (empreintes) ne sont jamais exportés.

const BACKUP_TABLES = [
    'settings', 'exchange_rates', 'vehicles', 'drivers', 'assignments', 'day_marks', 'payments',
    'payment_allocations', 'expenses', 'cash_movements', 'breakdowns', 'reminders', 'audit_log',
];

function backup_get(): array
{
    $u = require_permission('backup.download');
    $owner = query('SELECT * FROM owners WHERE id = ?', [$u['owner_id']])->fetch();
    $tables = [
        'users' => query(
            'SELECT id, name, login, role, active, last_login_at, created_at, updated_at, deleted_at FROM users WHERE owner_id = ?',
            [$u['owner_id']]
        )->fetchAll(),
    ];
    foreach (BACKUP_TABLES as $t) {
        $tables[$t] = query("SELECT * FROM $t WHERE owner_id = ?", [$u['owner_id']])->fetchAll();
    }
    // Les montants des engins sont rattachés par engin
    $tables['vehicle_amounts'] = query(
        'SELECT va.* FROM vehicle_amounts va JOIN vehicles v ON v.id = va.vehicle_id WHERE v.owner_id = ?',
        [$u['owner_id']]
    )->fetchAll();
    audit($u['owner_id'], $u['id'], 'backup', $u['owner_id'], 'export', null, ['tables' => count($tables)]);
    return [
        'format' => 'transcash-backup',
        'version' => 1,
        'exportedAt' => now_utc(),
        'owner' => $owner,
        'counts' => array_map('count', $tables),
        'tables' => $tables,
    ];
}
