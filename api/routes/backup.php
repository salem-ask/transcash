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
    $data = backup_data($u['owner_id']);
    audit($u['owner_id'], $u['id'], 'backup', $u['owner_id'], 'export', null, ['tables' => count($data['tables'])]);
    return $data;
}

/** Toutes les données d'une entreprise (sans empreintes de mots de passe). */
function backup_data(string $ownerId): array
{
    $owner = query('SELECT * FROM owners WHERE id = ?', [$ownerId])->fetch();
    $tables = [
        'users' => query(
            'SELECT id, name, login, role, active, last_login_at, created_at, updated_at, deleted_at FROM users WHERE owner_id = ?',
            [$ownerId]
        )->fetchAll(),
    ];
    foreach (BACKUP_TABLES as $t) {
        $tables[$t] = query("SELECT * FROM $t WHERE owner_id = ?", [$ownerId])->fetchAll();
    }
    // Les montants des engins sont rattachés par engin
    $tables['vehicle_amounts'] = query(
        'SELECT va.* FROM vehicle_amounts va JOIN vehicles v ON v.id = va.vehicle_id WHERE v.owner_id = ?',
        [$ownerId]
    )->fetchAll();
    $tables['payment_modes'] = query('SELECT * FROM payment_modes WHERE owner_id = ?', [$ownerId])->fetchAll();
    return [
        'format' => 'transcash-backup',
        'version' => 1,
        'exportedAt' => now_utc(),
        'owner' => $owner,
        'counts' => array_map('count', $tables),
        'tables' => $tables,
    ];
}

/** Dossier privé des sauvegardes serveur : à côté de la configuration, hors du dossier public. */
function backup_dir(): string
{
    $cfg = config();
    if (!empty($cfg['backup_dir'])) {
        return rtrim((string)$cfg['backup_dir'], '/');
    }
    $file = (string)config_file();
    if (realpath($file) === realpath(external_config_path())) {
        return dirname($file) . '/transcash-backups';
    }
    return dirname(__DIR__, 2) . '/.local/backups'; // développement / tests (dossier ignoré par git)
}

/** Écrit une sauvegarde complète sur le serveur. Retourne le nom du fichier ; erreur si impossible. */
function write_server_backup(string $ownerId, string $label): string
{
    $dir = backup_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        throw new HttpError(500, "Impossible de créer le dossier des sauvegardes : rien n'a été effacé");
    }
    @file_put_contents($dir . '/.htaccess', "Require all denied\n");
    $name = 'transcash-' . $label . '-' . substr($ownerId, 0, 8) . '-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '.json';
    $json = json_encode(backup_data($ownerId), JSON_UNESCAPED_UNICODE);
    if ($json === false || @file_put_contents($dir . '/' . $name, $json, LOCK_EX) !== strlen($json)) {
        throw new HttpError(500, "La sauvegarde n'a pas pu être enregistrée sur le serveur : rien n'a été effacé");
    }
    @chmod($dir . '/' . $name, 0600);
    return $name;
}

/** Tables vidées par la réinitialisation, dans l'ordre (contraintes de clés étrangères). */
const RESET_OPERATIONS = ['payment_allocations', 'expenses', 'payments', 'cash_movements', 'breakdowns', 'day_marks', 'reminders', 'audit_log'];
const RESET_ALL_EXTRA = ['assignments', 'vehicle_amounts', 'vehicles', 'drivers'];

/**
 * Réinitialisation (super administrateur) : « operations » efface versements, dépenses, caisse, journées,
 * immobilisations, échéances et journal ; « all » efface en plus engins, chauffeurs et comptes (sauf le sien).
 * Confirmation : le mot « supprimer » tapé à l'écran. Une sauvegarde complète est d'abord écrite sur le serveur.
 */
function admin_reset(): array
{
    $u = require_permission('data.reset');
    $d = body();
    $scope = (string)($d['scope'] ?? '');
    if (!in_array($scope, ['operations', 'all'], true)) {
        throw new HttpError(422, 'Choisissez ce qui doit être effacé');
    }
    if (mb_strtolower(trim((string)($d['confirm'] ?? ''))) !== 'supprimer') {
        throw new HttpError(422, 'Pour confirmer, tapez le mot « supprimer »');
    }
    $owner = $u['owner_id'];
    $file = write_server_backup($owner, 'avant-reinitialisation');
    $counts = [];
    db()->beginTransaction();
    try {
        query('SELECT id FROM owners WHERE id = ? FOR UPDATE', [$owner]);
        $tables = $scope === 'all' ? array_merge(RESET_OPERATIONS, RESET_ALL_EXTRA) : RESET_OPERATIONS;
        foreach ($tables as $t) {
            $counts[$t] = query("DELETE FROM $t WHERE owner_id = ?", [$owner])->rowCount();
        }
        if ($scope === 'all') {
            $counts['users'] = query('DELETE FROM users WHERE owner_id = ? AND id <> ?', [$owner, $u['id']])->rowCount();
        }
        audit($owner, $u['id'], 'reset', $owner, $scope === 'all' ? 'reset_all' : 'reset_operations', null, ['backup' => $file, 'deleted' => $counts]);
        db()->commit();
    } catch (Throwable $e) {
        db()->rollBack();
        throw $e;
    }
    return ['ok' => true, 'scope' => $scope, 'backup' => $file, 'deleted' => $counts];
}
