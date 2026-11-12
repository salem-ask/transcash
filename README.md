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

Prérequis : **PHP 8.1 ou plus** (hPanel › *Avancé* › *Configuration PHP* ; 8.2 ou 8.3 conseillé)
et le **certificat SSL** actif sur le domaine (le site force le HTTPS).

1. **Base de données** — hPanel › *Bases de données* › *Gestion* : créer une base et un utilisateur
   (noter le nom de la base, l'utilisateur et le mot de passe). Les tables sont créées
   **automatiquement** au premier appel de l'API (pas besoin de phpMyAdmin).
2. **Paquet** — `npm install && npm run build`, puis compresser **le contenu** de `dist/`
   (avec les fichiers cachés `.htaccess`) en un fichier ZIP.
3. **Envoi** — hPanel › *Fichiers* › *Gestionnaire de fichiers* : ouvrir le dossier du site
   (pour un sous-domaine, celui indiqué dans *Domaines* › *Sous-domaines*), y envoyer le ZIP,
   clic droit › *Extraire* dans ce même dossier, puis supprimer le ZIP.
   On doit voir `index.html`, `assets/`, `api/` et `.htaccess` directement dans le dossier du site.
4. **Configuration** — dans `api/`, créer `config.php` à partir de `config.example.php` (clic droit ›
   *Copier*, puis *Renommer*) et remplir nom de base, utilisateur et mot de passe
   (*Modifier* dans le gestionnaire de fichiers). Ce fichier ne doit jamais être mis sur GitHub.
5. **Vérification** — `https://votre-domaine/api/health` doit répondre `{"ok":true}`.
   Sinon le message indique quoi corriger (configuration absente, incomplète, ou base refusée).
6. **Premier lancement** — ouvrir le site : l'écran « Créons votre compte principal » apparaît
   une seule fois pour créer l'entreprise et le compte super administrateur.

**Mise à jour d'une installation existante :** refaire les étapes 2 et 3 avec un ZIP **sans** `api/config.php`
(le build n'en contient jamais) : les fichiers sont remplacés, la configuration reste, et l'API met
la base à jour toute seule au premier appel (`schema.sql` rejouable). Les fichiers de `api/migrations/`
ne servent plus qu'en secours (voir `api/migrations/README.md`).
