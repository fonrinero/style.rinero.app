CREATE DATABASE IF NOT EXISTS style_rinero CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE style_rinero;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NULL,
  display_name VARCHAR(160) NOT NULL,
  phone VARCHAR(32) NULL,
  gender ENUM('male','female','nonbinary','unspecified') NOT NULL DEFAULT 'unspecified',
  age TINYINT UNSIGNED NULL,
  role ENUM('customer','business_owner','staff','admin') NOT NULL DEFAULT 'customer',
  preferred_language ENUM('en','el','es') NOT NULL DEFAULT 'en',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  credential_id VARCHAR(1024) NOT NULL UNIQUE,
  public_key MEDIUMBLOB NOT NULL,
  sign_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  CONSTRAINT fk_passkey_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id CHAR(36) PRIMARY KEY,
  challenge_hash BINARY(32) NOT NULL UNIQUE,
  user_id CHAR(36) NULL,
  purpose ENUM('register','authenticate') NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_challenge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX ix_challenge_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash BINARY(32) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX ix_session_expiry (expires_at, revoked_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS family_profiles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  age TINYINT UNSIGNED NOT NULL,
  gender ENUM('male','female','nonbinary','unspecified') NOT NULL DEFAULT 'unspecified',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX ix_profile_owner (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS businesses (
  id CHAR(36) PRIMARY KEY,
  owner_user_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  accepts_children BOOLEAN NOT NULL DEFAULT FALSE,
  minimum_child_age TINYINT UNSIGNED NULL,
  cancellation_hours SMALLINT UNSIGNED NOT NULL DEFAULT 4,
  payment_mode ENUM('full','deposit','onsite') NOT NULL DEFAULT 'onsite',
  deposit_amount_cents INT UNSIGNED NULL,
  logo_url VARCHAR(500) NULL,
  cover_photo_url VARCHAR(500) NULL,
  stripe_connected_account VARCHAR(100) NULL,
  status ENUM('pending','active','suspended') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_business_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS locations (
  id CHAR(36) PRIMARY KEY,
  business_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'IE',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Dublin',
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  phone VARCHAR(32) NULL,
  photo_url VARCHAR(500) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_location_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  INDEX ix_location_city (city, active)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS business_memberships (
  id CHAR(36) PRIMARY KEY,
  business_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  access_role ENUM('owner','manager','staff') NOT NULL DEFAULT 'staff',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_business_user (business_id,user_id),
  CONSTRAINT fk_membership_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS professionals (
  id CHAR(36) PRIMARY KEY,
  business_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  name VARCHAR(120) NOT NULL,
  bio TEXT,
  photo_url VARCHAR(500),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_prof_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_prof_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS services (
  id CHAR(36) PRIMARY KEY,
  business_id CHAR(36) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  audience ENUM('men','women','all') NOT NULL DEFAULT 'all',
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  price_cents INT UNSIGNED NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_service_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  INDEX ix_service_browse (active, audience)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS professional_services (
  professional_id CHAR(36) NOT NULL,
  service_id CHAR(36) NOT NULL,
  PRIMARY KEY (professional_id, service_id),
  CONSTRAINT fk_ps_prof FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS availability_rules (
  id CHAR(36) PRIMARY KEY,
  professional_id CHAR(36) NOT NULL,
  location_id CHAR(36) NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_start TIME NULL,
  break_end TIME NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_rule_prof FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  CONSTRAINT fk_rule_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id CHAR(36) PRIMARY KEY,
  professional_id CHAR(36) NOT NULL,
  location_id CHAR(36) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  exception_type ENUM('time_off','break','extra_hours') NOT NULL,
  note VARCHAR(200) NULL,
  CONSTRAINT fk_exception_prof FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE,
  CONSTRAINT fk_exception_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
  INDEX ix_exception_window (professional_id,starts_at,ends_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bookings (
  id CHAR(36) PRIMARY KEY,
  public_code CHAR(12) NOT NULL UNIQUE,
  customer_user_id CHAR(36) NOT NULL,
  family_profile_id CHAR(36) NULL,
  business_id CHAR(36) NOT NULL,
  location_id CHAR(36) NOT NULL,
  professional_id CHAR(36) NOT NULL,
  service_id CHAR(36) NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  price_cents INT UNSIGNED NOT NULL,
  payment_status ENUM('not_required','pending','paid','refunded','forfeited') NOT NULL DEFAULT 'not_required',
  booking_status ENUM('pending_payment','confirmed','cancelled','no_show','completed') NOT NULL DEFAULT 'confirmed',
  completed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_booking_customer FOREIGN KEY (customer_user_id) REFERENCES users(id),
  CONSTRAINT fk_booking_profile FOREIGN KEY (family_profile_id) REFERENCES family_profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_booking_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_booking_location FOREIGN KEY (location_id) REFERENCES locations(id),
  CONSTRAINT fk_booking_prof FOREIGN KEY (professional_id) REFERENCES professionals(id),
  CONSTRAINT fk_booking_service FOREIGN KEY (service_id) REFERENCES services(id),
  INDEX ix_booking_prof_time (professional_id, starts_at, ends_at, booking_status),
  INDEX ix_booking_customer (customer_user_id, starts_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_transactions (
  id CHAR(36) PRIMARY KEY,
  booking_id CHAR(36) NOT NULL,
  business_id CHAR(36) NOT NULL,
  provider ENUM('stripe','revolut','onsite') NOT NULL,
  provider_payment_id VARCHAR(180) NULL UNIQUE,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  gross_cents INT UNSIGNED NOT NULL,
  platform_fee_cents INT UNSIGNED NOT NULL DEFAULT 50,
  processor_fee_cents INT UNSIGNED NULL,
  business_net_cents INT UNSIGNED NOT NULL,
  payout_status ENUM('not_applicable','pending','paid','held','refunded') NOT NULL DEFAULT 'pending',
  payment_status ENUM('requires_action','pending','succeeded','failed','partially_refunded','refunded') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES bookings(id),
  CONSTRAINT fk_payment_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  INDEX ix_payment_business_status (business_id,payout_status,created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id CHAR(36) PRIMARY KEY,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  whatsapp_number VARCHAR(32) NULL,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_consent_at DATETIME NULL,
  whatsapp_consent_version VARCHAR(40) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS privacy_consents (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  consent_type ENUM('terms','privacy_notice','marketing_email','marketing_whatsapp','booking_notifications') NOT NULL,
  policy_version VARCHAR(40) NOT NULL,
  granted BOOLEAN NOT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_consent_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX ix_consent_user_type (user_id,consent_type,recorded_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS privacy_requests (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  request_type ENUM('access','export','rectification','erasure') NOT NULL,
  status ENUM('received','processing','completed','rejected') NOT NULL DEFAULT 'received',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  CONSTRAINT fk_privacy_request_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shop_bans (
  id CHAR(36) PRIMARY KEY,
  business_id CHAR(36) NOT NULL,
  customer_user_id CHAR(36) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_by_user_id CHAR(36) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_shop_customer_ban (business_id,customer_user_id),
  CONSTRAINT fk_ban_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  CONSTRAINT fk_ban_customer FOREIGN KEY (customer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ban_actor FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS loyalty_programs (
  id CHAR(36) PRIMARY KEY,
  business_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  stamps_required TINYINT UNSIGNED NOT NULL,
  reward_description VARCHAR(240) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_loyalty_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS loyalty_events (
  id CHAR(36) PRIMARY KEY,
  program_id CHAR(36) NOT NULL,
  customer_user_id CHAR(36) NOT NULL,
  booking_id CHAR(36) NULL,
  event_type ENUM('stamp','reward_issued','reward_redeemed','adjustment') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_le_program FOREIGN KEY (program_id) REFERENCES loyalty_programs(id),
  CONSTRAINT fk_le_customer FOREIGN KEY (customer_user_id) REFERENCES users(id),
  CONSTRAINT fk_le_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  UNIQUE KEY uq_booking_stamp (booking_id, event_type)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS business_listings (
  id CHAR(36) PRIMARY KEY,
  business_id CHAR(36) NOT NULL,
  listing_type ENUM('job','chair_rental') NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  contact_email VARCHAR(254) NOT NULL,
  contact_phone VARCHAR(32) NULL,
  city VARCHAR(100) NOT NULL,
  contact_url VARCHAR(500) NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_listing_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
  INDEX ix_listing_public (published, listing_type, city)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reviews (
  id CHAR(36) PRIMARY KEY,
  booking_id CHAR(36) NOT NULL UNIQUE,
  customer_user_id CHAR(36) NOT NULL,
  business_id CHAR(36) NOT NULL,
  professional_id CHAR(36) NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(1000),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_review_booking FOREIGN KEY (booking_id) REFERENCES bookings(id),
  CONSTRAINT fk_review_customer FOREIGN KEY (customer_user_id) REFERENCES users(id),
  CONSTRAINT fk_review_business FOREIGN KEY (business_id) REFERENCES businesses(id),
  CONSTRAINT fk_review_prof FOREIGN KEY (professional_id) REFERENCES professionals(id)
) ENGINE=InnoDB;
