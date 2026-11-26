-- Explicit turn linkage: do not infer a reply from investigation or timestamps.
-- Existing unlinked replies are not replayed; never guess the association.
ALTER TABLE messages DROP CONSTRAINT messages_idempotency_key_key;
DROP INDEX messages_conversation_idempotency_idx;
CREATE UNIQUE INDEX messages_conversation_idempotency_idx
 ON messages(conversation_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE messages ADD CONSTRAINT messages_id_conversation_unique UNIQUE(id,conversation_id);
ALTER TABLE messages ADD COLUMN reply_to_message_id uuid;
ALTER TABLE messages ADD CONSTRAINT messages_reply_to_unique UNIQUE(reply_to_message_id);
ALTER TABLE messages ADD CONSTRAINT messages_reply_to_assistant_only
 CHECK(reply_to_message_id IS NULL OR role='assistant');
ALTER TABLE messages ADD CONSTRAINT messages_reply_to_same_conversation
 FOREIGN KEY(reply_to_message_id,conversation_id) REFERENCES messages(id,conversation_id) ON DELETE CASCADE;
