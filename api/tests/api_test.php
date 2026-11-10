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
foreach (['reminders', 'cash_movements', 'expenses', 'breakdowns', 'payment_allocations', 'payments', 'day_marks', 'assignments', 'vehicle_amounts', 'drivers', 'vehicles', 'audit_log', 'login_attempts', 'exchange_rates', 'settings', 'users', 'owners'] as $t) {
    $pdo->exec("DROP TABLE IF EXISTS $t");
}
$pdo->exec((string)file_get_contents(__DIR__ . '/../schema.sql'));
$pdo->exec((string)file_get_contents(__DIR__ . '/../migrations/002_engins_chauffeurs.sql')); // rejouable sans erreur
$pdo->exec((string)file_get_contents(__DIR__ . '/../migrations/003_versements_dettes.sql'));
$pdo->exec((string)file_get_contents(__DIR__ . '/../migrations/004_depenses_caisse_pannes.sql'));

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
[$s] = call('boss', 'GET', '/settings');
check('les autres comptes de la même IP ne sont pas bloqués', $s === 200);

echo "Journal et tableau de bord\n";
$n = (int)$pdo->query("SELECT COUNT(*) FROM audit_log WHERE entity = 'settings' AND action = 'update'")->fetchColumn();
check('modification des paramètres journalisée', $n === 1, $n);
[$s, $r] = call('boss', 'GET', '/dashboard');
check('tableau de bord accessible', $s === 200 && $r['currency'] === 'USD', $r);


echo "Engins et chauffeurs\n";
call('boss', 'PUT', '/settings', ['restWeekdays' => []]); // test indépendant du jour de la semaine
[$s, $r] = call('boss', 'POST', '/vehicles', ['type' => 'taxi', 'name' => 'Taxi 1', 'plate' => 'kn 1234 ab', 'dailyAmount' => 30000, 'currency' => 'CDF', 'serviceDate' => '2026-01-01']);
check('création engin (immatriculation en majuscules)', $s === 200 && $r['vehicle']['plate'] === 'KN 1234 AB' && count($r['amounts']) === 1, $r);
$taxi = $r['vehicle']['id'];
[$s, $r] = call('boss', 'POST', '/vehicles', ['type' => 'moto', 'name' => 'Doublon', 'plate' => 'KN 1234 AB', 'dailyAmount' => 1000, 'currency' => 'CDF']);
check('immatriculation en double refusée', $s === 409, $r);
[$s, $r] = call('boss', 'POST', '/vehicles', ['type' => 'avion', 'name' => 'X', 'dailyAmount' => 1000, 'currency' => 'CDF']);
check('type inconnu refusé', $s === 422, $r);
[$s, $r] = call('boss', 'POST', '/vehicles', ['type' => 'moto', 'name' => 'X', 'dailyAmount' => 12.5, 'currency' => 'CDF']);
check('montant non entier refusé', $s === 422, $r);
[$s, $r] = call('boss', 'POST', '/vehicles', ['type' => 'moto', 'name' => 'Moto 1', 'dailyAmount' => 1000, 'currency' => 'USD', 'serviceDate' => '2026-01-01']);
$moto = $r['vehicle']['id'];

[$s, $r] = call('boss', 'POST', '/drivers', ['name' => 'Jean Kabila', 'phone' => '+243 81 111 1111']);
check('création chauffeur', $s === 200 && $r['driver']['phone'] === '+243811111111', $r);
$jean = $r['driver']['id'];
[$s, $r] = call('boss', 'POST', '/drivers', ['name' => 'Autre', 'phone' => '+243811111111']);
check('téléphone de chauffeur en double refusé', $s === 409, $r);
[$s, $r] = call('boss', 'POST', '/drivers', ['name' => 'Autre', 'phone' => 'abc']);
check('téléphone invalide refusé', $s === 422, $r);
[$s, $r] = call('boss', 'POST', '/drivers', ['name' => 'Paul Mbala', 'phone' => '0812222222']);
$paul = $r['driver']['id'];

echo "Affectations\n";
[$s, $r] = call('boss', 'POST', "/vehicles/$taxi/assign", ['driverId' => $jean, 'startDate' => '2026-02-01']);
check('affectation Jean → Taxi 1', $s === 200 && $r['vehicle']['currentDriver']['id'] === $jean, $r);
[$s, $r] = call('boss', 'POST', "/vehicles/$moto/assign", ['driverId' => $jean, 'startDate' => '2026-02-05']);
check('un chauffeur ne conduit qu\'un engin à la fois', $s === 409, $r);
[$s, $r] = call('boss', 'POST', "/vehicles/$taxi/assign", ['driverId' => $paul, 'startDate' => '2026-01-20']);
check('nouveau chauffeur avant le début de l\'actuel refusé', $s === 422, $r);
[$s, $r] = call('boss', 'POST', "/vehicles/$taxi/assign", ['driverId' => $paul, 'startDate' => '2026-03-01']);
$hist = $r['assignments'] ?? [];
check('relève : Jean termine la veille, Paul commence', $s === 200 && $r['vehicle']['currentDriver']['id'] === $paul
    && count($hist) === 2 && $hist[1]['endDate'] === '2026-02-28', $r);
[$s, $r] = call('boss', 'POST', "/vehicles/$moto/assign", ['driverId' => $jean, 'startDate' => '2026-02-15']);
check('chevauchement avec une ancienne affectation refusé', $s === 422, $r);
[$s, $r] = call('boss', 'POST', "/vehicles/$moto/assign", ['driverId' => $jean, 'startDate' => '2026-03-01']);
check('Jean passe sur Moto 1', $s === 200, $r);
[$s, $r] = call('boss', 'GET', "/drivers/$jean");
check('historique du chauffeur (2 engins)', $s === 200 && count($r['assignments']) === 2 && $r['driver']['currentVehicle']['id'] === $moto, $r);

echo "Montant journalier\n";
[$s, $r] = call('boss', 'PUT', "/vehicles/$taxi", ['name' => 'Taxi 1', 'type' => 'taxi', 'plate' => 'KN 1234 AB', 'dailyAmount' => 35000, 'amountFrom' => '2026-06-01']);
check('nouveau montant daté, ancien conservé', $s === 200 && count($r['amounts']) === 2 && $r['amounts'][0]['effectiveFrom'] === '2026-06-01' && $r['amounts'][1]['amount'] === 30000, $r);
[$s, $r] = call('boss', 'PUT', "/vehicles/$taxi", ['name' => 'Taxi 1', 'type' => 'taxi', 'plate' => 'KN 1234 AB', 'dailyAmount' => 36000, 'amountFrom' => '2026-06-01']);
check('même date : le montant prévu est remplacé', $s === 200 && count($r['amounts']) === 2 && $r['amounts'][0]['amount'] === 36000, $r);

echo "Tableau de bord\n";
[$s, $r] = call('boss', 'GET', '/dashboard');
// 36 000 FC / 2 900 = 12,41 $ → 1241 cents ; + 10,00 $ de la moto = 2241 cents (devise principale USD)
check('attendu du jour converti dans la devise principale', $s === 200 && $r['today']['expected'] === 2241 && $r['vehicles']['working'] === 2, $r);

echo "Droits et accès chauffeur\n";
[$s] = call('compta', 'POST', '/vehicles', ['type' => 'moto', 'name' => 'X', 'dailyAmount' => 1000, 'currency' => 'CDF']);
check('comptable ne peut pas créer d\'engin', $s === 403);
[$s, $r] = call('compta', 'GET', '/vehicles');
check('comptable voit les engins', $s === 200 && count($r['vehicles']) === 2, $r);
[$s, $r] = call('boss', 'POST', "/drivers/$paul/account", ['password' => 'chauffeur1']);
check('accès chauffeur créé (identifiant = téléphone)', $s === 200 && $r['driver']['hasAccount'] === true, $r);
[$s, $r] = call('paul', 'POST', '/auth/login', ['login' => '0812222222', 'password' => 'chauffeur1']);
check('connexion chauffeur', $s === 200 && $r['user']['role'] === 'driver', $r);
[$s, $r] = call('paul', 'GET', '/dashboard');
check('le chauffeur ne voit que son engin', $s === 200 && count($r['lines']) === 1 && $r['lines'][0]['vehicleId'] === $taxi, $r);
[$s] = call('paul', 'GET', '/vehicles');
check('le chauffeur ne voit pas la liste des engins', $s === 403);

echo "Fin d'affectation et retrait\n";
[$s, $r] = call('boss', 'POST', "/vehicles/$moto/unassign", ['endDate' => '2026-02-01']);
check('fin avant le début refusée', $s === 422, $r);
[$s, $r] = call('boss', 'PUT', "/drivers/$paul", ['name' => 'Paul Mbala', 'phone' => '0812222222', 'active' => false]);
check('désactivation d\'un chauffeur en service refusée', $s === 422, $r);
[$s, $r] = call('boss', 'POST', "/vehicles/$taxi/status", ['status' => 'retired', 'date' => '2026-07-01']);
check('retrait du parc termine l\'affectation', $s === 200 && $r['vehicle']['status'] === 'retired' && $r['vehicle']['currentDriver'] === null && $r['assignments'][0]['endDate'] === '2026-07-01', $r);
[$s, $r] = call('boss', 'POST', "/vehicles/$taxi/assign", ['driverId' => $paul, 'startDate' => '2026-07-05']);
check('affectation sur un engin retiré refusée', $s === 422, $r);
[$s, $r] = call('boss', 'PUT', "/drivers/$paul", ['name' => 'Paul Mbala', 'phone' => '0812222222', 'active' => false]);
check('désactivation du chauffeur libre (et de son accès)', $s === 200 && $r['driver']['active'] === false, $r);
[$s] = call('paul', 'GET', '/dashboard');
check('accès du chauffeur désactivé coupé', $s === 401);

echo "Séparation des propriétaires\n";
$o2 = '00000000-0000-4000-8000-000000000002';
$pdo->exec("INSERT INTO owners (id, name) VALUES ('$o2', 'Autre entreprise')");
$pdo->prepare("INSERT INTO users (id, owner_id, name, login, password_hash, role) VALUES (?, ?, 'Autre', 'autre@x.cd', ?, 'super_admin')")
    ->execute(['00000000-0000-4000-8000-0000000000aa', $o2, password_hash('motdepasse9', PASSWORD_DEFAULT)]);
call('autre', 'POST', '/auth/login', ['login' => 'autre@x.cd', 'password' => 'motdepasse9']);
[$s, $r] = call('autre', 'GET', '/vehicles');
check('un autre propriétaire ne voit aucun engin', $s === 200 && $r['vehicles'] === [], $r);
[$s] = call('autre', 'GET', "/vehicles/$moto");
check('ni par accès direct', $s === 404);
[$s] = call('autre', 'POST', "/vehicles/$moto/unassign", []);
check('ni en écriture', $s === 404);

echo "Versements et dettes\n";
$T = (new DateTimeImmutable('now', new DateTimeZone('Africa/Kinshasa')));
$day = fn(int $n) => $T->modify(($n >= 0 ? '+' : '') . "$n day")->format('Y-m-d');
$uuid = function (): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
};
[, $r] = call('boss', 'POST', '/vehicles', ['type' => 'minibus', 'name' => 'Bus', 'dailyAmount' => 50000, 'currency' => 'CDF', 'serviceDate' => $day(-10)]);
$bus = $r['vehicle']['id'];
[, $r] = call('boss', 'POST', '/drivers', ['name' => 'Eric Kasongo', 'phone' => '0815555555']);
$eric = $r['driver']['id'];
call('boss', 'POST', "/vehicles/$bus/assign", ['driverId' => $eric, 'startDate' => $day(-5)]);

[$s, $r] = call('boss', 'GET', "/drivers/$eric/ledger");
check('grand livre : 5 jours passés dus = 250 000 FC de dettes', $s === 200 && ($r['summary']['arrears']['CDF'] ?? 0) === 250000
    && $r['summary']['unpaidDays'] === 5 && ($r['summary']['dueToday']['CDF'] ?? 0) === 50000, $r['summary'] ?? $r);

$p1 = $uuid();
$pay1 = ['id' => $p1, 'driverId' => $eric, 'kind' => 'daily', 'amount' => 60000, 'currency' => 'CDF', 'method' => 'cash',
    'days' => [['date' => $day(-5), 'vehicleId' => $bus], ['date' => $day(-4), 'vehicleId' => $bus]]];
[$s, $r] = call('compta', 'POST', '/payments', $pay1);
check('versement : 1er jour complet, 2e partiel', $s === 200 && $r['receiptNo'] === 1
    && array_column($r['allocations'], 'amount') === [50000, 10000], $r);
[$s, $r] = call('compta', 'POST', '/payments', $pay1);
$n = (int)$pdo->query('SELECT COUNT(*) FROM payments')->fetchColumn();
check('renvoi du même versement : aucun doublon', $s === 200 && $r['receiptNo'] === 1 && $n === 1, [$r, $n]);

[$s, $r] = call('compta', 'POST', '/payments', ['id' => $uuid(), 'driverId' => $eric, 'amount' => 100000, 'currency' => 'CDF', 'method' => 'cash',
    'days' => [['date' => $day(-4), 'vehicleId' => $bus]]]);
check('surplus non affecté refusé', $s === 422 && str_contains($r['error'], 'surplus'), $r);
[$s, $r] = call('compta', 'POST', '/payments', ['id' => $uuid(), 'driverId' => $eric, 'amount' => 30000, 'currency' => 'CDF', 'method' => 'cash',
    'days' => [['date' => $day(-4), 'vehicleId' => $bus], ['date' => $day(-3), 'vehicleId' => $bus]]]);
check('montant insuffisant pour toutes les journées cochées refusé', $s === 422, $r);
[$s, $r] = call('compta', 'POST', '/payments', ['id' => $uuid(), 'driverId' => $eric, 'amount' => 30000, 'currency' => 'CDF', 'method' => 'cash',
    'days' => [['date' => $day(-6), 'vehicleId' => $bus]]]);
check('journée où il ne conduisait pas refusée', $s === 422, $r);
[$s, $r] = call('compta', 'POST', '/payments', ['id' => $uuid(), 'driverId' => $eric, 'amount' => 30000, 'currency' => 'CDF', 'method' => 'troc',
    'days' => [['date' => $day(-3), 'vehicleId' => $bus]]]);
check('mode de paiement obligatoire', $s === 422, $r);

[$s, $r] = call('compta', 'POST', '/payments', ['id' => $uuid(), 'driverId' => $eric, 'amount' => 2000, 'currency' => 'USD', 'method' => 'mobile_money',
    'reference' => 'MP2611.1234', 'days' => [['date' => $day(-4), 'vehicleId' => $bus], ['date' => $day(-3), 'vehicleId' => $bus]]]);
check('versement de 20 $ converti (2 900) sur des journées en francs', $s === 200 && array_column($r['allocations'], 'amount') === [40000, 18000]
    && (float)$r['rate'] === 2900.0 && $r['receiptNo'] === 2, $r);
[$s, $r] = call('boss', 'POST', '/payments', ['id' => $uuid(), 'driverId' => $eric, 'amount' => 50000, 'currency' => 'CDF', 'method' => 'cash',
    'days' => [['date' => $day(1), 'vehicleId' => $bus]]]);
check('versement anticipé (demain)', $s === 200, $r);

echo "Journées repos / panne / exceptionnel\n";
[$s, $r] = call('boss', 'POST', "/vehicles/$bus/days", ['date' => $day(-2), 'kind' => 'breakdown', 'reason' => 'Embrayage']);
check('panne : rien de dû ce jour-là', $s === 200 && current(array_filter($r['days'], fn($d) => $d['date'] === $day(-2)))['expected'] === 0, $r);
[$s, $r] = call('boss', 'POST', "/vehicles/$bus/days", ['date' => $day(-4), 'kind' => 'rest']);
check('repos refusé sur un jour déjà payé', $s === 422, $r);
[$s, $r] = call('boss', 'POST', "/vehicles/$bus/days", ['date' => $day(-1), 'kind' => 'override', 'amount' => 20000, 'currency' => 'CDF']);
check('montant exceptionnel sans raison refusé', $s === 422, $r);
[$s, $r] = call('boss', 'POST', "/vehicles/$bus/days", ['date' => $day(-1), 'kind' => 'override', 'amount' => 20000, 'currency' => 'CDF', 'reason' => 'Demi-journée']);
check('montant exceptionnel appliqué', $s === 200 && current(array_filter($r['days'], fn($d) => $d['date'] === $day(-1)))['expected'] === 20000, $r);
[$s] = call('compta', 'POST', "/vehicles/$bus/days", ['date' => $day(-6), 'kind' => 'rest']);
check('le comptable peut marquer une journée', $s === 200);
[$s, $r] = call('boss', 'POST', "/vehicles/$bus/days", ['date' => $day(-6), 'kind' => 'clear']);
check('marque retirée', $s === 200 && current(array_filter($r['days'], fn($d) => $d['date'] === $day(-6)))['mark'] === null, $r);

echo "Exceptionnel et annulation\n";
[$s, $r] = call('compta', 'POST', '/payments', ['id' => $uuid(), 'driverId' => $eric, 'kind' => 'extra', 'amount' => 10000, 'currency' => 'CDF', 'method' => 'cash']);
check('versement exceptionnel sans motif refusé', $s === 422, $r);
[$s, $r] = call('compta', 'POST', '/payments', ['id' => $uuid(), 'driverId' => $eric, 'kind' => 'extra', 'amount' => 10000, 'currency' => 'CDF', 'method' => 'cash', 'note' => 'Participation pneu']);
check('versement exceptionnel enregistré, aucune journée payée', $s === 200 && $r['allocations'] === [] && $r['vehicleId'] === $bus, $r);
[$s] = call('compta', 'POST', "/payments/$p1/cancel", []);
check('annulation sans motif refusée', $s === 422);
[$s, $r] = call('compta', 'POST', "/payments/$p1/cancel", ['reason' => 'Erreur de saisie']);
check('annulation avec motif', $s === 200 && $r['cancelled'] === true, $r);
[$s, $r] = call('compta', 'POST', "/payments/$p1/cancel", ['reason' => 'encore']);
check('double annulation refusée', $s === 422, $r);

[$s, $r] = call('boss', 'GET', "/drivers/$eric/ledger");
// J-5 : 50 000 (versement annulé) ; J-4 : 10 000 ; J-3 : 32 000 ; J-2 : panne ; J-1 : 20 000 (exceptionnel) → 112 000 FC
check('dettes recalculées après panne, exceptionnel et annulation', $s === 200 && ($r['summary']['arrears']['CDF'] ?? 0) === 112000
    && $r['summary']['unpaidDays'] === 4 && ($r['summary']['advance']['CDF'] ?? 0) === 50000, $r['summary'] ?? $r);

echo "Accès du chauffeur et tableau de bord\n";
call('boss', 'POST', "/drivers/$eric/account", ['password' => 'chauffeur2']);
call('eric', 'POST', '/auth/login', ['login' => '0815555555', 'password' => 'chauffeur2']);
[$s, $r] = call('eric', 'GET', '/me/ledger');
check('le chauffeur voit sa propre situation', $s === 200 && ($r['summary']['arrears']['CDF'] ?? 0) === 112000, $r);
[$s] = call('eric', 'GET', "/drivers/$jean/ledger");
check("le chauffeur ne voit pas celle d'un autre", $s === 403);
[$s] = call('eric', 'GET', '/payments');
check('le chauffeur ne voit pas le journal des versements', $s === 403);
[$s, $r] = call('eric', 'GET', "/payments/$p1");
check('le chauffeur voit son reçu', $s === 200 && $r['receiptNo'] === 1, $r);
[$s] = call('eric', 'POST', '/payments', ['id' => $uuid(), 'driverId' => $eric, 'amount' => 1, 'currency' => 'CDF', 'method' => 'cash', 'days' => []]);
check('le chauffeur ne peut pas saisir de versement', $s === 403);
[$s, $r] = call('boss', 'GET', '/dashboard');
$eDebt = current(array_filter($r['debtors'] ?? [], fn($d) => $d['driverId'] === $eric));
check('tableau de bord : Eric parmi les débiteurs, encaissements du jour', $s === 200 && $eDebt && $eDebt['unpaidDays'] === 4 && $r['today']['received'] > 0, $r);
[$s, $r] = call('compta', 'GET', '/payments');
check('journal du jour (4 versements, dont 1 annulé)', $s === 200 && count($r['payments']) === 4 && count(array_filter($r['payments'], fn($p) => $p['cancelled'])) === 1, $r);

[$s] = call('autre', 'GET', "/drivers/$eric/ledger");
check('autre propriétaire : grand livre inaccessible', $s === 404);
[$s] = call('autre', 'POST', '/payments', ['id' => $uuid(), 'driverId' => $eric, 'amount' => 100, 'currency' => 'CDF', 'method' => 'cash', 'days' => [['date' => $day(0), 'vehicleId' => $bus]]]);
check('autre propriétaire : versement impossible', $s === 404);

echo "Phase 4 : dépenses\n";
// Situation d'Eric avant : dettes 112 000 FC (voir ci-dessus)
[$s, $r] = call('gestion', 'POST', '/auth/login', ['login' => 'gestion@test.cd', 'password' => 'x']);
[$s, $r] = call('boss', 'POST', '/users', ['name' => 'Gestion', 'login' => 'gestion@test.cd', 'role' => 'manager', 'password' => 'motdepasse5']);
call('gestion', 'POST', '/auth/login', ['login' => 'gestion@test.cd', 'password' => 'motdepasse5']);
$e1 = $uuid();
[$s, $r] = call('gestion', 'POST', '/expenses', ['id' => $e1, 'vehicleId' => $bus, 'category' => 'fuel', 'amount' => 30000, 'currency' => 'CDF', 'spentOn' => $day(0), 'note' => 'Plein']);
check('dépense de caisse (gestionnaire)', $s === 200 && $r['paidBy'] === 'cash' && $r['vehicleName'] === 'Bus', $r);
[$s] = call('gestion', 'POST', '/expenses', ['id' => $e1, 'vehicleId' => $bus, 'category' => 'fuel', 'amount' => 30000, 'currency' => 'CDF']);
check('renvoi de la même dépense : pas de doublon', $s === 200 && (int)$pdo->query('SELECT COUNT(*) FROM expenses')->fetchColumn() === 1);
[$s, $r] = call('gestion', 'POST', '/expenses', ['id' => $uuid(), 'category' => 'fuel', 'amount' => 30000, 'currency' => 'CDF', 'spentOn' => $day(1)]);
check('dépense datée dans le futur refusée', $s === 422, $r);
[$s, $r] = call('gestion', 'POST', '/expenses', ['id' => $uuid(), 'category' => 'café', 'amount' => 30000, 'currency' => 'CDF']);
check('catégorie inconnue refusée', $s === 422, $r);
[$s, $r] = call('gestion', 'PUT', "/expenses/$e1", ['vehicleId' => $bus, 'category' => 'fuel', 'amount' => 35000, 'currency' => 'CDF', 'spentOn' => $day(0), 'note' => 'Plein complet']);
check('modification tracée', $s === 200 && $r['amount'] === 35000
    && (int)$pdo->query("SELECT COUNT(*) FROM audit_log WHERE entity = 'expense' AND action = 'update'")->fetchColumn() === 1, $r);

// Dépense payée par le chauffeur : compte comme versement sur J-1 (20 000 FC exceptionnel)
$e2 = $uuid();
[$s, $r] = call('gestion', 'POST', '/expenses', ['id' => $e2, 'category' => 'repair', 'amount' => 20000, 'currency' => 'CDF', 'spentOn' => $day(0),
    'paidBy' => 'driver', 'driverId' => $eric, 'days' => [['date' => $day(-1), 'vehicleId' => $bus]], 'note' => 'Vulcanisateur']);
check('dépense payée par le chauffeur', $s === 200 && $r['paidBy'] === 'driver' && $r['paymentId'] !== null && $r['vehicleId'] === $bus, $r);
$e2payment = $r['paymentId'];
[$s, $r] = call('boss', 'GET', "/drivers/$eric/ledger");
check('… sa dette baisse de 20 000 FC', ($r['summary']['arrears']['CDF'] ?? 0) === 92000, $r['summary']);
[$s, $r] = call('gestion', 'PUT', "/expenses/$e2", ['category' => 'repair', 'amount' => 25000, 'currency' => 'CDF']);
check('… son montant ne se modifie pas (annuler et refaire)', $s === 422, $r);
[$s, $r] = call('gestion', 'POST', "/expenses/$e2/cancel", ['reason' => 'Facture perdue']);
[$s2, $r2] = call('boss', 'GET', "/drivers/$eric/ledger");
check('annulation : versement lié annulé, dette rétablie', $s === 200 && $r['cancelled'] && ($r2['summary']['arrears']['CDF'] ?? 0) === 112000
    && $pdo->query("SELECT cancelled_at IS NOT NULL FROM payments WHERE id = '$e2payment'")->fetchColumn() == 1, [$r, $r2['summary']]);

echo "Caisse\n";
[$s] = call('gestion', 'GET', '/cash');
check('le gestionnaire n\'accède pas à la caisse', $s === 403);
[$s, $r] = call('compta', 'GET', '/cash');
// Entrées du jour non annulées : 2000 USD + 50 000 + 10 000 (exceptionnel) FC ; sorties : 35 000 FC. Pas le versement « dépense chauffeur ».
check('solde de caisse', $s === 200 && $r['balance']['CDF'] === 25000 && $r['balance']['USD'] === 2000, $r['balance'] ?? $r);
$w = $uuid();
[$s, $r] = call('compta', 'POST', '/cash/movements', ['id' => $w, 'kind' => 'withdrawal', 'amount' => 20000, 'currency' => 'CDF', 'note' => 'Retrait patron']);
check('retrait du propriétaire', $s === 200 && $r['balance']['CDF'] === 5000, $r['balance'] ?? $r);
[$s, $r] = call('compta', 'PUT', "/cash/movements/$w", ['kind' => 'withdrawal', 'amount' => 15000, 'currency' => 'CDF']);
check('retrait modifié (tracé)', $s === 200 && $r['balance']['CDF'] === 10000, $r['balance'] ?? $r);
[$s, $r] = call('compta', 'POST', '/cash/movements', ['id' => $uuid(), 'kind' => 'deposit', 'amount' => 100, 'currency' => 'USD', 'note' => 'Solde initial']);
check('apport', $s === 200 && $r['balance']['USD'] === 2100, $r['balance'] ?? $r);
[$s, $r] = call('compta', 'POST', "/cash/movements/$w/cancel", ['reason' => 'Doublon']);
check('retrait annulé', $s === 200 && $r['balance']['CDF'] === 25000, $r['balance'] ?? $r);

echo "Immobilisations\n";
[$s, $r] = call('gestion', 'POST', "/vehicles/$bus/breakdowns", ['startDate' => $day(-5), 'endDate' => $day(-4), 'reason' => 'Moteur']);
check('immobilisation refusée sur des jours déjà payés', $s === 422 && str_contains($r['error'], 'versement'), $r);
[$s, $r] = call('gestion', 'POST', "/vehicles/$bus/breakdowns", ['startDate' => $day(2), 'reason' => 'Boîte de vitesses']);
check('immobilisation en cours déclarée', $s === 200 && $r['breakdowns'][0]['endDate'] === null, $r);
$bk = $r['breakdowns'][0]['id'];
[$s, $r] = call('boss', 'GET', "/drivers/$eric/ledger");
$kinds = array_column(array_filter($r['days'], fn($d) => $d['date'] >= $day(2) && $d['date'] <= $day(4)), 'kind');
check('aucun versement exigé pendant l\'immobilisation', $kinds === ['breakdown', 'breakdown', 'breakdown'], $kinds);
[$s, $r] = call('gestion', 'POST', "/vehicles/$bus/breakdowns", ['startDate' => $day(3), 'endDate' => $day(5), 'reason' => 'x']);
check('chevauchement refusé', $s === 422, $r);
[$s, $r] = call('gestion', 'PUT', "/breakdowns/$bk", ['endDate' => $day(3)]);
check('remise en service (date de fin)', $s === 200 && $r['breakdowns'][0]['endDate'] === $day(3), $r);
[$s, $r] = call('gestion', 'POST', '/expenses', ['id' => $uuid(), 'category' => 'repair', 'amount' => 150, 'currency' => 'USD', 'breakdownId' => $bk]);
[$s2, $r2] = call('gestion', 'GET', "/vehicles/$bus/breakdowns");
check('réparation liée à l\'immobilisation', $s === 200 && $r['vehicleId'] === $bus && ($r2['breakdowns'][0]['expenses']['USD'] ?? 0) === 150, [$r, $r2]);
[$s, $r] = call('gestion', 'POST', "/breakdowns/$bk/cancel", ['reason' => 'Erreur']);
check('immobilisation annulée', $s === 200 && $r['breakdowns'][0]['cancelled'] === true, $r);

echo "Échéances\n";
[$s, $r] = call('gestion', 'POST', "/vehicles/$bus/reminders", ['kind' => 'insurance', 'dueDate' => $day(3), 'notifyDays' => 7]);
check('échéance assurance (bientôt)', $s === 200 && $r['reminders'][0]['state'] === 'soon', $r);
$rem = $r['reminders'][0]['id'];
[$s, $r] = call('gestion', 'POST', "/vehicles/$bus/reminders", ['kind' => 'oil_change', 'dueDate' => $day(-2)]);
check('vidange dépassée', $s === 200 && $r['reminders'][0]['state'] === 'overdue', $r);
[$s, $r] = call('gestion', 'POST', "/vehicles/$bus/reminders", ['kind' => 'other', 'dueDate' => $day(30)]);
check('« autre » sans nom refusé', $s === 422, $r);
[$s, $r] = call('gestion', 'POST', "/reminders/$rem/done", ['nextDueDate' => $day(365)]);
$states = array_column($r['reminders'], 'state');
check('renouvelée : faite + prochaine créée', $s === 200 && in_array('done', $states, true) && count($r['reminders']) === 3, $r);
[$s, $r] = call('boss', 'GET', '/dashboard');
check('tableau de bord : alertes, dépenses du mois, caisse', $s === 200 && count($r['alerts']) === 1 && $r['alerts'][0]['kind'] === 'oil_change'
    && $r['month']['expenses'] > 0 && $r['cash'] !== null, ['alerts' => $r['alerts'] ?? null, 'month' => $r['month'] ?? null, 'cash' => $r['cash'] ?? null]);
[$s, $r] = call('boss', 'GET', "/vehicles/$bus/finance");
check('bilan de l\'engin', $s === 200 && $r['revenue'] > 0 && $r['expenses'] > 0 && $r['profit'] === $r['revenue'] - $r['expenses'], $r);

echo "Journal d'activité\n";
[$s, $r] = call('boss', 'GET', '/audit?limit=5');
check('le super admin consulte le journal', $s === 200 && count($r['entries']) === 5 && $r['entries'][0]['userName'] !== null, $r);
[$s] = call('compta', 'GET', '/audit');
check('le comptable ne le consulte pas', $s === 403);
[$s] = call('autre', 'GET', "/vehicles/$bus/breakdowns");
check('autre propriétaire : immobilisations inaccessibles', $s === 404);
[$s, $r] = call('autre', 'GET', '/cash');
check('autre propriétaire : sa propre caisse est vide', $s === 200 && $r['balance'] === ['CDF' => 0, 'USD' => 0], $r);

echo "Rapports\n";
[$s, $r] = call('compta', 'GET', '/reports/data?from=' . $day(-10) . '&to=' . $day(0));
$busDays = array_filter($r['days'] ?? [], fn($d) => $d['vehicleId'] === $bus);
check('données de rapport (comptable)', $s === 200 && count($busDays) >= 5 && count($r['payments']) > 0 && count($r['expenses']) > 0, array_slice($r, 0, 5));
check('aucune journée future dans le rapport', max(array_column($r['days'], 'date')) <= $day(0));
[$s] = call('gestion', 'GET', '/reports/data');
check('le gestionnaire ne voit pas les rapports', $s === 403);
[$s, $r] = call('compta', 'GET', '/reports/data?from=2026-01-01&to=2025-01-01');
check('période inversée refusée', $s === 422, $r);
[$s, $r] = call('autre', 'GET', '/reports/data');
check('autre propriétaire : aucun engin', $s === 200 && $r['vehicles'] === [] && $r['days'] === [], $r);

echo $failures === 0 ? "\nTous les tests API passent.\n" : "\n$failures test(s) en échec.\n";
exit($failures === 0 ? 0 : 1);
