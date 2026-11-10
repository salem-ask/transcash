# CLAUDE.md — Mémoire du projet TransCash

> À lire au début de chaque session. À mettre à jour après chaque fonctionnalité terminée
> (« État d'avancement » + « Journal des décisions »), puis commit. Push à la fin de chaque phase.

---

## 1. Présentation et objectif

**TransCash** est une application de suivi des versements journaliers des chauffeurs pour un parc
d'engins de transport : motos, tricycles, taxis, minibus, camions.

**Objectif :** savoir à tout moment, pour chaque engin et pour l'ensemble du parc :
- combien l'engin **doit rapporter** (montant attendu) ;
- combien a **été versé** ;
- les **dettes** et arriérés de chaque chauffeur ;
- les **dépenses** engagées ;
- le **bénéfice réel** (versements − dépenses).

**Utilisateurs :** le propriétaire et son équipe (admin, comptable, gestionnaire), et les chauffeurs
en consultation de leur propre situation.

**Contraintes d'usage :** interface simple, rapide, **en français**, **pensée pour téléphone d'abord**,
utilisable avec une connexion faible ou absente.

---

## 2. Décisions validées (règles métier)

1. **Multi-tenant dès le départ** : un seul propriétaire au lancement, mais toutes les données sont
   rattachées à un propriétaire (`owner_id` / organisation) et isolées les unes des autres.
2. **Un compte → plusieurs engins** : un même identifiant gère plusieurs engins, avec une
   **vue globale consolidée** et une **vue par engin**.
3. **Un seul chauffeur actif par engin à la fois**, avec **historique des affectations**
   (date de début / date de fin). Un mode « relais » (plusieurs chauffeurs) pourra venir plus tard.
4. **Journée sans versement = dette automatique**, sauf si la journée est marquée **« repos »** ou
   **« panne »**. On distingue clairement :
   - journée **non travaillée** (repos, panne) → aucune somme due ;
   - journée **travaillée non payée** → dette du montant attendu.
5. **Mode de paiement choisi à chaque versement** : espèces, Mobile Money ou banque.
6. **Aucun versement exigé pendant une immobilisation** (panne).
7. **Offline first** : la saisie se fait localement, puis se synchronise **sans perte ni doublon**.

---

## 3. Modules et fonctionnalités par priorité

### P1 — Lancement
- **Authentification et profils** : super admin, admin, comptable, gestionnaire, chauffeur (consultation seule).
- **Engins** : fiche (type, immatriculation, montant journalier attendu, jours de repos, statut).
- **Chauffeurs** : fiche, affectation à un engin, historique.
- **Versements** : complet, partiel, en retard, anticipé, exceptionnel ; calculs automatiques
  (attendu, versé, reste dû, avance) ; **reçu par WhatsApp / SMS**.
- **Dettes et arriérés** : génération automatique, solde par chauffeur et par engin, remboursements.
- **Tableau de bord** : chiffres du jour, de la semaine, du mois ; vue globale et par engin.

### P2
- **Dépenses par engin** (carburant, réparations, pièces, taxes…).
- **Pannes et immobilisations** (suspend l'obligation de versement).
- **Caisse générale**, **retraits du propriétaire**, **clôture journalière**
  (une opération validée et clôturée n'est plus modifiable).
- **Rapports et exports** PDF / Excel.
- **Alertes et rappels d'échéance** : assurance, vignette, vidange, visite technique.

### P3
- **Mode hors connexion** complet et synchronisation.
- **Application installable** (Android et ordinateur).
- **Sécurité** renforcée.
- **Journal des modifications** : ancienne valeur, nouvelle valeur, date, utilisateur.
- **Sauvegardes**.
- **Protection contre les suppressions accidentelles** (suppression logique, corbeille, confirmation).

### Plus tard
- Contrats et **location-vente**.
- **GPS** / géolocalisation des engins.

---

## 4. Plan de développement (6 phases)

| Phase | Contenu |
|------:|---------|
| 1 | Authentification, tableau de bord (squelette), paramètres |
| 2 | Engins et chauffeurs (affectations, historique) |
| 3 | Versements et dettes (calculs, reçus WhatsApp/SMS) |
| 4 | Dépenses, pannes, immobilisations |
| 5 | Rapports et exports PDF/Excel |
| 6 | Offline, synchronisation, sécurité |

> Remarque : même si l'offline complet est en phase 6, le modèle de données est conçu dès la phase 1
> pour le permettre (identifiants UUID générés côté client, horodatages, suppression logique),
> afin d'éviter une refonte.

---

## 5. Stack technique (validée — tout sur Hostinger)

| Besoin | Choix | Pourquoi |
|--------|-------|----------|
| Interface | **React 19 + TypeScript + Vite** | Rapide, typage sûr pour les calculs d'argent |
| Style | **Tailwind CSS 4** | Interface mobile d'abord, légère |
| Navigation | **HashRouter** (`#/parametres`) | Fonctionne sur Hostinger sans règle serveur et dans la prévisualisation |
| API | **PHP 8 sans framework** (`api/`), PDO | Tourne sur tout hébergement Hostinger, aucune dépendance à installer |
| Base de données | **MySQL / MariaDB Hostinger** | Inclus dans l'offre Hostinger |
| Authentification | Sessions PHP (cookie `HttpOnly`, `SameSite=Lax`), `password_hash` | Simple et sûr, même domaine que l'interface |
| Droits | `api/permissions.json`, lu par PHP **et** par l'interface | Une seule source de vérité |
| Prévisualisation | Build « preview » en un seul fichier HTML, **mode démo** (données dans le navigateur) | Voir l'application sans serveur (artefact claude.ai) |
| Application installable | PWA (phase 6) | Android et ordinateur, sans store |
| Stockage local (offline) | IndexedDB via Dexie.js (phase 6) | Saisie hors connexion, file de synchronisation |
| Exports | jsPDF / SheetJS (phase 5) | PDF et Excel côté client |
| Reçus | Liens `wa.me` / `sms:` pré-remplis (phase 3) | Aucun coût d'API |
| Tests | **Vitest** (règles métier) + test d'intégration PHP (`api/tests/api_test.php`) + Playwright (parcours) | |

**Sécurité de l'API :** toute écriture exige l'en-tête `X-TransCash: 1` (anti-CSRF) ; blocage après
8 échecs de connexion en 15 min ; un compte désactivé est déconnecté immédiatement ; chaque requête
filtre par `owner_id` de l'utilisateur connecté (multi-tenant).

**Principes de synchronisation (phase 6, prévus dès maintenant) :**
- chaque enregistrement a un **UUID** (généré sur l'appareil) → envoi idempotent (upsert) ;
- champs `created_at`, `updated_at`, `deleted_at` (suppression logique) ;
- file d'attente locale des opérations, rejouée à la reconnexion ;
- opérations clôturées = verrouillées côté serveur.

**Montants et devises :**
- montants stockés en **entiers** dans l'unité minimale : **CDF = 0 décimale** (franc),
  **USD = 2 décimales** (cent) — voir `src/domain/money.ts` ;
- devise principale **CDF**, équivalence **USD** affichable (ou l'inverse), au choix de l'administrateur ;
- **taux de change** = nombre de CDF pour 1 USD, **historisé** (table `exchange_rates`) :
  - mode **automatique** : récupéré sur `open.er-api.com` (sans clé), rafraîchi toutes les 6 h ;
    si la source est injoignable, le dernier taux connu est utilisé ;
  - mode **manuel** : saisi par admin / super admin / comptable ;
- un paiement dans l'autre devise est **converti au taux fixé par l'administrateur** ; chaque
  opération enregistrera le taux utilisé (phase 3) pour que l'historique ne change jamais ;
- d'autres devises plus tard : chaque montant porte un code ISO 4217.

---

## 6. Structure des dossiers

```
transcash/
├── CLAUDE.md
├── README.md               # installation et déploiement Hostinger
├── index.html
├── package.json
├── vite.config.ts          # modes : production (dist/) et preview (fichier unique, démo)
├── .env.preview            # VITE_BACKEND=demo (aucun secret)
├── api/                    # API PHP (copiée dans dist/api au build)
│   ├── index.php           # routeur unique
│   ├── .htaccess           # réécriture + blocage des fichiers sensibles
│   ├── config.example.php  # modèle ; config.php (secrets) n'est JAMAIS commité
│   ├── schema.sql          # schéma MySQL COMPLET (installation neuve)
│   ├── migrations/         # changements par phase pour une base déjà installée
│   ├── permissions.json    # droits par rôle (partagé avec l'interface)
│   ├── lib/                # core (BDD, JSON, journal), auth, taux, fleet (dates, montants)
│   ├── routes/             # auth, settings (+ taux), users, vehicles, drivers, dashboard
│   └── tests/api_test.php  # test d'intégration (base de TEST vidée)
├── scripts/                # copy-api.mjs, preview-artifact.mjs
└── src/
    ├── app/                # App (routes), Layout (navigation), session (contexte)
    ├── components/         # ui.tsx (Button, Field, Card…), Money.tsx
    ├── data/               # backend.ts (contrat), apiBackend.ts, demoBackend.ts
    ├── domain/             # règles métier pures + tests (money, fleet, permissions, types)
    ├── features/           # auth, dashboard, vehicles, drivers, settings, users, account (+ menu)
    └── lib/                # format (dates), useLoad (chargement), search (recherche sans accents)
```

---

## 7. Conventions de code

- **Langue** : interface et messages de commit en **français** ; code (variables, fonctions,
  tables) en **anglais** pour rester standard ; commentaires en français si utiles.
- **Commits** : petits, un par changement logique, format `type: description`
  (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`).
  Ex. : `docs: ajout du CLAUDE.md avec le plan`, `feat: saisie d'un versement partiel`.
- **Règles métier** isolées dans `src/domain/`, fonctions pures, **toujours testées**.
- **Argent** : entiers uniquement ; formatage à l'affichage seulement.
- **Dates** : jour métier calculé dans le fuseau horaire du propriétaire.
- **Données** : chaque table porte `owner_id`, `id` (UUID), `created_at`, `updated_at`,
  `deleted_at`, `created_by`, `updated_by`. Pas de suppression physique.
- **Secrets** : jamais dans le dépôt. Uniquement `.env.local` (ignoré par git) ; `.env.example`
  documente les noms de variables.
- **Mobile d'abord** : concevoir pour un écran de 360 px, gros boutons, saisie minimale.

---

## 8. Commandes utiles

```bash
npm install              # installer les dépendances
npm run dev              # interface en développement (http://localhost:5173), /api → port 8000
npm run api              # API PHP locale sur le port 8000 (nécessite api/config.php)
npm test                 # tests unitaires (Vitest)
TRANSCASH_CONFIG=/chemin/config.test.php npm run test:api   # tests API (base de TEST vidée !)
npm run lint             # vérification du code
npm run build            # build Hostinger → dist/ (interface + api/, sans config.php)
npm run build:preview    # prévisualisation démo → preview/artifact.html
```

**Déploiement (Hostinger) :** voir README.md. En bref : créer la base MySQL, importer
`api/schema.sql`, envoyer le contenu de `dist/` dans `public_html/`, créer `public_html/api/config.php`
à partir de `config.example.php`, ouvrir le site et créer le compte principal.

**Prévisualisation :** https://claude.ai/artifact/8n13guotYeo2WqaeFKJXJW (mode démo, privée).
La republier après chaque phase (`npm run build:preview`, puis publier `preview/artifact.html`).

---

## 9. État d'avancement

Légende : `[x]` fait · `[~]` en cours · `[ ]` à faire

### Fondations
- [x] Dépôt git initialisé, remote GitHub configuré
- [x] CLAUDE.md (mémoire du projet)
- [x] .gitignore
- [x] Validation de la stack technique
- [x] Initialisation du projet (Vite + React + TS + Tailwind)
- [x] Schéma MySQL multi-tenant (owners, users, settings, exchange_rates, audit_log, login_attempts)
- [x] API PHP (routeur, sessions, CSRF, anti force brute, journal des modifications)
- [x] Prévisualisation en mode démo (artefact)
- [ ] Premier déploiement sur Hostinger (en attente de la connexion Hostinger)

### Phase 1 — Authentification, tableau de bord, paramètres ✅
- [x] Installation : création du compte principal (entreprise + super admin), une seule fois
- [x] Connexion / déconnexion (e-mail ou téléphone), changement de mot de passe
- [x] Profils et rôles (super admin, admin, comptable, gestionnaire, chauffeur) + écran Équipe
- [x] Paramètres : devise principale CDF/USD, équivalence, fuseau horaire, jours de repos
- [x] Taux de change automatique / manuel, historique
- [x] Tableau de bord (squelette : chiffres à zéro jusqu'aux phases 2-3, taux du jour)
- [ ] Vue « chauffeur » détaillée (sera remplie en phase 3 avec ses versements et dettes)

### Phase 2 — Engins et chauffeurs ✅
- [x] Engins : type, nom, immatriculation (unique), modèle, mise en service, notes
- [x] Montant journalier attendu en CDF ou USD, **historisé par date** (« à partir du… »)
- [x] Jours de repos propres à un engin (sinon ceux des paramètres)
- [x] Retrait du parc / remise en service (historique conservé)
- [x] Chauffeurs : fiche (téléphone unique, pièce d'identité, permis, adresse), désactivation
- [x] Accès de consultation du chauffeur (identifiant = téléphone)
- [x] Affectation chauffeur ↔ engin datée, relève (l'ancien termine la veille), historique des deux côtés
- [x] Tableau de bord : attendu du jour (converti), état du parc (doivent verser / repos / sans chauffeur)
- [x] Navigation téléphone : Accueil, Engins, Chauffeurs, Menu

### Phase 3 — Versements et dettes
- [ ] Saisie de versement (complet, partiel, retard, anticipé, exceptionnel)
- [ ] Mode de paiement (espèces, Mobile Money, banque)
- [ ] Journées repos / panne
- [ ] Dette automatique sur journée travaillée non payée
- [ ] Remboursement des arriérés
- [ ] Reçu WhatsApp / SMS
- [ ] Tableau de bord complet (global + par engin)

### Phase 4 — Dépenses, pannes, immobilisations
- [ ] Dépenses par engin
- [ ] Pannes et immobilisations
- [ ] Caisse générale, retraits du propriétaire, clôture journalière
- [ ] Alertes d'échéance (assurance, vignette, vidange)

### Phase 5 — Rapports et exports
- [ ] Rapports (période, engin, chauffeur)
- [ ] Export PDF
- [ ] Export Excel

### Phase 6 — Offline, synchronisation, sécurité
- [ ] Stockage local + file de synchronisation
- [ ] Synchronisation sans perte ni doublon
- [ ] Application installable (Android, ordinateur)
- [ ] Journal des modifications
- [ ] Sauvegardes
- [ ] Protection contre les suppressions accidentelles

### Questions ouvertes
- Règles de la phase 2 appliquées sans validation explicite (à confirmer) :
  un chauffeur ne conduit **qu'un engin à la fois** ; un engin **sans chauffeur** ne doit rien ce jour-là
  (ni dette) ; le retrait du parc termine l'affectation ; un chauffeur en service ne peut pas être désactivé.
- Super admin : aujourd'hui = rôle le plus élevé **dans** une entreprise. Faut-il plus tard un
  super admin « plateforme » qui voit toutes les entreprises ?

---

## 10. Journal des décisions

| Date | Décision | Raison |
|------|----------|--------|
| 2026-11-10 | Base multi-tenant (données séparées par propriétaire) | Un seul propriétaire au départ, mais permettre d'évoluer sans refonte |
| 2026-11-10 | Un compte gère plusieurs engins (vue globale + vue par engin) | Besoin du propriétaire |
| 2026-11-10 | Un seul chauffeur actif par engin, historique conservé | Simplicité ; mode relais envisagé plus tard |
| 2026-11-10 | Journée sans versement = dette, sauf repos / panne | Distinguer journée non travaillée et journée travaillée non payée |
| 2026-11-10 | Mode de paiement choisi à chaque versement (espèces, Mobile Money, banque) | Refléter la réalité des encaissements |
| 2026-11-10 | Aucun versement exigé pendant une immobilisation | Le chauffeur ne peut pas travailler |
| 2026-11-10 | Offline first, synchronisation sans perte ni doublon | Connexion souvent instable sur le terrain |
| 2026-11-10 | Montants stockés en entiers | Éviter les erreurs d'arrondi |
| 2026-11-10 | Stack validée : React + TypeScript + Vite (PWA), Tailwind, Dexie, Supabase | *(Supabase remplacé, voir plus bas)* Une seule base de code installable sur Android et ordinateur, offline possible, multi-tenant par RLS |
| 2026-11-10 | Application déployée sur Hostinger ; données sur Supabase | *(remplacé, voir plus bas)* Choix du propriétaire pour l'hébergement ; Supabase pour la base et l'authentification |
| 2026-11-10 | Devise principale CDF avec équivalence USD (ou l'inverse, au choix de l'administrateur) ; autres devises plus tard | Réalité des paiements en RDC |
| 2026-11-10 | Push sur GitHub à la fin de chaque phase (commits petits entre-temps) | Demande du propriétaire |
| 2026-11-10 | **Tout sur Hostinger : Supabase abandonné** → API PHP 8 + MySQL | Décision du propriétaire ; PHP/MySQL fonctionnent sur toutes les offres Hostinger |
| 2026-11-10 | API PHP sans framework ni Composer | Déploiement par simple copie de fichiers, rien à installer sur le serveur |
| 2026-11-10 | Taux de change automatique **et** manuel, au choix de l'admin ; historisé | Décision du propriétaire |
| 2026-11-10 | Paiement dans l'autre devise converti au taux fixé par l'admin | Décision du propriétaire |
| 2026-11-10 | CDF sans décimale, USD au cent | Les centimes de franc ne circulent pas |
| 2026-11-10 | Mode démo (données dans le navigateur) pour la prévisualisation | Montrer l'application sans serveur |
| 2026-11-10 | Routage par `#` (HashRouter) | Aucune règle de réécriture nécessaire sur Hostinger |
| 2026-11-10 | Pas de fenêtres `prompt()`/`confirm()` : confirmations intégrées à l'écran | Plus pratique sur téléphone ; bloquées dans la prévisualisation |
| 2026-11-10 | Droits par rôle de `api/permissions.json` validés | Accord du propriétaire (« Oui, phase 2 ») |
| 2026-11-10 | Montant journalier historisé (`vehicle_amounts`, date d'effet) | Changer le tarif ne doit jamais modifier les dettes passées |
| 2026-11-10 | Affectations datées (`assignments`), relève = l'ancien termine la veille, aucun chevauchement | Savoir qui devait verser chaque jour |
| 2026-11-10 | Un chauffeur ne conduit qu'un engin à la fois | Cohérent avec « un chauffeur actif par engin » ; à confirmer |
| 2026-11-10 | Pas de suppression d'engin/chauffeur : retrait du parc / désactivation | Conserver l'historique, éviter les suppressions accidentelles |
| 2026-11-10 | Blocage de connexion par identifiant (8) et par IP (50) séparés | Les IP mobiles sont partagées en RDC |
| 2026-11-10 | Migrations SQL numérotées (`api/migrations/`) en plus de `schema.sql` | Mettre à jour une base déjà installée sur Hostinger |

---

## 11. Règles de travail (chaque session)

1. Lire ce fichier au début de chaque session.
2. Après chaque fonctionnalité terminée : mettre à jour « État d'avancement » et
   « Journal des décisions », puis commit. **Push à la fin de chaque phase.**
3. Ne jamais stocker de secrets ou mots de passe dans le dépôt.
4. **Demander confirmation** au propriétaire avant toute décision qui change l'architecture
   ou une règle métier.
5. Interface simple, rapide, en français, pensée pour téléphone d'abord.
