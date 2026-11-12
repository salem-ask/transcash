<?php
declare(strict_types=1);

// Premier lancement sur l'hébergement : saisie des identifiants MySQL une seule fois.
// La configuration est écrite HORS du dossier public ; ensuite cette étape n'existe plus
// (index.php ne l'appelle que tant qu'aucune configuration n'existe).

/** Préfixe imposé par l'hébergeur aux bases et utilisateurs (ex. « u977986808_ » sur Hostinger), si détectable. */
function account_prefix(): ?string
{
    if (preg_match('#^/home/(u\d+)/#', __DIR__, $m)) {
        return $m[1] . '_';
    }
    return null;
}

function install_status(): array
{
    $prefix = account_prefix();
    return [
        'needsConfig' => true,
        'needsSetup' => false,
        'user' => null,
        'ownerName' => null,
        'suggestedDb' => $prefix ? $prefix . 'transcash' : null,
    ];
}

function install_config(): array
{
    $d = body();
    $name = trim((string)($d['dbName'] ?? ''));
    $user = trim((string)($d['dbUser'] ?? ''));
    $pass = (string)($d['dbPass'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $name) || !preg_match('/^[A-Za-z0-9_]{1,64}$/', $user) || $pass === '') {
        throw new HttpError(422, 'Nom de la base, utilisateur et mot de passe sont obligatoires');
    }
    // Sur Hostinger : uniquement une base de CE compte d'hébergement
    $prefix = account_prefix();
    if ($prefix && (!str_starts_with($name, $prefix) || !str_starts_with($user, $prefix))) {
        throw new HttpError(422, "La base et l'utilisateur doivent commencer par $prefix");
    }
    try {
        $pdo = new PDO("mysql:host=localhost;dbname=$name;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->query('SELECT 1');
    } catch (PDOException) {
        throw new HttpError(422, 'Connexion à la base impossible : vérifiez le nom, l\'utilisateur et le mot de passe');
    }
    $config = [
        'db' => ['host' => 'localhost', 'name' => $name, 'user' => $user, 'pass' => $pass],
        'debug' => false,
        'rate_api_url' => 'https://open.er-api.com/v6/latest/USD',
        'rate_refresh_hours' => 6,
    ];
    $php = "<?php\n// Écrit par l'écran d'installation de TransCash. Ne jamais publier ce fichier.\nreturn " . var_export($config, true) . ";\n";
    $target = external_config_path();
    if (@file_put_contents($target, $php, LOCK_EX) === false) {
        // Hébergement sans accès au dossier parent : à défaut, dans api/ (protégé par .htaccess)
        $target = __DIR__ . '/../config.php';
        if (@file_put_contents($target, $php, LOCK_EX) === false) {
            throw new HttpError(500, "Impossible d'enregistrer la configuration sur le serveur");
        }
    }
    @chmod($target, 0600);
    ensure_schema();
    return session_payload(null);
}
