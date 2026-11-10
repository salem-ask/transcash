-- Phase 3 : journées marquées, versements, répartition sur les journées.
-- À importer dans phpMyAdmin sur une base déjà installée (déjà inclus dans schema.sql pour une installation neuve).

SET NAMES utf8mb4;

-- Journées marquées d'un engin : repos, panne, ou montant attendu exceptionnel
CREATE TABLE IF NOT EXISTS day_marks (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  vehicle_id CHAR(36) NOT NULL,
  day DATE NOT NULL,
  kind ENUM('rest','breakdown','override') NOT NULL,
  amount BIGINT NULL,                         -- pour override : montant attendu ce jour-là
  currency CHAR(3) NULL,
  reason VARCHAR(255) NULL,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,                   -- marque retirée (la ligne est réutilisée si on remarque le jour)
  UNIQUE KEY uq_mark_day (vehicle_id, day),
  KEY idx_marks_owner (owner_id, day),
  CONSTRAINT fk_marks_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Versements. L'id (UUID) est généré par l'appareil : renvoyer deux fois le même versement ne crée pas de doublon.
-- Un versement n'est jamais supprimé : il peut être ANNULÉ (avec motif), ce qui libère les journées payées.
CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  receipt_no INT UNSIGNED NOT NULL,           -- numéro de reçu, séquentiel par propriétaire
  driver_id CHAR(36) NOT NULL,
  vehicle_id CHAR(36) NULL,
  kind ENUM('daily','extra') NOT NULL,        -- daily : paie des journées ; extra : hors journalier
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  method ENUM('cash','mobile_money','bank') NOT NULL,
  reference VARCHAR(80) NULL,                 -- n° de transaction Mobile Money / banque
  paid_on DATE NOT NULL,                      -- date de réception de l'argent
  rate DECIMAL(18,6) NULL,                    -- taux (CDF pour 1 USD) en vigueur, conservé pour l'historique
  note VARCHAR(255) NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  cancelled_by CHAR(36) NULL,
  cancel_reason VARCHAR(255) NULL,
  UNIQUE KEY uq_receipt (owner_id, receipt_no),
  KEY idx_payments_owner_day (owner_id, paid_on),
  KEY idx_payments_driver (driver_id, paid_on),
  CONSTRAINT fk_payments_owner FOREIGN KEY (owner_id) REFERENCES owners(id),
  CONSTRAINT fk_payments_driver FOREIGN KEY (driver_id) REFERENCES drivers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Répartition d'un versement « daily » sur les journées payées (montant dans la devise de la journée)
CREATE TABLE IF NOT EXISTS payment_allocations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  payment_id CHAR(36) NOT NULL,
  driver_id CHAR(36) NOT NULL,
  vehicle_id CHAR(36) NOT NULL,
  day DATE NOT NULL,
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  KEY idx_alloc_payment (payment_id),
  KEY idx_alloc_driver_day (driver_id, day),
  KEY idx_alloc_vehicle_day (vehicle_id, day),
  CONSTRAINT fk_alloc_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
