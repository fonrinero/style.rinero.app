ALTER TABLE email_verification_tokens
  ADD COLUMN native_code_hash BINARY(32) NULL AFTER consumed_at,
  ADD COLUMN native_grant_hash BINARY(32) NULL AFTER native_code_hash;
