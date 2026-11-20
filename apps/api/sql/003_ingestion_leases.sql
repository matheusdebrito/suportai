-- Safely reclaim slow ingestion work, preserving existing jobs.
ALTER TABLE ingestion_jobs ADD COLUMN lease_token uuid;
CREATE INDEX ingestion_jobs_claim_idx
  ON ingestion_jobs(updated_at,version_id) WHERE status IN ('PENDING','RUNNING');
