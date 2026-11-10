<?php
declare(strict_types=1);

// Point d'entrée unique de l'API TransCash (PHP 8 + MySQL, sans dépendance externe).
// Toutes les URL /api/... arrivent ici (voir .htaccess).

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/rates.php';
require __DIR__ . '/lib/fleet.php';
require __DIR__ . '/lib/ledger.php';
require __DIR__ . '/routes/auth.php';
require __DIR__ . '/routes/settings.php';
require __DIR__ . '/routes/users.php';
require __DIR__ . '/routes/vehicles.php';
require __DIR__ . '/routes/drivers.php';
require __DIR__ . '/routes/payments.php';
require __DIR__ . '/routes/finance.php';
require __DIR__ . '/routes/reports.php';
require __DIR__ . '/routes/dashboard.php';

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$pos = strpos($path, '/api/');
$path = $pos === false ? '/' : substr($path, $pos + 4);
$path = '/' . trim($path, '/');

$routes = [
    ['GET', '/health', fn() => ['ok' => true]],
    ['GET', '/auth/status', 'auth_status'],
    ['POST', '/auth/setup', 'auth_setup'],
    ['POST', '/auth/login', 'auth_login'],
    ['POST', '/auth/logout', 'auth_logout'],
    ['POST', '/auth/password', 'auth_change_password'],
    ['GET', '/settings', 'settings_get'],
    ['PUT', '/settings', 'settings_update'],
    ['GET', '/rates', 'rates_list'],
    ['POST', '/rates', 'rates_add_manual'],
    ['POST', '/rates/refresh', 'rates_refresh'],
    ['GET', '/users', 'users_list'],
    ['POST', '/users', 'users_create'],
    ['PUT', '/users/{id}', 'users_update'],
    ['GET', '/vehicles', 'vehicles_list'],
    ['POST', '/vehicles', 'vehicles_create'],
    ['GET', '/vehicles/{id}', 'vehicles_get'],
    ['PUT', '/vehicles/{id}', 'vehicles_update'],
    ['POST', '/vehicles/{id}/status', 'vehicles_set_status'],
    ['POST', '/vehicles/{id}/assign', 'vehicles_assign'],
    ['POST', '/vehicles/{id}/unassign', 'vehicles_unassign'],
    ['GET', '/drivers', 'drivers_list'],
    ['POST', '/drivers', 'drivers_create'],
    ['GET', '/drivers/{id}', 'drivers_get'],
    ['PUT', '/drivers/{id}', 'drivers_update'],
    ['POST', '/drivers/{id}/account', 'drivers_create_account'],
    ['GET', '/vehicles/{id}/days', 'vehicles_days'],
    ['POST', '/vehicles/{id}/days', 'vehicles_mark_day'],
    ['GET', '/drivers/{id}/ledger', 'drivers_ledger'],
    ['GET', '/me/ledger', 'me_ledger'],
    ['GET', '/payments', 'payments_list'],
    ['POST', '/payments', 'payments_create'],
    ['GET', '/payments/{id}', 'payments_get'],
    ['POST', '/payments/{id}/cancel', 'payments_cancel'],
    ['GET', '/expenses', 'expenses_list'],
    ['POST', '/expenses', 'expenses_create'],
    ['GET', '/expenses/{id}', 'expenses_get'],
    ['PUT', '/expenses/{id}', 'expenses_update'],
    ['POST', '/expenses/{id}/cancel', 'expenses_cancel'],
    ['GET', '/cash', 'cash_get'],
    ['POST', '/cash/movements', 'cash_movement_create'],
    ['PUT', '/cash/movements/{id}', 'cash_movement_update'],
    ['POST', '/cash/movements/{id}/cancel', 'cash_movement_cancel'],
    ['GET', '/vehicles/{id}/breakdowns', 'vehicles_breakdowns'],
    ['POST', '/vehicles/{id}/breakdowns', 'breakdowns_create'],
    ['PUT', '/breakdowns/{id}', 'breakdowns_update'],
    ['POST', '/breakdowns/{id}/cancel', 'breakdowns_cancel'],
    ['GET', '/vehicles/{id}/finance', 'vehicles_finance'],
    ['GET', '/reminders', 'reminders_list'],
    ['POST', '/vehicles/{id}/reminders', 'reminders_create'],
    ['PUT', '/reminders/{id}', 'reminders_update'],
    ['POST', '/reminders/{id}/done', 'reminders_done'],
    ['POST', '/reminders/{id}/cancel', 'reminders_cancel'],
    ['GET', '/audit', 'audit_list'],
    ['GET', '/reports/data', 'reports_data'],
    ['GET', '/dashboard', 'dashboard_get'],
];

try {
    ensure_schema();
    // Protection CSRF : toute écriture doit porter l'en-tête X-TransCash (impossible à poser depuis un autre site).
    if ($method !== 'GET' && ($_SERVER['HTTP_X_TRANSCASH'] ?? '') !== '1') {
        throw new HttpError(403, 'Requête refusée');
    }
    foreach ($routes as [$m, $pattern, $handler]) {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[0-9a-fA-F-]{36})', $pattern) . '$#';
        if ($m === $method && preg_match($regex, $path, $match)) {
            $params = array_filter($match, 'is_string', ARRAY_FILTER_USE_KEY);
            json_response($handler(...$params));
        }
    }
    throw new HttpError(404, 'Ressource introuvable');
} catch (HttpError $e) {
    json_response(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    error_log('[TransCash] ' . $e);
    $debug = false;
    try {
        $debug = (bool)(config()['debug'] ?? false);
    } catch (Throwable) {
    }
    json_response(['error' => $debug ? $e->getMessage() : 'Erreur interne du serveur'], 500);
}
