# TransCash

Suivi des versements journaliers des chauffeurs : engins (motos, tricycles, taxis, minibus, camions),
versements, dettes, dépenses et bénéfice réel. Interface en français, pensée pour téléphone.

- Interface : React + TypeScript + Tailwind (dossier `src/`)
- API : PHP 8 + MySQL, sans dépendance (dossier `api/`)
- Mémoire du projet, règles métier et avancement : [`CLAUDE.md`](CLAUDE.md)

## Développement local

```bash
npm install
cp api/config.example.php api/config.php   # puis renseigner la base MySQL locale
mysql -u <utilisateur> -p <base> < api/schema.sql
npm run api      # API sur http://127.0.0.1:8000
npm run dev      # interface sur http://localhost:5173 (les appels /api sont redirigés vers le port 8000)
```

Sans serveur ni base : `npm run build:preview` produit une version de **démonstration** (données
stockées dans le navigateur) dans `preview/`.

## Tests

```bash
npm test                                                        # règles métier (montants, droits)
TRANSCASH_CONFIG=/chemin/config.test.php npm run test:api       # API complète — la base indiquée est VIDÉE
npm run lint
```

## Déploiement sur Hostinger

Le site **https://transcash.bookline.digital** est relié à la branche GitHub `hostinger` : à chaque push sur cette
branche, Hostinger redéploie automatiquement.

```bash
npm run publish:hostinger   # construit l'application et la publie sur la branche « hostinger »
```

**Premier lancement :** l'application affiche un écran d'installation. Saisir le nom de la base, l'utilisateur et
le mot de passe MySQL (hPanel › Bases de données). Ils sont enregistrés sur le serveur dans `transcash-config.php`,
à côté de `public_html` (invisible depuis le web) ; les tables se créent toutes seules. Créer ensuite le compte principal.

**Installation manuelle (autre hébergeur) :** envoyer le contenu de `dist/` dans le dossier public, ouvrir le site
et suivre l'écran d'installation (ou créer `api/config.php` à partir de `api/config.example.php`).

Vérification rapide : `https://votre-domaine/api/health` doit répondre `{"ok":true}` une fois l'installation faite.
