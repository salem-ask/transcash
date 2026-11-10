-- Phase 2 : engins, chauffeurs, affectations.
-- À importer dans phpMyAdmin sur une base créée en phase 1 (déjà inclus dans schema.sql pour une installation neuve).

SET NAMES utf8mb4;

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
