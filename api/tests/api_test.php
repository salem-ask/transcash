<?php
declare(strict_types=1);

// Tests d'intégration de l'API sur une base MySQL de test.
// Usage : TRANSCASH_CONFIG=/chemin/config.test.php php api/tests/api_test.php
// La base indiquée dans la configuration est VIDÉE puis recréée.

$configFile = getenv('TRANSCASH_CONFIG') ?: '';
if (!$configFile || !is_file($configFile)) {
    fwrite(STDERR, "Définir TRANSCASH_CONFIG vers une configuration de base de TEST.\n");
    exit(2);
}
$config = require $configFile;
$c = $config['db'];
$pdo = new PDO("mysql:host={$c['host']};dbname={$c['name']};charset=utf8mb4", $c['user'], $c['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
foreach (['audit_log', 'login_attempts', 'exchange_rates', 'settings', 'users', 'owners'] as $t) {
    $pdo->exec("DROP TABLE IF EXISTS $t");
}
$pdo->exec((string)file_get_contents(__DIR__ . '/../schema.sql'));

$port = 8765;
$root = realpath(__DIR__ . '/..');
$cmd = sprintf('TRANSCASH_CONFIG=%s php -S 127.0.0.1:%d %s/index.php > /dev/null 2>&1 & echo $!', escapeshellarg($configFile), $port, $root);
$pid = (int)shell_exec($cmd);
register_shutdown_function(fn() => posix_kill($pid, SIGTERM) || exec("kill $pid"));
usleep(400_000);

$jars = [];
function call(string $who, string $method, string $path, ?array $body = null, bool $csrf = true): array
{
    global $port, $jars;
    $jars[$who] ??= tempnam(sys_get_temp_dir(), 'tc');
    $ch = curl_init("http://127.0.0.1:$port/api$path");
    $headers = ['Content-Type: application/json'];
    if ($csrf) {
        $headers[] = 'X-TransCash: 1';
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_COOKIEJAR => $jars[$who],
        CURLOPT_COOKIEFILE => $jars[$who],
        CURLOPT_POSTFIELDS => $body === null ? null : json_encode($body),
    ]);
    $out = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    return [$status, json_decode((string)$out, true)];
}

$failures = 0;
function check(string $label, bool $ok, mixed $detail = null): void
{
    global $failures;
    echo ($ok ? '  ✓ ' : '  ✗ ') . $label . ($ok ? '' : ' → ' . json_encode($detail, JSON_UNESCAPED_UNICODE)) . "\n";
    if (!$ok) {
        $failures++;
    }
}

echo "Installation\n";
[$s, $r] = call('boss', 'GET', '/auth/status');
check('needsSetup au départ', $s === 200 && $r['needsSetup'] === true, $r);
[$s, $r] = call('boss', 'POST', '/auth/setup', ['ownerName' => 'Transports Test', 'name' => 'Patron', 'login' => 'patron@test.cd', 'password' => 'court']);
check('mot de passe trop court refusé', $s === 422, $r);
[$s, $r] = call('boss', 'POST', '/auth/setup', ['ownerName' => 'Transports Test', 'name' => 'Patron', 'login' => 'Patron@Test.cd', 'password' => 'motdepasse1']);
check('création du compte principal', $s === 200 && $r['user']['role'] === 'super_admin' && $r['user']['login'] === 'patron@test.cd', $r);
[$s, $r] = call('intrus', 'POST', '/auth/setup', ['ownerName' => 'X', 'name' => 'X', 'login' => 'x@x.cd', 'password' => 'motdepasse1']);
check('seconde installation refusée', $s === 409, $r);

echo "Sécurité\n";
[$s] = call('boss', 'POST', '/auth/logout', null, false);
check('écriture sans en-tête CSRF refusée', $s === 403);
[$s] = call('anonyme', 'GET', '/settings');
check('paramètres sans connexion → 401', $s === 401);

echo "Paramètres et taux\n";
[$s, $r] = call('boss', 'GET', '/settings');
check('paramètres par défaut CDF / USD', $s === 200 && $r['settings']['baseCurrency'] === 'CDF' && $r['settings']['secondaryCurrency'] === 'USD', $r);
[$s, $r] = call('boss', 'PUT', '/settings', ['baseCurrency' => 'USD', 'rateMode' => 'manual', 'restWeekdays' => [0, 0, 9, 6]]);
check('passage en USD principal, mode manuel', $s === 200 && $r['settings']['baseCurrency'] === 'USD' && $r['settings']['secondaryCurrency'] === 'CDF' && $r['settings']['restWeekdays'] === [0, 6], $r);
[$s, $r] = call('boss', 'POST', '/rates', ['rate' => -5]);
check('taux négatif refusé', $s === 422, $r);
[$s, $r] = call('boss', 'POST', '/rates', ['rate' => 2850.5]);
check('taux manuel enregistré et appliqué', $s === 200 && $r['current']['rate'] === 2850.5 && $r['current']['source'] === 'manual', $r);

echo "Utilisateurs et rôles\n";
[$s, $r] = call('boss', 'POST', '/users', ['name' => 'Compta', 'login' => '+243 81 000 0000', 'role' => 'accountant', 'password' => 'motdepasse2']);
check('création comptable (identifiant téléphone normalisé)', $s === 200 && in_array('+243810000000', array_column($r['users'], 'login'), true), $r);
[$s, $r] = call('boss', 'POST', '/users', ['name' => 'Admin', 'login' => 'admin@test.cd', 'role' => 'admin', 'password' => 'motdepasse3']);
$adminId = array_values(array_filter($r['users'], fn($u) => $u['login'] === 'admin@test.cd'))[0]['id'];
$bossId = array_values(array_filter($r['users'], fn($u) => $u['role'] === 'super_admin'))[0]['id'];
[$s, $r] = call('boss', 'POST', '/users', ['name' => 'Doublon', 'login' => 'admin@test.cd', 'role' => 'manager', 'password' => 'motdepasse3']);
check('identifiant en double refusé', $s === 409, $r);
[$s, $r] = call('boss', 'PUT', "/users/$bossId", ['active' => false]);
check('impossible de se désactiver soi-même', $s === 422, $r);

[$s, $r] = call('compta', 'POST', '/auth/login', ['login' => '+243810000000', 'password' => 'motdepasse2']);
check('connexion comptable', $s === 200 && $r['user']['role'] === 'accountant', $r);
[$s] = call('compta', 'PUT', '/settings', ['baseCurrency' => 'CDF']);
check('comptable ne peut pas modifier les paramètres', $s === 403);
[$s] = call('compta', 'GET', '/users');
check('comptable ne voit pas les utilisateurs', $s === 403);
[$s, $r] = call('compta', 'POST', '/rates', ['rate' => 2900]);
check('comptable peut saisir un taux', $s === 200 && (float)$r['current']['rate'] === 2900.0, $r);

[$s] = call('adm', 'POST', '/auth/login', ['login' => 'admin@test.cd', 'password' => 'motdepasse3']);
[$s, $r] = call('adm', 'POST', '/users', ['name' => 'Super2', 'login' => 's2@test.cd', 'role' => 'super_admin', 'password' => 'motdepasse4']);
check('admin ne peut pas créer de super admin', $s === 403, $r);
[$s, $r] = call('adm', 'PUT', "/users/$bossId", ['name' => 'Piraté']);
check('admin ne peut pas modifier le super admin', $s === 403, $r);

[$s] = call('boss', 'PUT', "/users/$adminId", ['active' => false]);
[$s] = call('adm', 'GET', '/settings');
check('compte désactivé déconnecté immédiatement', $s === 401);

echo "Connexion\n";
[$s] = call('x', 'POST', '/auth/login', ['login' => 'patron@test.cd', 'password' => 'mauvais']);
check('mauvais mot de passe → 401', $s === 401);
for ($i = 0; $i < 8; $i++) {
    call('x', 'POST', '/auth/login', ['login' => 'patron@test.cd', 'password' => 'mauvais']);
}
[$s] = call('x', 'POST', '/auth/login', ['login' => 'patron@test.cd', 'password' => 'motdepasse1']);
check('blocage après trop de tentatives → 429', $s === 429);

echo "Journal et tableau de bord\n";
$n = (int)$pdo->query("SELECT COUNT(*) FROM audit_log WHERE entity = 'settings' AND action = 'update'")->fetchColumn();
check('modification des paramètres journalisée', $n === 1, $n);
[$s, $r] = call('boss', 'GET', '/dashboard');
check('tableau de bord accessible', $s === 200 && $r['currency'] === 'USD', $r);

echo $failures === 0 ? "\nTous les tests API passent.\n" : "\n$failures test(s) en échec.\n";
exit($failures === 0 ? 0 : 1);
