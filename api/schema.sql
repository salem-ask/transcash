-- TransCash — schéma MySQL / MariaDB (Hostinger)
-- À importer via phpMyAdmin (Hostinger > Bases de données > phpMyAdmin > Importer).
-- Conventions : id UUID (CHAR(36)) généré côté client ou serveur, owner_id sur chaque table métier,
-- montants en entiers (unité minimale de la devise), suppression logique (deleted_at).

SET NAMES utf8mb4;

-- Propriétaires (tenants)
CREATE TABLE IF NOT EXISTS owners (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Utilisateurs (comptes de connexion)
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  name VARCHAR(150) NOT NULL,
  login VARCHAR(150) NOT NULL,              -- e-mail ou numéro de téléphone
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('super_admin','admin','accountant','manager','driver') NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_users_login (login),
  KEY idx_users_owner (owner_id),
  CONSTRAINT fk_users_owner FOREIGN KEY (owner_id) REFERENCES owners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Paramètres (une ligne par propriétaire)
CREATE TABLE IF NOT EXISTS settings (
  owner_id CHAR(36) NOT NULL PRIMARY KEY,
  base_currency CHAR(3) NOT NULL DEFAULT 'CDF',       -- devise principale
  secondary_currency CHAR(3) NOT NULL DEFAULT 'USD',  -- devise d'équivalence
  show_equivalent TINYINT(1) NOT NULL DEFAULT 1,
  rate_mode ENUM('auto','manual') NOT NULL DEFAULT 'auto',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Africa/Kinshasa',
  rest_weekdays VARCHAR(32) NOT NULL DEFAULT '[0]',   -- JSON : 0 = dimanche … 6 = samedi
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_owner FOREIGN KEY (owner_id) REFERENCES owners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historique des taux de change : rate = nombre de CDF pour 1 USD.
-- Chaque opération financière enregistrera le taux utilisé (phase 3).
CREATE TABLE IF NOT EXISTS exchange_rates (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  base_currency CHAR(3) NOT NULL DEFAULT 'USD',
  quote_currency CHAR(3) NOT NULL DEFAULT 'CDF',
  rate DECIMAL(18,6) NOT NULL,
  source ENUM('auto','manual') NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),  -- microsecondes : ordre fiable
  KEY idx_rates_owner_date (owner_id, created_at),
  CONSTRAINT fk_rates_owner FOREIGN KEY (owner_id) REFERENCES owners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Journal des modifications (ancienne valeur, nouvelle valeur, date, utilisateur)
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  entity VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  action VARCHAR(20) NOT NULL,              -- create, update, delete, login…
  old_value JSON NULL,
  new_value JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_owner_date (owner_id, created_at),
  KEY idx_audit_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tentatives de connexion (anti force brute)
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  login VARCHAR(150) NOT NULL,
  ip VARCHAR(45) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_attempts_login (login, created_at),
  KEY idx_attempts_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============ Phase 2 : engins, chauffeurs, affectations ============
-- Engins
CREATE TABLE IF NOT EXISTS vehicles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  type ENUM('moto','tricycle','taxi','minibus','camion','autre') NOT NULL,
  name VARCHAR(100) NOT NULL,                 -- nom usuel : « Taxi 3 », « Moto rouge »
  plate VARCHAR(30) NULL,                     -- immatriculation
  model VARCHAR(100) NULL,                    -- marque / modèle
  daily_amount BIGINT NOT NULL,               -- montant journalier attendu ACTUEL (unité minimale)
  currency CHAR(3) NOT NULL,
  rest_weekdays VARCHAR(32) NULL,             -- JSON ; NULL = jours de repos des paramètres
  service_date DATE NOT NULL,                 -- début des versements attendus
  status ENUM('active','retired') NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  UNIQUE KEY uq_vehicles_plate (owner_id, plate),
  KEY idx_vehicles_owner (owner_id, status),
  CONSTRAINT fk_vehicles_owner FOREIGN KEY (owner_id) REFERENCES owners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Historique du montant journalier : le montant d'un jour passé ne change jamais
CREATE TABLE IF NOT EXISTS vehicle_amounts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  vehicle_id CHAR(36) NOT NULL,
  amount BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  effective_from DATE NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_amount_day (vehicle_id, effective_from),
  CONSTRAINT fk_amounts_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Chauffeurs
CREATE TABLE IF NOT EXISTS drivers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  id_number VARCHAR(60) NULL,                 -- pièce d'identité
  license_number VARCHAR(60) NULL,            -- permis de conduire
  address VARCHAR(255) NULL,
  notes TEXT NULL,
  user_id CHAR(36) NULL,                      -- compte de consultation (rôle chauffeur)
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_drivers_owner (owner_id, active),
  UNIQUE KEY uq_drivers_user (user_id),
  CONSTRAINT fk_drivers_owner FOREIGN KEY (owner_id) REFERENCES owners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Affectations chauffeur ↔ engin (end_date NULL = en cours ; un seul en cours par engin et par chauffeur)
CREATE TABLE IF NOT EXISTS assignments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  vehicle_id CHAR(36) NOT NULL,
  driver_id CHAR(36) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  created_by CHAR(36) NULL,
  ended_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_assign_vehicle (vehicle_id, start_date),
  KEY idx_assign_driver (driver_id, start_date),
  CONSTRAINT fk_assign_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  CONSTRAINT fk_assign_driver FOREIGN KEY (driver_id) REFERENCES drivers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
