-- Telemetry table for request-level metrics and observability
-- Does NOT store prompts, document excerpts, credentials, or user emails

CREATE TABLE request_telemetry (
  id bigserial PRIMARY KEY,
  request_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  latency_ms integer NOT NULL,
  http_status smallint NOT NULL,
  stop_reason text CHECK (stop_reason IN (
    'answered','clarified','no_evidence','model_interrupted','unsafe_answer',
    'provider_failure','search_unavailable','step_budget','time_budget',
    'token_budget','repeated_search','tool_budget','read_timeout','model_timeout',
    'source_inaccessible','source_conflict','other'
  )),
  clarification_requested boolean NOT NULL DEFAULT false,
  abstained boolean NOT NULL DEFAULT false,
  idempotent_hit boolean NOT NULL DEFAULT false,
  error_type text,
  prompt_tokens bigint NOT NULL DEFAULT 0,
  completion_tokens bigint NOT NULL DEFAULT 0
);

CREATE INDEX request_telemetry_timestamp_idx ON request_telemetry (timestamp);
CREATE INDEX request_telemetry_conversation_idx ON request_telemetry (conversation_id);
CREATE INDEX request_telemetry_user_idx ON request_telemetry (user_id);
CREATE INDEX request_telemetry_status_idx ON request_telemetry (http_status);

-- Partition by month for retention (optional, can be enabled later)
-- ALTER TABLE request_telemetry PARTITION BY RANGE (timestamp);