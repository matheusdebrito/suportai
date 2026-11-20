-- Improve title similarity for typo-tolerant duplicate suggestions.
-- Requires the standard PostgreSQL contrib extension pg_trgm.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
