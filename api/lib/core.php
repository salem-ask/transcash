<?php
declare(strict_types=1);

// Utilitaires communs : configuration, base de données, réponses JSON, erreurs.

final class HttpError extends Exception
{
    public function __construct(public int $status, string $message)
    {
        parent::__construct($message);
    }
}

function config(): array
{
    static $config = null;
    if ($config === null) {
        $file = getenv('TRANSCASH_CONFIG') ?: __DIR__ . '/../config.php';
        if (!is_file($file)) {
            throw new HttpError(500, "Configuration absente : copier api/config.example.php en api/config.php");
        }
        $config = require $file;
    }
    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = config()['db'];
        $pdo = new PDO(
            "mysql:host={$c['host']};dbname={$c['name']};charset=utf8mb4",
            $c['user'],
            $c['pass'],
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );
        $pdo->exec("SET time_zone = '+00:00'");
    }
    return $pdo;
}

function query(string $sql, array $params = []): PDOStatement
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function uuid(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

function now_utc(): string
{
    return gmdate('Y-m-d H:i:s');
}

function now_utc_micro(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d H:i:s.u');
}

/** Lit le corps JSON de la requête. */
function body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new HttpError(400, 'Requête invalide (JSON attendu)');
    }
    return $data;
}

function json_response(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Valide qu'un champ texte est présent et non vide. */
function required_string(array $data, string $key, string $label, int $max = 150): string
{
    $v = trim((string)($data[$key] ?? ''));
    if ($v === '') {
        throw new HttpError(422, "$label est obligatoire");
    }
    if (mb_strlen($v) > $max) {
        throw new HttpError(422, "$label est trop long ($max caractères maximum)");
    }
    return $v;
}

/** Enregistre une modification dans le journal. */
function audit(string $ownerId, ?string $userId, string $entity, string $entityId, string $action, mixed $old, mixed $new): void
{
    query(
        'INSERT INTO audit_log (owner_id, user_id, entity, entity_id, action, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $ownerId, $userId, $entity, $entityId, $action,
            $old === null ? null : json_encode($old, JSON_UNESCAPED_UNICODE),
            $new === null ? null : json_encode($new, JSON_UNESCAPED_UNICODE),
            now_utc(),
        ]
    );
}
