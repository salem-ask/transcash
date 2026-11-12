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
        $c = $config['db'] ?? [];
        if (in_array($c['name'] ?? '', ['', 'NOM_DE_LA_BASE'], true) || in_array($c['pass'] ?? '', ['MOT_DE_PASSE'], true)) {
            $config = null;
            throw new HttpError(500, "Configuration incomplète : remplir le nom de la base, l'utilisateur et le mot de passe dans api/config.php");
        }
    }
    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = config()['db'];
        try {
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
        } catch (PDOException $e) {
            // Erreur fréquente au premier déploiement : message clair, sans dévoiler les identifiants
            error_log('[TransCash] connexion MySQL : ' . $e->getMessage());
            throw new HttpError(500, "Connexion à la base de données impossible : vérifier le nom de la base, l'utilisateur et le mot de passe dans api/config.php");
        }
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
    $body = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    idempotency_store($status, (string)$body);
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo $body;
    exit;
}

/**
 * Anti-doublon générique (hors connexion) : toute écriture peut porter l'en-tête X-Idempotency-Key (UUID).
 * Si la même clé revient (renvoi après une coupure réseau), on renvoie la réponse enregistrée la première fois
 * au lieu de refaire l'opération.
 */
function idempotency_key(): ?string
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $key = strtolower((string)($_SERVER['HTTP_X_IDEMPOTENCY_KEY'] ?? ''));
    if ($method === 'GET' || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $key)) {
        return null;
    }
    return $key;
}

/** Si cette écriture a déjà été traitée, renvoie la même réponse et s'arrête. */
function idempotency_replay(): void
{
    $key = idempotency_key();
    if ($key === null) {
        return;
    }
    $row = query('SELECT user_id, status, response FROM idempotency_keys WHERE id = ?', [$key])->fetch();
    if (!$row) {
        return;
    }
    $userId = $_SESSION['user_id'] ?? null;
    if ($row['user_id'] !== null && $row['user_id'] !== $userId) {
        throw new HttpError(409, 'Clé de requête déjà utilisée');
    }
    $GLOBALS['idempotency_replayed'] = true;
    http_response_code((int)$row['status']);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Idempotent-Replay: 1');
    echo $row['response'];
    exit;
}

/** Enregistre la réponse d'une écriture (sauf erreurs serveur et « non connecté », qui doivent être retentées). */
function idempotency_store(int $status, string $body): void
{
    $key = idempotency_key();
    if ($key === null || $status >= 500 || $status === 401 || !empty($GLOBALS['idempotency_replayed'])) {
        return;
    }
    try {
        query(
            'INSERT IGNORE INTO idempotency_keys (id, user_id, method, path, status, response, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$key, $_SESSION['user_id'] ?? null, $_SERVER['REQUEST_METHOD'] ?? '', substr((string)($_SERVER['REQUEST_URI'] ?? ''), 0, 255), $status, $body, now_utc()]
        );
        if (random_int(1, 200) === 1) {
            query('DELETE FROM idempotency_keys WHERE created_at < ?', [gmdate('Y-m-d H:i:s', time() - 60 * 86400)]);
        }
    } catch (Throwable $e) {
        error_log('[TransCash] idempotency: ' . $e->getMessage());
    }
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

/**
 * Installe ou met à jour le schéma automatiquement (pas besoin de phpMyAdmin).
 * schema.sql est complet et rejouable (CREATE IF NOT EXISTS, ALTER idempotents) ; on ne le rejoue
 * que si son contenu a changé depuis la dernière fois (empreinte stockée dans la table schema_state).
 */
function ensure_schema(): void
{
    $file = __DIR__ . '/../schema.sql';
    $hash = md5_file($file);
    $pdo = db();
    try {
        $current = $pdo->query('SELECT hash FROM schema_state WHERE id = 1')->fetchColumn();
        if ($current === $hash) {
            return;
        }
    } catch (PDOException) {
        // table absente : première installation
    }
    // Un seul processus applique le schéma à la fois
    if (!(int)$pdo->query("SELECT GET_LOCK('transcash_schema', 30)")->fetchColumn()) {
        throw new HttpError(503, 'Mise à jour de la base en cours, réessayez dans un instant');
    }
    try {
        $sql = (string)file_get_contents($file);
        // Retirer les commentaires (« -- … » jusqu'à la fin de la ligne) avant de découper sur « ; »
        $sql = preg_replace('/--[^\n]*/', '', $sql);
        foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
            $pdo->exec($statement);
        }
        $pdo->exec('CREATE TABLE IF NOT EXISTS schema_state (id TINYINT PRIMARY KEY, hash CHAR(32) NOT NULL, applied_at DATETIME NOT NULL)');
        $stmt = $pdo->prepare('REPLACE INTO schema_state (id, hash, applied_at) VALUES (1, ?, ?)');
        $stmt->execute([$hash, now_utc()]);
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('transcash_schema')");
    }
}
