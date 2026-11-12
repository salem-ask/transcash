# Migrations

- `schema.sql` (dossier parent) = schéma **complet** pour une installation neuve.
- Ce dossier = changements à appliquer, dans l'ordre, sur une base **déjà installée**
  (phpMyAdmin › Importer). Chaque fichier est rejouable sans risque (`IF NOT EXISTS`).

| Fichier | Phase |
|---------|-------|
| `002_engins_chauffeurs.sql` | 2 — engins, chauffeurs, affectations |
| `003_versements_dettes.sql` | 3 — journées marquées, versements, répartition |
| `004_depenses_caisse_pannes.sql` | 4 — dépenses, caisse, immobilisations, échéances |
| `005_hors_connexion.sql` | 6 — anti-doublon de la synchronisation |

Depuis la phase 5, l'API applique `schema.sql` toute seule quand il change : ces fichiers restent une trace.
