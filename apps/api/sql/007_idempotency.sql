-- Idempotency key for user messages (client-controlled deduplication)
ALTER TABLE messages ADD COLUMN idempotency_key uuid UNIQUE;

-- Index for fast lookup by conversation + key
CREATE INDEX messages_conversation_idempotency_idx
  ON messages (conversation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Constraint: only user messages can have idempotency key
ALTER TABLE messages ADD CONSTRAINT idempotency_key_user_only
  CHECK (idempotency_key IS NULL OR role = 'user');