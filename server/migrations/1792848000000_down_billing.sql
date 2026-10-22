DROP TABLE IF EXISTS webhook_events;
DROP TABLE IF EXISTS subscription_events;
DROP TABLE IF EXISTS subscriptions;

ALTER TABLE users
    DROP COLUMN IF EXISTS plan_period_end,
    DROP COLUMN IF EXISTS plan_period_start,
    DROP COLUMN IF EXISTS paddle_customer_id;
