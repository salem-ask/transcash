<?php
// Copier ce fichier en config.php (jamais commité) et remplir les valeurs.
// Sur Hostinger : hPanel > Bases de données MySQL pour obtenir nom, utilisateur et mot de passe.
return [
    'db' => [
        'host' => 'localhost',
        'name' => 'NOM_DE_LA_BASE',
        'user' => 'UTILISATEUR',
        'pass' => 'MOT_DE_PASSE',
    ],
    // true uniquement en local : affiche le détail des erreurs
    'debug' => false,
    // Source du taux automatique (USD -> CDF), sans clé d'API
    'rate_api_url' => 'https://open.er-api.com/v6/latest/USD',
    // Durée de validité du taux automatique avant nouvelle récupération (heures)
    'rate_refresh_hours' => 6,
];
