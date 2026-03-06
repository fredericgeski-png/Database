-- Kinetic DB Schema
-- Run: psql $POSTGRES_URL -f init.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            VARCHAR(255) UNIQUE NOT NULL,
  password_hash    VARCHAR(255) NOT NULL,
  subscription_tier VARCHAR(50) DEFAULT 'free',
  subscription_status VARCHAR(50) DEFAULT 'active',
  sellar_customer_id VARCHAR(255),
  sellar_subscription_id VARCHAR(255),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  upgraded_at      TIMESTAMPTZ,
  last_login_at    TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  framework        VARCHAR(50),
  status           VARCHAR(50) DEFAULT 'active',
  entropy_score    DECIMAL(5,4),
  tokens_consumed  BIGINT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agents_user_id  ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_status   ON agents(status);

CREATE TABLE IF NOT EXISTS agent_entropy (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id         UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  entropy_score    DECIMAL(5,4) NOT NULL,
  shannon_entropy  DECIMAL(5,4),
  loop_penalty     DECIMAL(5,4),
  tool_variance    DECIMAL(5,4),
  drift_score      DECIMAL(5,4),
  metrics_snapshot JSONB,
  calculated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_entropy_agent   ON agent_entropy(agent_id);
CREATE INDEX IF NOT EXISTS idx_entropy_time    ON agent_entropy(calculated_at DESC);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id         UUID REFERENCES agents(id) ON DELETE SET NULL,
  event_type       VARCHAR(100) NOT NULL,
  event_data       JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_telemetry_user  ON telemetry_events(user_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_time  ON telemetry_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_type  ON telemetry_events(event_type);

CREATE TABLE IF NOT EXISTS user_webhooks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url              TEXT NOT NULL,
  events           TEXT[] DEFAULT '{"*"}',
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_changes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_tier         VARCHAR(50),
  new_tier         VARCHAR(50),
  changed_by       VARCHAR(50),
  reason           TEXT,
  changed_at       TIMESTAMPTZ DEFAULT NOW()
);
