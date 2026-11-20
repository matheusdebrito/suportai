CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','APPROVER','ADMIN')),
  active boolean NOT NULL DEFAULT true,
  must_change_password boolean NOT NULL DEFAULT false,
  auth_revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE password_resets (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  visibility text NOT NULL CHECK (visibility IN ('SHARED','RESTRICTED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE space_grants (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  can_read boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  PRIMARY KEY(user_id,space_id)
);
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces(id),
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('ARTICLE','PDF')),
  current_version_id uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT','IN_REVIEW','PUBLISHED','REJECTED','ARCHIVED')),
  index_status text NOT NULL DEFAULT 'PENDING' CHECK (index_status IN ('PENDING','READY','FAILED')),
  content text NOT NULL DEFAULT '',
  pdf_bytes bytea,
  authored_by uuid NOT NULL REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id,version_number),
  UNIQUE(document_id,id)
);
ALTER TABLE documents ADD CONSTRAINT current_version_same_document
  FOREIGN KEY(id,current_version_id) REFERENCES document_versions(document_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE knowledge_chunks (
  version_id uuid NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  content text NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple',content)) STORED,
  embedding vector(1536),
  PRIMARY KEY(version_id,ordinal)
);
CREATE INDEX knowledge_chunks_fts ON knowledge_chunks USING gin(search_vector);
CREATE INDEX knowledge_chunks_vector ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
CREATE TABLE ingestion_jobs (
  version_id uuid PRIMARY KEY REFERENCES document_versions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','DONE','FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_user_idx ON conversations(user_id);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  auth_revision integer NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  conversation_id uuid REFERENCES conversations(id),
  space_id uuid NOT NULL REFERENCES spaces(id),
  title text NOT NULL,
  content text NOT NULL,
  document_id uuid REFERENCES documents(id),
  base_version_id uuid REFERENCES document_versions(id),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  confirmed_at timestamptz,
  result_version_id uuid REFERENCES document_versions(id)
);
CREATE TABLE audit_events (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  resource_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  message_id uuid NOT NULL REFERENCES messages(id),
  rating text NOT NULL CHECK (rating IN ('GOOD','BAD')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO spaces(name,visibility) VALUES ('Conhecimento geral','SHARED'),('TI - restrito','RESTRICTED');
