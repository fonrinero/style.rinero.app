ALTER TABLE users
  ADD COLUMN email_verified_at DATETIME NULL AFTER email;

ALTER TABLE webauthn_challenges
  ADD COLUMN subject_email_hash BINARY(32) NULL AFTER user_id;

CREATE TABLE email_verification_tokens (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  token_hash BINARY(32) NOT NULL UNIQUE,
  purpose ENUM('registration','existing') NOT NULL,
  return_to ENUM('/account','/business-account') NOT NULL,
  expires_at DATETIME NOT NULL,
  verified_at DATETIME NULL,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_email_verification_email (email,created_at),
  INDEX ix_email_verification_expiry (expires_at)
) ENGINE=InnoDB;
