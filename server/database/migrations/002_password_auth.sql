USE style_rinero;

ALTER TABLE users
  ADD COLUMN password_hash VARCHAR(200) NULL AFTER email;
