-- Align existing databases with the customer passkey registration fields.
ALTER TABLE users
  ADD COLUMN phone VARCHAR(32) NULL AFTER display_name,
  ADD COLUMN gender ENUM('male','female','nonbinary','unspecified') NOT NULL DEFAULT 'unspecified' AFTER phone,
  ADD COLUMN age TINYINT UNSIGNED NULL AFTER gender;
