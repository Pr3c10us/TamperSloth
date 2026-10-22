DROP INDEX IF EXISTS model_usage_user_run_idx;

ALTER TABLE model_usage DROP COLUMN IF EXISTS run_id;
