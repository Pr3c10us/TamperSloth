DROP INDEX IF EXISTS webhook_events_pending_idx;
CREATE INDEX IF NOT EXISTS webhook_events_pending_idx
    ON webhook_events (received_at) WHERE processed_at IS NULL;

ALTER TABLE webhook_events
    DROP COLUMN IF EXISTS error,
    DROP COLUMN IF EXISTS failed_at;

ALTER TABLE subscriptions
    DROP COLUMN IF EXISTS pending_next_billed_at,
    DROP COLUMN IF EXISTS entitled_plan;

ALTER TABLE users
    DROP COLUMN IF EXISTS checkout_created_at,
    DROP COLUMN IF EXISTS checkout_plan,
    DROP COLUMN IF EXISTS checkout_transaction_id,
    DROP COLUMN IF EXISTS credit_bonus_micros,
    DROP COLUMN IF EXISTS credit_window_start,
    DROP COLUMN IF EXISTS plan_status;
