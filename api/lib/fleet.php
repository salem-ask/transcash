<?php
declare(strict_types=1);

// Règles communes au parc : dates locales, montants attendus, jours de repos.

const VEHICLE_TYPES = ['moto', 'tricycle', 'taxi', 'minibus', 'camion', 'autre'];
const MAX_AMOUNT = 1_000_000_000_000;

/** Date du jour (AAAA-MM-JJ) dans le fuseau du propriétaire. */
function today_for(string $timezone): string
{
    return (new DateTimeImmutable('now', new DateTimeZone($timezone)))->format('Y-m-d');
}

function valid_date(mixed $value, string $label): string
{
    $v = (string)$value;
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', $v);
    if (!$d || $d->format('Y-m-d') !== $v) {
        throw new HttpError(422, "$label : date invalide");
    }
    return $v;
}

function previous_day(string $date): string
{
    return (new DateTimeImmutable($date))->modify('-1 day')->format('Y-m-d');
}

function weekday_of(string $date): int
{
    return (int)(new DateTimeImmutable($date))->format('w'); // 0 = dimanche
}

function valid_amount(mixed $value): int
{
    if (!is_int($value) && !(is_string($value) && ctype_digit($value))) {
        throw new HttpError(422, 'Montant invalide (nombre entier attendu)');
    }
    $v = (int)$value;
    if ($v <= 0 || $v > MAX_AMOUNT) {
        throw new HttpError(422, 'Le montant journalier doit être supérieur à zéro');
    }
    return $v;
}

function valid_currency(mixed $value): string
{
    $c = strtoupper((string)$value);
    if (!in_array($c, SUPPORTED_CURRENCIES, true)) {
        throw new HttpError(422, 'Devise non prise en charge');
    }
    return $c;
}

function valid_weekdays(mixed $value): array
{
    $days = array_values(array_unique(array_filter(
        array_map('intval', (array)$value),
        fn($x) => $x >= 0 && $x <= 6
    )));
    sort($days);
    return $days;
}

function optional_string(array $data, string $key, int $max = 255): ?string
{
    $v = trim((string)($data[$key] ?? ''));
    if ($v === '') {
        return null;
    }
    if (mb_strlen($v) > $max) {
        throw new HttpError(422, "Champ trop long ($max caractères maximum)");
    }
    return $v;
}

/** Jours de repos effectifs d'un engin (les siens, sinon ceux des paramètres). */
function vehicle_rest_days(array $vehicle, array $settings): array
{
    $own = $vehicle['rest_weekdays'] === null ? null : json_decode($vehicle['rest_weekdays'], true);
    return is_array($own) ? $own : (json_decode($settings['rest_weekdays'], true) ?: []);
}

/** Montant attendu en vigueur à une date (historique), ou null si l'engin n'était pas encore en service. */
function amount_on(string $vehicleId, string $date): ?array
{
    $row = query(
        'SELECT amount, currency FROM vehicle_amounts WHERE vehicle_id = ? AND effective_from <= ?
         ORDER BY effective_from DESC LIMIT 1',
        [$vehicleId, $date]
    )->fetch();
    return $row ? ['amount' => (int)$row['amount'], 'currency' => $row['currency']] : null;
}

/** Convertit un montant (unité minimale) ; même logique que src/domain/money.ts. */
function convert_amount(int $amount, string $from, string $to, ?float $rate): ?int
{
    if ($from === $to) {
        return $amount;
    }
    if (!$rate || $rate <= 0) {
        return null;
    }
    $dec = ['CDF' => 0, 'USD' => 2];
    $major = $amount / 10 ** $dec[$from];
    $converted = $from === 'USD' ? $major * $rate : $major / $rate;
    return (int)round($converted * 10 ** $dec[$to], 0, PHP_ROUND_HALF_UP);
}
