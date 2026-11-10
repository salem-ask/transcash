<?php
declare(strict_types=1);

// Tableau de bord — phase 1 : squelette. Les chiffres réels arrivent avec les engins (phase 2)
// et les versements (phase 3). Montants en unité minimale de la devise principale.

function dashboard_get(): array
{
    $u = require_user();
    if (!role_can($u['role'], 'dashboard.view') && !role_can($u['role'], 'dashboard.own')) {
        throw new HttpError(403, "Vous n'avez pas accès au tableau de bord");
    }
    $s = load_settings($u['owner_id']);
    return [
        'currency' => $s['base_currency'],
        'rate' => public_rate(effective_rate($u['owner_id'], $s['rate_mode'])),
        'today' => ['expected' => 0, 'paid' => 0, 'debt' => 0],
        'month' => ['expected' => 0, 'paid' => 0, 'expenses' => 0, 'profit' => 0],
        'vehicles' => ['total' => 0, 'active' => 0, 'immobilized' => 0],
        'totalDebt' => 0,
    ];
}
