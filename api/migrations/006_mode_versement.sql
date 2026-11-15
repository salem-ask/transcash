-- Mode de versement de l'entreprise, historisé par date d'effet.
-- fixed : montant fixe par jour, dette si non payé (par défaut) ; free : montant libre, aucune dette.
-- (Appliqué automatiquement par l'API ; ce fichier sert de trace.)

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS payment_modes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  mode ENUM('fixed','free') NOT NULL,
  effective_from DATE NOT NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mode_day (owner_id, effective_from),
  CONSTRAINT fk_modes_owner FOREIGN KEY (owner_id) REFERENCES owners(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
