<?php
declare(strict_types=1);

// Taux de change USD -> CDF : automatique (source publique) ou manuel (saisi par l'administrateur).

function latest_rate(string $ownerId, ?string $source = null): ?array
{
    $sql = 'SELECT * FROM exchange_rates WHERE owner_id = ?';
    $params = [$ownerId];
    if ($source) {
        $sql .= ' AND source = ?';
        $params[] = $source;
    }
    $row = query($sql . ' ORDER BY created_at DESC LIMIT 1', $params)->fetch();
    return $row ?: null;
}

function public_rate(?array $r): ?array
{
    if (!$r) {
        return null;
    }
    return [
        'id' => $r['id'],
        'base' => $r['base_currency'],
        'quote' => $r['quote_currency'],
        'rate' => (float)$r['rate'],
        'source' => $r['source'],
        'createdAt' => substr($r['created_at'], 0, 19),
    ];
}

function insert_rate(string $ownerId, float $rate, string $source, ?string $userId): array
{
    if (!is_finite($rate) || $rate <= 0 || $rate > 1_000_000) {
        throw new HttpError(422, 'Taux de change invalide');
    }
    $id = uuid();
    query(
        'INSERT INTO exchange_rates (id, owner_id, base_currency, quote_currency, rate, source, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$id, $ownerId, 'USD', 'CDF', number_format($rate, 6, '.', ''), $source, $userId, now_utc_micro()]
    );
    return query('SELECT * FROM exchange_rates WHERE id = ?', [$id])->fetch();
}

/** Récupère le taux depuis la source publique. Retourne null en cas d'échec (réseau, format). */
function fetch_auto_rate(): ?float
{
    $url = config()['rate_api_url'] ?? 'https://open.er-api.com/v6/latest/USD';
    $ctx = stream_context_create(['http' => ['timeout' => 5], 'https' => ['timeout' => 5]]);
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) {
        return null;
    }
    $data = json_decode($raw, true);
    $rate = $data['rates']['CDF'] ?? null;
    return is_numeric($rate) && $rate > 0 ? (float)$rate : null;
}

/**
 * Taux à appliquer maintenant selon le mode choisi.
 * - manuel : dernier taux manuel (à défaut, dernier taux connu) ;
 * - automatique : dernier taux auto, rafraîchi s'il est trop ancien (à défaut, dernier taux connu).
 */
function effective_rate(string $ownerId, string $mode, bool $allowRefresh = true): ?array
{
    if ($mode === 'manual') {
        return latest_rate($ownerId, 'manual') ?? latest_rate($ownerId);
    }
    $auto = latest_rate($ownerId, 'auto');
    $maxAge = (int)(config()['rate_refresh_hours'] ?? 6) * 3600;
    $stale = !$auto || (time() - strtotime(substr($auto['created_at'], 0, 19) . ' UTC')) > $maxAge;
    if ($stale && $allowRefresh) {
        $fetched = fetch_auto_rate();
        if ($fetched !== null) {
            $auto = insert_rate($ownerId, $fetched, 'auto', null);
        }
    }
    return $auto ?? latest_rate($ownerId);
}
