-- plan_status: the live subscription's status, so a failed renewal can pause Sloth credit.
-- credit_window_start / credit_bonus_micros: an upgrade restarts the credit window mid-period
-- and carries the old plan's unused credit into it.
-- checkout_*: the open checkout, reused so a second click can't start a second subscription.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS plan_status                  text,
    ADD COLUMN IF NOT EXISTS credit_window_start          timestamptz,
    ADD COLUMN IF NOT EXISTS credit_bonus_micros          bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS checkout_transaction_id      text,
    ADD COLUMN IF NOT EXISTS checkout_plan                text,
    ADD COLUMN IF NOT EXISTS checkout_created_at          timestamptz;

UPDATE users u
SET plan_status = s.status
FROM subscriptions s
WHERE s.user_id = u.id
  AND s.status IN ('trialing', 'active', 'past_due')
  AND u.plan_status IS NULL;

-- entitled_plan: what the user gets this period. A downgrade changes plan (what Paddle bills
-- next) at once, but the user keeps the plan they paid for until the period ends.
-- pending_next_billed_at: a renewal date Paddle still has to be told about after an upgrade.
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS entitled_plan          text,
    ADD COLUMN IF NOT EXISTS pending_next_billed_at timestamptz;

UPDATE subscriptions SET entitled_plan = plan WHERE entitled_plan IS NULL;
ALTER TABLE subscriptions ALTER COLUMN entitled_plan SET NOT NULL;

-- An event that can never apply (unknown price, unknown user) is parked here instead of retried.
ALTER TABLE webhook_events
    ADD COLUMN IF NOT EXISTS failed_at timestamptz,
    ADD COLUMN IF NOT EXISTS error     text;

DROP INDEX IF EXISTS webhook_events_pending_idx;
CREATE INDEX IF NOT EXISTS webhook_events_pending_idx
    ON webhook_events (received_at) WHERE processed_at IS NULL AND failed_at IS NULL;
