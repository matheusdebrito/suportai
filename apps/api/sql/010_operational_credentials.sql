-- Operational credentials are deliberately outside documents, chunks and messages.
CREATE TABLE operational_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
 label text NOT NULL CHECK (length(label) BETWEEN 3 AND 80),
 ciphertext bytea NOT NULL,
 iv bytea NOT NULL CHECK (octet_length(iv)=12),
 tag bytea NOT NULL CHECK (octet_length(tag)=16),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(document_id,label)
);
CREATE TABLE operational_credential_grants (
 credential_id uuid NOT NULL REFERENCES operational_credentials(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(credential_id,user_id)
);
