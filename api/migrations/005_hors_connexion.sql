-- Phase 6 : anti-doublon générique pour la synchronisation hors connexion.
-- (Appliqué automatiquement par l'API ; ce fichier sert de trace.)

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id CHAR(36) NOT NULL PRIMARY KEY,           -- clé X-Idempotency-Key envoyée par l'appareil
  user_id CHAR(36) NULL,
  method VARCHAR(10) NOT NULL,
  path VARCHAR(255) NOT NULL,
  status SMALLINT NOT NULL,
  response MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_idem_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
