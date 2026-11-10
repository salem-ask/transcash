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

1. **Base de données** — hPanel › *Bases de données MySQL* : créer une base et un utilisateur.
   Les tables sont créées automatiquement au premier appel de l'API (pas besoin de phpMyAdmin).
2. **Build** — sur votre ordinateur : `npm install && npm run build`. Le dossier `dist/` contient
   l'interface **et** l'API (`dist/api`), sans fichier de configuration.
3. **Envoi** — hPanel › *Gestionnaire de fichiers* (ou FTP) : envoyer **le contenu** de `dist/`
   dans `public_html/` (ou dans un sous-dossier).
4. **Configuration** — dans `public_html/api/`, copier `config.example.php` en `config.php` et
   remplir nom de base, utilisateur et mot de passe. Ce fichier ne doit jamais être mis sur GitHub.
5. **HTTPS** — activer le certificat SSL gratuit dans hPanel (le cookie de session devient alors sécurisé).
6. **Premier lancement** — ouvrir le site : l'écran « Créons votre compte principal » apparaît
   une seule fois pour créer l'entreprise et le compte super administrateur.

**Mise à jour d'une installation existante :** importer dans phpMyAdmin, dans l'ordre, les fichiers de
`api/migrations/` qui n'ont pas encore été appliqués (voir `api/migrations/README.md`), puis renvoyer `dist/`.

Vérification rapide : `https://votre-domaine/api/health` doit répondre `{"ok":true}`.
