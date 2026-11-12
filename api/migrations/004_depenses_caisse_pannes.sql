-- Phase 4 : dépenses, caisse (retraits / apports), immobilisations, échéances.
-- À importer dans phpMyAdmin sur une base déjà installée (déjà inclus dans schema.sql pour une installation neuve).

SET NAMES utf8mb4;

-- Nouveau mode : dépense payée par le chauffeur (compte comme versement, n'entre pas en caisse)
ALTER TABLE payments MODIFY method ENUM('cash','mobile_money','bank','driver_expense') NOT NULL;

-- Immobilisations (pannes sur plusieurs jours). end_date NULL = encore immobilisé.
CREATE TABLE IF NOT EXISTS breakdowns (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  vehicle_id CHAR(36) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  reason VARCHAR(255) NOT NULL,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  cancel_reason VARCHAR(255) NULL,
  KEY idx_breakdowns_vehicle (vehicle_id, start_date),
  CONSTRAINT fk_breakdowns_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dépenses (par engin, ou générales si vehicle_id NULL)
CREATE TABLE IF NOT EXISTS expenses (
  id CHAR(36) NOT NULL PRIMARY KEY,           -- généré par l'appareil : pas de doublon
  owner_id CHAR(36) NOT NULL,
  vehicle_id CHAR(36) NULL,
  breakdown_id CHAR(36) NULL,                 -- réparation liée à une immobilisation
  category ENUM('fuel','repair','parts','maintenance','tax','insurance','fine','salary','other') NOT NULL,
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  spent_on DATE NOT NULL,
  paid_by ENUM('cash','driver') NOT NULL,     -- cash : sortie de caisse ; driver : avancée par le chauffeur
  driver_id CHAR(36) NULL,
  payment_id CHAR(36) NULL,                   -- pour paid_by = driver : le versement correspondant
  supplier VARCHAR(150) NULL,
  note VARCHAR(255) NULL,
  rate DECIMAL(18,6) NULL,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  cancelled_by CHAR(36) NULL,
  cancel_reason VARCHAR(255) NULL,
  KEY idx_expenses_owner_day (owner_id, spent_on),
  KEY idx_expenses_vehicle (vehicle_id, spent_on),
  CONSTRAINT fk_expenses_owner FOREIGN KEY (owner_id) REFERENCES owners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mouvements de caisse du propriétaire : retrait (sortie) ou apport (entrée, ex. solde initial)
CREATE TABLE IF NOT EXISTS cash_movements (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  kind ENUM('withdrawal','deposit') NOT NULL,
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  moved_on DATE NOT NULL,
  note VARCHAR(255) NULL,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  cancelled_at DATETIME NULL,
  cancelled_by CHAR(36) NULL,
  cancel_reason VARCHAR(255) NULL,
  KEY idx_cash_owner_day (owner_id, moved_on),
  CONSTRAINT fk_cash_owner FOREIGN KEY (owner_id) REFERENCES owners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Échéances par engin : assurance, vignette, vidange, contrôle technique…
CREATE TABLE IF NOT EXISTS reminders (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  vehicle_id CHAR(36) NOT NULL,
  kind ENUM('insurance','vignette','oil_change','inspection','other') NOT NULL,
  label VARCHAR(100) NULL,                    -- pour « autre »
  due_date DATE NOT NULL,
  notify_days SMALLINT NOT NULL DEFAULT 7,    -- alerter N jours avant
  notes VARCHAR(255) NULL,
  done_at DATE NULL,
  done_by CHAR(36) NULL,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_reminders_owner (owner_id, due_date),
  CONSTRAINT fk_reminders_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
