-- users.plan stays the plan the user is entitled to now; the Paddle webhook keeps it in step
-- with the live subscription, and plan_period_* is that subscription's billing period.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS paddle_customer_id text UNIQUE,
    ADD COLUMN IF NOT EXISTS plan_period_start  timestamptz,
    ADD COLUMN IF NOT EXISTS plan_period_end    timestamptz;

CREATE TABLE IF NOT EXISTS subscriptions
(
    id                     uuid PRIMARY KEY     DEFAULT gen_random_uuid(),
    user_id                uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    paddle_subscription_id text        NOT NULL UNIQUE,
    plan                   text        NOT NULL,
    paddle_price_id        text        NOT NULL,
    status                 text        NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'paused', 'canceled')),
    current_period_start   timestamptz,
    current_period_end     timestamptz,
    cancel_at_period_end   boolean     NOT NULL DEFAULT false,
    canceled_at            timestamptz,
    -- occurred_at of the last Paddle event applied, so a late, older event can't undo a newer one.
    last_event_at          timestamptz NOT NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

-- A user has at most one live subscription; ended ones stay for history.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_live_per_user
    ON subscriptions (user_id) WHERE status IN ('trialing', 'active', 'past_due');

CREATE TABLE IF NOT EXISTS subscription_events
(
    id              bigserial PRIMARY KEY,
    subscription_id uuid        NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
    type            text        NOT NULL,
    from_plan       text,
    to_plan         text,
    from_status     text,
    to_status       text,
    payload         jsonb       NOT NULL DEFAULT '{}',
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_events_subscription_idx
    ON subscription_events (subscription_id, created_at DESC);

-- Every webhook Paddle delivers, kept before it is applied; a redelivered event_id is a no-op.
CREATE TABLE IF NOT EXISTS webhook_events
(
    provider     text        NOT NULL,
    event_id     text        NOT NULL,
    type         text        NOT NULL,
    occurred_at  timestamptz,
    received_at  timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    payload      jsonb       NOT NULL,
    PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS webhook_events_pending_idx
    ON webhook_events (received_at) WHERE processed_at IS NULL;
