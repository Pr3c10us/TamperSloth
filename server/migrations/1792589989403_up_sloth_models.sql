CREATE TABLE IF NOT EXISTS users
(
    id         uuid PRIMARY KEY     DEFAULT gen_random_uuid(),
    email      text        NOT NULL UNIQUE,
    google_id  text UNIQUE,
    plan       text        NOT NULL DEFAULT 'free',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_usage
(
    id                 bigserial PRIMARY KEY,
    user_id            uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    model_id           text        NOT NULL,
    provider           text        NOT NULL,
    provider_model     text        NOT NULL,
    input_tokens       integer     NOT NULL DEFAULT 0,
    output_tokens      integer     NOT NULL DEFAULT 0,
    cache_read_tokens  integer     NOT NULL DEFAULT 0,
    cache_write_tokens integer     NOT NULL DEFAULT 0,
    cost_micros        bigint      NOT NULL DEFAULT 0,
    status             text        NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_usage_user_created_idx ON model_usage (user_id, created_at);
