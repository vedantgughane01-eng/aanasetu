CREATE DATABASE IF NOT EXISTS annasetu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE annasetu;

CREATE TABLE IF NOT EXISTS partners (
  partner_id VARCHAR(16) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  role ENUM('donor','ngo','volunteer') NOT NULL,
  partner_type VARCHAR(80) NULL,
  area VARCHAR(120) NOT NULL,
  address VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  capacity INT NULL,
  vehicle VARCHAR(40) NULL,
  ngo_id VARCHAR(16) NULL,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_partner_ngo FOREIGN KEY (ngo_id) REFERENCES partners(partner_id),
  INDEX idx_partners_role(role), INDEX idx_partners_ngo(ngo_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS donations (
  donation_id VARCHAR(24) PRIMARY KEY,
  qr_code VARCHAR(32) NOT NULL UNIQUE,
  donor_id VARCHAR(16) NOT NULL,
  ngo_id VARCHAR(16) NULL,
  volunteer_id VARCHAR(16) NULL,
  food_name VARCHAR(80) NOT NULL,
  category ENUM('cooked','packed','bakery','sweets','produce') NOT NULL,
  vegetarian BOOLEAN NOT NULL DEFAULT TRUE,
  meals INT NOT NULL,
  weight_kg DECIMAL(10,2) NOT NULL,
  listed_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  eta_at DATETIME(3) NULL,
  eta_total_ms BIGINT NULL,
  status ENUM('listed','claimed','enroute','picked','delivered','expired') NOT NULL DEFAULT 'listed',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_donation_donor FOREIGN KEY (donor_id) REFERENCES partners(partner_id),
  CONSTRAINT fk_donation_ngo FOREIGN KEY (ngo_id) REFERENCES partners(partner_id),
  CONSTRAINT fk_donation_volunteer FOREIGN KEY (volunteer_id) REFERENCES partners(partner_id),
  CONSTRAINT chk_donation_meals CHECK (meals BETWEEN 1 AND 5000),
  CONSTRAINT chk_donation_weight CHECK (weight_kg BETWEEN 0.5 AND 2000),
  INDEX idx_donations_status_expiry(status, expires_at), INDEX idx_donations_ngo(ngo_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS donation_events (
  event_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  donation_id VARCHAR(24) NOT NULL,
  status VARCHAR(20) NOT NULL,
  event_at DATETIME(3) NOT NULL,
  performed_by VARCHAR(120) NOT NULL,
  notes VARCHAR(255) NULL,
  CONSTRAINT fk_event_donation FOREIGN KEY (donation_id) REFERENCES donations(donation_id) ON DELETE CASCADE,
  INDEX idx_events_donation(donation_id, event_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pickup_verifications (
  verification_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  donation_id VARCHAR(24) NOT NULL,
  ngo_id VARCHAR(16) NOT NULL,
  result ENUM('success','failed') NOT NULL,
  verified_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_verification_donation FOREIGN KEY (donation_id) REFERENCES donations(donation_id),
  CONSTRAINT fk_verification_ngo FOREIGN KEY (ngo_id) REFERENCES partners(partner_id),
  INDEX idx_verification_donation(donation_id)
) ENGINE=InnoDB;
