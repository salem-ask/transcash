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

## 5. Stack technique (validée le 2026-11-10)

| Besoin | Choix proposé | Pourquoi |
|--------|---------------|----------|
| Interface | **React + TypeScript + Vite** | Rapide, écosystème large, typage sûr pour les calculs d'argent |
| Application installable | **PWA** (vite-plugin-pwa) | Installable sur Android et ordinateur sans passer par un store ; une seule base de code |
| Style | **Tailwind CSS** | Interface mobile d'abord, légère |
| Stockage local (offline) | **IndexedDB via Dexie.js** | Saisie hors connexion, file d'attente de synchronisation |
| Backend / base de données | **Supabase** (PostgreSQL + Auth + Row Level Security) | Multi-tenant par RLS, authentification incluse, offre gratuite pour démarrer |
| Exports | jsPDF / SheetJS (xlsx) | PDF et Excel côté client |
| Reçus | Liens `wa.me` / `sms:` pré-remplis | Aucun coût d'API au départ |
| Tests | **Vitest** (unitaires, règles de calcul) + **Playwright** (parcours) | |
| Hébergement de l'application | **Hostinger** (fichiers statiques du build `dist/`) | Choix du propriétaire ; une PWA est un site statique, compatible avec l'hébergement mutualisé |
| Hébergement des données | **Supabase** (service en ligne, séparé d'Hostinger) | Hostinger mutualisé ne peut pas faire tourner PostgreSQL + Auth + RLS |

**Principes de synchronisation (sans perte ni doublon) :**
- chaque enregistrement a un **UUID généré sur l'appareil** → l'envoi est idempotent (upsert) ;
- champs `created_at`, `updated_at`, `deleted_at` (suppression logique), `version` ;
- file d'attente locale des opérations, rejouée à la reconnexion ;
- opérations clôturées = verrouillées côté serveur.

**Montants et devises :**
- montants stockés en **entiers** (plus petite unité de la devise : franc pour le CDF, cent pour l'USD),
  jamais en nombre à virgule ;
- devise principale **CDF (franc congolais)**, avec **équivalence en USD** affichable ; l'administrateur
  peut aussi choisir l'inverse (USD principal, équivalence en CDF) dans les paramètres ;
- le **taux de change** est saisi par l'administrateur (règles de détail en attente de validation, voir
  « Questions ouvertes ») ;
- d'autres devises seront ajoutées plus tard : le modèle porte un code devise (ISO 4217) sur chaque montant.

---

## 6. Structure des dossiers (prévue)

```
transcash/
├── CLAUDE.md
├── README.md
├── .gitignore
├── .env.example            # modèles de variables, SANS valeurs secrètes
├── package.json
├── public/                 # icônes, manifeste PWA
├── src/
│   ├── app/                # routes, mise en page, navigation
│   ├── features/           # un dossier par module
│   │   ├── auth/
│   │   ├── dashboard/
│   │   ├── settings/
│   │   ├── vehicles/       # engins
│   │   ├── drivers/        # chauffeurs
│   │   ├── payments/       # versements
│   │   ├── debts/          # dettes
│   │   ├── expenses/       # dépenses (P2)
│   │   ├── breakdowns/     # pannes / immobilisations (P2)
│   │   ├── cash/           # caisse, retraits, clôture (P2)
│   │   └── reports/        # rapports, exports (P2)
│   ├── domain/             # règles métier pures (calculs dettes, attendus…) + tests
│   ├── data/               # accès données : Dexie (local), Supabase (distant), synchro
│   ├── components/         # composants UI réutilisables
│   ├── lib/                # utilitaires (dates, formatage monnaie…)
│   └── i18n/               # textes en français
├── supabase/
│   └── migrations/         # schéma SQL, politiques RLS
└── tests/                  # tests de bout en bout (Playwright)
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

## 8. Commandes utiles (une fois le projet initialisé)

```bash
npm install          # installer les dépendances
npm run dev          # lancer en développement
npm run build        # construire la version de production
npm run preview      # tester la version construite (PWA)
npm test             # tests unitaires (Vitest)
npm run test:e2e     # tests de bout en bout (Playwright)
npm run lint         # vérification du code
```

**Déploiement (Hostinger) :** `npm run build`, puis envoyer le contenu de `dist/` dans `public_html/`
(gestionnaire de fichiers, FTP ou déploiement Git d'Hostinger). Prévoir une règle `.htaccess` qui renvoie
toutes les routes vers `index.html`.

---

## 9. État d'avancement

Légende : `[x]` fait · `[~]` en cours · `[ ]` à faire

### Fondations
- [x] Dépôt git initialisé, remote GitHub configuré
- [~] CLAUDE.md (mémoire du projet)
- [x] .gitignore
- [x] Validation de la stack technique
- [ ] Initialisation du projet (Vite + React + TS + PWA)
- [ ] Schéma de base de données multi-tenant + RLS

### Phase 1 — Authentification, tableau de bord, paramètres
- [ ] Connexion / déconnexion
- [ ] Profils et rôles (super admin, admin, comptable, gestionnaire, chauffeur)
- [ ] Paramètres (devise principale CDF/USD, équivalence, taux de change, fuseau horaire, jours de repos par défaut)
- [ ] Tableau de bord (squelette)

### Phase 2 — Engins et chauffeurs
- [ ] Engins (CRUD, montant journalier attendu, statut)
- [ ] Chauffeurs (CRUD)
- [ ] Affectation chauffeur ↔ engin + historique

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
- Taux de change CDF/USD : un taux unique modifiable, ou un taux du jour enregistré avec chaque opération ?
- Un versement peut-il être encaissé dans l'une ou l'autre devise (ex. chauffeur qui paie en USD un montant attendu en CDF) ?

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
| 2026-11-10 | Stack validée : React + TypeScript + Vite (PWA), Tailwind, Dexie, Supabase | Une seule base de code installable sur Android et ordinateur, offline possible, multi-tenant par RLS |
| 2026-11-10 | Application déployée sur Hostinger ; données sur Supabase | Choix du propriétaire pour l'hébergement ; Supabase pour la base et l'authentification |
| 2026-11-10 | Devise principale CDF avec équivalence USD (ou l'inverse, au choix de l'administrateur) ; autres devises plus tard | Réalité des paiements en RDC |
| 2026-11-10 | Push sur GitHub à la fin de chaque phase (commits petits entre-temps) | Demande du propriétaire |

---

## 11. Règles de travail (chaque session)

1. Lire ce fichier au début de chaque session.
2. Après chaque fonctionnalité terminée : mettre à jour « État d'avancement » et
   « Journal des décisions », puis commit. **Push à la fin de chaque phase.**
3. Ne jamais stocker de secrets ou mots de passe dans le dépôt.
4. **Demander confirmation** au propriétaire avant toute décision qui change l'architecture
   ou une règle métier.
5. Interface simple, rapide, en français, pensée pour téléphone d'abord.
