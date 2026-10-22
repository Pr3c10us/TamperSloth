ALTER TABLE model_usage ADD COLUMN IF NOT EXISTS run_id text;

CREATE INDEX IF NOT EXISTS model_usage_user_run_idx ON model_usage (user_id, run_id) WHERE run_id IS NOT NULL;
