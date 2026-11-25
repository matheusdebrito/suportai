-- Enforce conversation ownership when storing a topic and cascade its deletion.
ALTER TABLE conversations ADD CONSTRAINT conversations_id_user_unique UNIQUE (id, user_id);

CREATE TABLE investigations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id uuid NOT NULL,
 user_id uuid NOT NULL,
 auth_revision integer NOT NULL CHECK (auth_revision >= 0),
 revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
 topic text NOT NULL CHECK (btrim(topic) <> '' AND char_length(topic) <= 160),
 equipment_or_system text CHECK (char_length(equipment_or_system) <= 160),
 environment text CHECK (char_length(environment) <= 160),
 last_activity_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT investigations_conversation_owner_fk FOREIGN KEY (conversation_id, user_id)
  REFERENCES conversations (id, user_id) ON DELETE CASCADE
);
CREATE INDEX investigations_conversation_idx ON investigations (conversation_id, user_id);
CREATE INDEX investigations_last_activity_idx ON investigations (last_activity_at);

CREATE TABLE investigation_notes (
 investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK (kind IN ('REPORTED_FACT', 'HYPOTHESIS', 'OPEN_QUESTION', 'TEST')),
 position smallint NOT NULL CHECK (position BETWEEN 1 AND 12),
 content text NOT NULL CHECK (btrim(content) <> '' AND char_length(content) <= 400),
 test_result text CHECK (test_result IS NULL OR
  (kind = 'TEST' AND btrim(test_result) <> '' AND char_length(test_result) <= 400)),
 PRIMARY KEY (investigation_id, kind, position)
);

CREATE TABLE investigation_sources (
 investigation_id uuid NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
 -- Keep the reference slot when the version is deleted so reads can reject stale memory.
 version_id uuid REFERENCES document_versions(id) ON DELETE SET NULL,
 position smallint NOT NULL CHECK (position BETWEEN 1 AND 12),
 PRIMARY KEY (investigation_id, position),
 UNIQUE (investigation_id, version_id)
);
CREATE INDEX investigation_sources_version_idx ON investigation_sources (version_id);

-- Keep the subject marker on history even when investigation data expires.
ALTER TABLE messages ADD COLUMN investigation_id uuid;
-- Context dependencies are separate from citations and survive version deletion.
ALTER TABLE messages ADD COLUMN context_source_version_ids uuid[] NOT NULL DEFAULT '{}';
