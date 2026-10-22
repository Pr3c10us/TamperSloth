CREATE TABLE IF NOT EXISTS spend_limit
(
    id              boolean PRIMARY KEY DEFAULT true CHECK (id),
    daily_limit_usd numeric(12, 2) NOT NULL CHECK (daily_limit_usd >= 0),
    alert_percent   integer        NOT NULL DEFAULT 80 CHECK (alert_percent BETWEEN 1 AND 100),
    updated_at      timestamptz    NOT NULL DEFAULT now()
);

INSERT INTO spend_limit (daily_limit_usd) VALUES (50) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION spend_limit_touch() RETURNS trigger AS
$$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS spend_limit_touch ON spend_limit;
CREATE TRIGGER spend_limit_touch
    BEFORE UPDATE ON spend_limit
    FOR EACH ROW EXECUTE FUNCTION spend_limit_touch();

CREATE TABLE IF NOT EXISTS daily_spend
(
    day          date PRIMARY KEY,
    spent_micros bigint      NOT NULL DEFAULT 0,
    warned_at    timestamptz,
    tripped_at   timestamptz
);

CREATE OR REPLACE FUNCTION daily_spend_add() RETURNS trigger AS
$$
BEGIN
    INSERT INTO daily_spend (day, spent_micros)
    VALUES ((NEW.created_at AT TIME ZONE 'UTC')::date, NEW.cost_micros)
    ON CONFLICT (day) DO UPDATE SET spent_micros = daily_spend.spent_micros + EXCLUDED.spent_micros;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS model_usage_daily_spend ON model_usage;
CREATE TRIGGER model_usage_daily_spend
    AFTER INSERT ON model_usage
    FOR EACH ROW EXECUTE FUNCTION daily_spend_add();

