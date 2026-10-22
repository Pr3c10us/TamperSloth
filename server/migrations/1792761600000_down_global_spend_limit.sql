DROP VIEW IF EXISTS spend_limit_today;

DROP TRIGGER IF EXISTS model_usage_daily_spend ON model_usage;
DROP FUNCTION IF EXISTS daily_spend_add();
DROP TABLE IF EXISTS daily_spend;

DROP TABLE IF EXISTS spend_limit;
DROP FUNCTION IF EXISTS spend_limit_touch();
