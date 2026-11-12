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
| Application installable | PWA via vite-plugin-pwa (service worker, manifeste) | Android et ordinateur, sans store, démarre hors ligne |
| Stockage local (offline) | IndexedDB via **idb-keyval** (1 Ko) + `src/data/offline.ts` | Cache des lectures, file d'envoi, « à corriger » |
| Exports | jsPDF 4 + jspdf-autotable / write-excel-file 4 (chargés au clic) | PDF et Excel côté client, 0 vulnérabilité connue |
| Reçus | Liens `wa.me` / `sms:` pré-remplis (phase 3) | Aucun coût d'API |
| Tests | **Vitest** (règles métier) + test d'intégration PHP (`api/tests/api_test.php`) + Playwright (parcours) | |

**Sécurité de l'API :** toute écriture exige l'en-tête `X-TransCash: 1` (anti-CSRF) ; blocage après
8 échecs de connexion en 15 min par identifiant (50 par IP) ; un compte désactivé est déconnecté immédiatement ; chaque requête
filtre par `owner_id` de l'utilisateur connecté (multi-tenant).

**Synchronisation hors connexion (phase 6) :**
- toutes les requêtes passent par `src/data/offline.ts` (instance : `src/data/offlineSetup.ts`) ;
- lecture réussie → copie sur l'appareil ; sans réseau → dernière copie ;
- écriture sans réseau → file ordonnée sur l'appareil, renvoyée avec la **même** `X-Idempotency-Key` ;
- serveur : table `idempotency_keys` → une clé déjà vue renvoie la réponse d'origine (aucun doublon) ;
- refus métier à la synchronisation → « À corriger » ; 401 / 5xx / réseau → on réessaie plus tard ;
- les versements et dépenses ont en plus leur propre UUID généré sur l'appareil.

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

**Grand livre (cœur du calcul, `src/domain/ledger.ts` ⇄ `api/lib/ledger.php`, à modifier ensemble) :**
- pour chaque jour où le chauffeur est affecté : attendu = montant en vigueur ce jour-là, sauf jour de repos
  (engin ou paramètres), panne, ou montant exceptionnel (marque `day_marks`) ;
- payé = somme des `payment_allocations` des versements non annulés ; reste = attendu − payé ;
- dette = reste des jours passés ; avance = payé sur les jours futurs ; tout est recalculé à chaque lecture ;
- immobilisations (`breakdowns`) = jours « panne » (via `withBreakdowns` / `load_marks`).

**Caisse :** solde = versements non annulés (sauf `driver_expense`) + apports − dépenses payées par la caisse − retraits.

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
│   ├── lib/                # core (BDD, JSON, journal), auth, taux, fleet (dates, montants), ledger (dettes)
│   ├── routes/             # auth, settings (+ taux), users, vehicles, drivers, payments (+ journées), finance (dépenses, caisse, immobilisations, échéances, journal), dashboard
│   └── tests/api_test.php  # test d'intégration (base de TEST vidée)
├── scripts/                # copy-api.mjs, preview-artifact.mjs, publish-hostinger.sh (publication)
└── src/
    ├── app/                # App (routes), Layout (navigation), session (contexte)
    ├── components/         # ui.tsx (Button, Field, Card…), Money.tsx
    ├── data/               # backend.ts (contrat), apiBackend.ts, demoBackend.ts, offline.ts (+ tests), offlineSetup.ts
    ├── domain/             # règles métier pures + tests (money, fleet, ledger, receipt, finance, permissions, types)
    ├── features/           # auth, dashboard, payments, expenses, cash, reminders, reports, audit, sync, vehicles, drivers, settings, users, account
    └── lib/                # format, useLoad (rechargement après synchro), search, flash (message), useSync (état hors ligne)
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
npm run publish:hostinger  # mise en ligne : branche « hostinger » → redéploiement automatique
```

**Déploiement (Hostinger) :** `npm run publish:hostinger` construit l'application et la pousse sur la branche
`hostinger` (uniquement les fichiers construits, aucun secret) ; Hostinger redéploie automatiquement.
Premier lancement : l'**écran d'installation** demande les identifiants MySQL et les enregistre dans
`transcash-config.php`, **à côté de** `public_html` (invisible depuis le web, jamais écrasé) ; le schéma s'installe seul.
Site prévu : **https://transcash.bookline.digital** (compte Hostinger `u977986808`, base `u977986808_transcash`,
hôte `localhost` depuis l'application ; le mot de passe n'est jamais dans le dépôt).

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
- [x] Déploiement sur Hostinger : https://transcash.bookline.digital, depuis la branche GitHub `hostinger`
      (redéploiement automatique à chaque push) ; base `u977986808_transcash`
- [ ] Écran d'installation à compléter par le propriétaire (identifiants de la base), puis création du compte principal

### Phase 1 — Authentification, tableau de bord, paramètres ✅
- [x] Installation : création du compte principal (entreprise + super admin), une seule fois
- [x] Connexion / déconnexion (e-mail ou téléphone), changement de mot de passe
- [x] Profils et rôles (super admin, admin, comptable, gestionnaire, chauffeur) + écran Équipe
- [x] Paramètres : devise principale CDF/USD, équivalence, fuseau horaire, jours de repos
- [x] Taux de change automatique / manuel, historique
- [x] Tableau de bord (squelette : chiffres à zéro jusqu'aux phases 2-3, taux du jour)
- [x] Vue « chauffeur » détaillée (phase 3 : sa situation, ses journées, ses reçus)

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

### Phase 3 — Versements et dettes ✅
- [x] Saisie de versement en **cochant les journées payées** : complet, partiel (dernière journée), retard, anticipé (31 j max)
- [x] Versement **exceptionnel** hors journalier (motif obligatoire) + **montant exceptionnel** d'une journée
- [x] Mode de paiement (espèces, Mobile Money + référence, banque), date de réception
- [x] Paiement dans l'autre devise converti au taux en vigueur, taux conservé avec le versement
- [x] Journées repos / panne / montant exceptionnel par engin (refusé si déjà payé au-delà)
- [x] Dette automatique sur journée travaillée non payée (grand livre calculé, rattaché au chauffeur)
- [x] Remboursement des arriérés (cocher les journées en retard, « Tout cocher »)
- [x] Reçu numéroté, envoi WhatsApp / SMS (liens pré-remplis), copie du texte
- [x] Annulation d'un versement avec motif (jamais de suppression)
- [x] Versement idempotent (UUID de l'appareil) : prêt pour le hors connexion
- [x] Tableau de bord : attendu / versé / manque du jour, encaissé, dettes totales, plus gros débiteurs
- [x] Vue par engin : journées récentes (chauffeur, attendu, payé) ; vue chauffeur : situation, impayés, reçus
- [x] Vue semaine (carte « Cette semaine » sur l'accueil, phase 5)

### Phase 4 — Dépenses, pannes, immobilisations ✅
- [x] Dépenses par engin ou générales (9 catégories, fournisseur, note), modifiables et annulables avec motif
- [x] Dépense **payée par le chauffeur** : comptée comme versement sur les journées cochées, sans sortie de caisse
- [x] Immobilisations sur plusieurs jours (en cours ou datées) : aucun versement exigé, remise en service, réparations liées
- [x] **Caisse unique** (solde FC et solde $) : versements reçus, dépenses de caisse, retraits et apports du propriétaire
- [x] ~~Clôture journalière~~ remplacée par la traçabilité : tout modifiable, chaque changement dans le journal
- [x] Journal d'activité consultable (ancienne / nouvelle valeur, date, utilisateur)
- [x] Échéances (assurance, vignette, vidange, contrôle technique, autre) : alerte N jours avant, renouvellement
- [x] Bilan par engin (versements, dépenses, bénéfice du mois) ; tableau de bord : dépenses, bénéfice réel, caisse, alertes

### Phase 5 — Rapports et exports ✅
- [x] Rapports : cette semaine, ce mois, mois dernier, 30 jours ou période libre ; tout le parc, un engin ou un chauffeur
- [x] Indicateurs : attendu, payé, reste dû, taux de recouvrement, versements reçus (caisse / dépenses chauffeur / exceptionnels), dépenses, bénéfice réel, jours impayés / panne / repos
- [x] Détail par engin, par chauffeur, jour par jour (graphique), dépenses par catégorie
- [x] Export PDF (jsPDF 4 + autotable) : résumé, tableaux, liste des versements et dépenses
- [x] Export Excel (write-excel-file 4) : 6 onglets (résumé, par engin, par chauffeur, par jour, versements, dépenses)
- [x] Installation / mise à jour automatique du schéma MySQL par l'API (plus besoin de phpMyAdmin)

### Phase 6 — Offline, synchronisation, sécurité ✅
- [x] Toutes les lectures : dernière copie gardée sur l'appareil (IndexedDB), servie sans réseau, bandeau « données du … »
- [x] Toutes les écritures : file d'envoi sur l'appareil, envoyée dans l'ordre au retour du réseau (en ligne, au retour sur l'appli, toutes les 30 s)
- [x] Sans perte ni doublon : clé `X-Idempotency-Key` sur chaque écriture, réponse d'origine renvoyée par le serveur en cas de renvoi
- [x] Conflits : le premier passe, le second va dans « À corriger » (écran Synchronisation : renvoyer / abandonner)
- [x] Déconnexion bloquée tant que des opérations ne sont pas envoyées ; copies locales effacées à la déconnexion
- [x] Application installable (PWA : manifeste, icônes, service worker) qui démarre sans réseau
- [x] Journal des modifications (fait en phase 4)
- [x] Sauvegarde : bouton « Télécharger une sauvegarde » (super admin, JSON complet sans mots de passe) + sauvegardes Hostinger
- [x] Protection contre les suppressions accidentelles : aucune suppression physique, annulation avec motif, confirmations à l'écran
- [x] Sécurité : en-têtes (CSP stricte, anti-iframe, HSTS), HTTPS forcé, cookies HttpOnly/SameSite, anti-CSRF, anti force brute
- [ ] Restauration d'une sauvegarde depuis l'application (non demandée pour l'instant)
- [ ] Notifications sur le téléphone pour les échéances

### Questions ouvertes
- Alertes d'échéance : affichées dans l'application uniquement (notifications téléphone : à décider).
- Hors connexion : une saisie qui dépend d'une autre saisie hors ligne (ex. versement sur un chauffeur créé hors ligne)
  part dans l'ordre ; si la première est refusée, la seconde le sera aussi (« À corriger »).
- Reçu d'un versement saisi hors ligne : numéro attribué par le serveur, donc disponible après synchronisation.
- Vidange suivie par date (pas encore au kilométrage).
- Indicatif des reçus WhatsApp/SMS : les numéros locaux (0…) sont considérés comme congolais (+243).
- Droit « marquer une journée » (repos/panne/montant exceptionnel) donné aussi au gestionnaire et au comptable.
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
| 2026-11-10 | Règles phase 2 validées : 1 engin par chauffeur, sans chauffeur = rien de dû, retrait = fin d'affectation, pas de désactivation en service | Réponse du propriétaire |
| 2026-11-10 | **Versement : on choisit les journées payées à chaque saisie** (pas d'imputation automatique) | Choix du propriétaire |
| 2026-11-10 | **Dette rattachée au chauffeur** (le suit s'il change d'engin ou part) | Choix du propriétaire |
| 2026-11-10 | **Exceptionnel = les deux** : versement hors journalier (ne rembourse pas de dette) et montant d'un jour modifié | Choix du propriétaire |
| 2026-11-10 | Dettes calculées à la volée (grand livre) depuis affectations, montants, marques et versements — rien de stocké | Une correction (panne, annulation) se répercute immédiatement, sans recalcul ni incohérence |
| 2026-11-10 | Surplus non affecté refusé : cocher un jour de plus ou passer en exceptionnel | Pas d'argent « flottant » non expliqué |
| 2026-11-10 | Versement converti une seule fois dans la devise des journées | Éviter les pertes d'arrondi jour par jour |
| 2026-11-10 | Reçus : numéro séquentiel par propriétaire ; envoi par liens wa.me / sms: | Aucun coût d'API |
| 2026-11-10 | Démo : données relatives à la date du jour | Le parc d'exemple reste réaliste quel que soit le jour d'ouverture |
| 2026-11-10 | **Une seule caisse** (un solde en FC, un en $), tous modes de paiement confondus | Choix du propriétaire |
| 2026-11-10 | **Dépense payée par le chauffeur = versement** sur les journées choisies (mode `driver_expense`), sans entrée en caisse | Choix du propriétaire |
| 2026-11-10 | **Pas de clôture journalière** : tout reste modifiable, chaque modification tracée (journal d'activité consultable) | Choix du propriétaire |
| 2026-11-10 | Retraits / apports et caisse : super admin, admin, comptable (`cash.manage`) | Choix du propriétaire |
| 2026-11-10 | Immobilisations (`breakdowns`) transformées en jours « panne » dans le grand livre ; une marque explicite du jour reste prioritaire | Une réparation finie à midi peut être une demi-journée |
| 2026-11-10 | Immobilisation refusée sur des jours déjà payés | Ne pas « perdre » un versement sur un jour devenu non dû |
| 2026-11-10 | Bénéfice = tous les versements (y compris dépenses payées par chauffeur) − toutes les dépenses | Cohérent : la dépense chauffeur est à la fois un revenu et une charge |
| 2026-11-10 | Rapports : l'API renvoie les données brutes, le calcul est fait par `src/domain/report.ts` (même code en ligne et en démo) | Une seule implémentation testée, pas d'écart entre les deux |
| 2026-11-10 | Exports générés dans le navigateur, bibliothèques chargées au clic | Rien à installer sur Hostinger ; application de base légère |
| 2026-11-10 | write-excel-file au lieu de SheetJS ; jsPDF 4 | SheetJS (npm) et jsPDF 2 ont des vulnérabilités connues |
| 2026-11-10 | Schéma MySQL appliqué automatiquement par l'API quand `schema.sql` change (table `schema_state`, verrou) | Déploiement sans phpMyAdmin ; `schema.sql` est rejouable |
| 2026-11-10 | Hébergement : `transcash.bookline.digital` (sous-domaine de bookline.digital) | Choix du propriétaire |
| 2026-11-10 | **Toutes les opérations possibles hors connexion**, synchronisées au retour du réseau | Choix du propriétaire |
| 2026-11-10 | **Conflit de synchronisation : le premier passe, le second « à corriger »** | Choix du propriétaire |
| 2026-11-10 | **Sauvegarde téléchargeable depuis l'application** (super admin) en plus d'Hostinger | Choix du propriétaire |
| 2026-11-10 | Anti-doublon générique par clé d'idempotence côté serveur, plutôt qu'un mécanisme par table | Une seule règle pour toutes les écritures, testée |
| 2026-11-10 | idb-keyval au lieu de Dexie | File et cache simples (clé → valeur) : 1 Ko au lieu de ~90 Ko |
| 2026-11-10 | Le service worker ne met pas l'API en cache (uniquement l'application) | Les données hors ligne sont gérées par la couche offline, avec des règles claires |
| 2026-11-10 | Déploiement en pause : l'envoi des fichiers depuis la session est bloqué par le réseau ; à finir depuis l'ordinateur du propriétaire | Demande du propriétaire |
| 2026-11-12 | **Déploiement par GitHub** : branche `hostinger` = application construite, déployée et redéployée automatiquement par Hostinger | Choix du propriétaire (pas d'ouverture réseau de la session) |
| 2026-11-12 | Écran d'installation au premier lancement ; configuration hors du dossier public, droits 600, étape impossible ensuite | Aucun secret sur GitHub, aucune manipulation de fichiers pour le propriétaire |

---

## 11. Règles de travail (chaque session)

1. Lire ce fichier au début de chaque session.
2. Après chaque fonctionnalité terminée : mettre à jour « État d'avancement » et
   « Journal des décisions », puis commit. **Push à la fin de chaque phase.**
3. Ne jamais stocker de secrets ou mots de passe dans le dépôt.
4. **Demander confirmation** au propriétaire avant toute décision qui change l'architecture
   ou une règle métier.
5. Interface simple, rapide, en français, pensée pour téléphone d'abord.
