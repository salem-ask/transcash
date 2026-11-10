<?php
declare(strict_types=1);

const SUPPORTED_CURRENCIES = ['CDF', 'USD'];

function load_settings(string $ownerId): array
{
    $s = query('SELECT * FROM settings WHERE owner_id = ?', [$ownerId])->fetch();
    if (!$s) {
        query('INSERT INTO settings (owner_id) VALUES (?)', [$ownerId]);
        $s = query('SELECT * FROM settings WHERE owner_id = ?', [$ownerId])->fetch();
    }
    return $s;
}

function public_settings(array $s): array
{
    return [
        'baseCurrency' => $s['base_currency'],
        'secondaryCurrency' => $s['secondary_currency'],
        'showEquivalent' => (bool)$s['show_equivalent'],
        'rateMode' => $s['rate_mode'],
        'timezone' => $s['timezone'],
        'restWeekdays' => json_decode($s['rest_weekdays'], true) ?: [],
    ];
}

function settings_get(): array
{
    $u = require_user();
    $s = load_settings($u['owner_id']);
    return [
        'settings' => public_settings($s),
        'rate' => public_rate(effective_rate($u['owner_id'], $s['rate_mode'])),
    ];
}

function settings_update(): array
{
    $u = require_permission('settings.edit');
    $old = public_settings(load_settings($u['owner_id']));
    $d = body() + $old;

    $base = strtoupper((string)$d['baseCurrency']);
    if (!in_array($base, SUPPORTED_CURRENCIES, true)) {
        throw new HttpError(422, 'Devise non prise en charge');
    }
    $secondary = $base === 'CDF' ? 'USD' : 'CDF';
    $mode = $d['rateMode'] === 'manual' ? 'manual' : 'auto';
    $tz = (string)$d['timezone'];
    if (!in_array($tz, timezone_identifiers_list(), true)) {
        throw new HttpError(422, 'Fuseau horaire invalide');
    }
    $rest = array_values(array_unique(array_filter(
        array_map('intval', (array)$d['restWeekdays']),
        fn($x) => $x >= 0 && $x <= 6
    )));
    sort($rest);

    query(
        'UPDATE settings SET base_currency = ?, secondary_currency = ?, show_equivalent = ?, rate_mode = ?,
         timezone = ?, rest_weekdays = ? WHERE owner_id = ?',
        [$base, $secondary, $d['showEquivalent'] ? 1 : 0, $mode, $tz, json_encode($rest), $u['owner_id']]
    );
    $new = public_settings(load_settings($u['owner_id']));
    if ($new !== $old) {
        audit($u['owner_id'], $u['id'], 'settings', $u['owner_id'], 'update', $old, $new);
    }
    return settings_get();
}

function rates_list(): array
{
    $u = require_permission('settings.view');
    $s = load_settings($u['owner_id']);
    $history = query(
        'SELECT * FROM exchange_rates WHERE owner_id = ? ORDER BY created_at DESC LIMIT 30',
        [$u['owner_id']]
    )->fetchAll();
    return [
        'current' => public_rate(effective_rate($u['owner_id'], $s['rate_mode'])),
        'history' => array_map('public_rate', $history),
    ];
}

function rates_add_manual(): array
{
    $u = require_permission('rates.edit');
    $rate = (float)(body()['rate'] ?? 0);
    $r = insert_rate($u['owner_id'], $rate, 'manual', $u['id']);
    audit($u['owner_id'], $u['id'], 'exchange_rate', $r['id'], 'create', null, ['rate' => $rate, 'source' => 'manual']);
    return rates_list();
}

function rates_refresh(): array
{
    $u = require_permission('rates.edit');
    $fetched = fetch_auto_rate();
    if ($fetched === null) {
        throw new HttpError(502, 'Impossible de récupérer le taux automatique pour le moment');
    }
    insert_rate($u['owner_id'], $fetched, 'auto', $u['id']);
    return rates_list();
}
