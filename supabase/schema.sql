-- ============================================================
-- Deriv Trading Agent — Supabase Schema
-- Run this in your Supabase project: SQL Editor → New Query
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── trades ──────────────────────────────────────────────────────────────────
-- Every trade the agent opens or attempts to open.
CREATE TABLE IF NOT EXISTS trades (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  pair              VARCHAR(10) NOT NULL,                    -- e.g. "EUR/USD"
  action            VARCHAR(10) NOT NULL,                    -- BUY | SELL
  entry_price       DECIMAL(12, 5),
  exit_price        DECIMAL(12, 5),
  stop_loss         DECIMAL(12, 5),
  take_profit       DECIMAL(12, 5),
  status            VARCHAR(20) DEFAULT 'OPEN' NOT NULL,     -- OPEN | CLOSED | CANCELLED
  pnl               DECIMAL(10, 2),
  deriv_contract_id VARCHAR(50),
  confidence        DECIMAL(4, 3),                          -- 0.000 – 1.000
  reasoning         TEXT,
  agent_run_id      UUID
);

-- ─── positions ───────────────────────────────────────────────────────────────
-- Current state of open positions (updated on each agent run).
CREATE TABLE IF NOT EXISTS positions (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  pair              VARCHAR(10) NOT NULL,
  action            VARCHAR(10) NOT NULL,                    -- BUY | SELL
  entry_price       DECIMAL(12, 5),
  current_price     DECIMAL(12, 5),
  stop_loss         DECIMAL(12, 5),
  take_profit       DECIMAL(12, 5),
  status            VARCHAR(20) DEFAULT 'OPEN' NOT NULL,     -- OPEN | CLOSED
  deriv_contract_id VARCHAR(50),
  unrealized_pnl    DECIMAL(10, 2) DEFAULT 0
);

-- Auto-update updated_at on positions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── agent_memory ─────────────────────────────────────────────────────────────
-- Every decision the agent makes, including HOLD. This is the agent's memory.
-- On each run, the agent reads the last N rows before deciding.
CREATE TABLE IF NOT EXISTS agent_memory (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  run_id          UUID        DEFAULT gen_random_uuid() NOT NULL,
  pair            VARCHAR(10) NOT NULL,
  action          VARCHAR(10) NOT NULL,                      -- BUY | SELL | HOLD
  reasoning       TEXT        NOT NULL,
  confidence      DECIMAL(4, 3) NOT NULL,
  market_context  JSONB,                                     -- last 5 candles + price snapshot
  outcome         VARCHAR(20) DEFAULT 'PENDING'              -- WIN | LOSS | PENDING
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trades_created_at      ON trades (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_status          ON trades (status);
CREATE INDEX IF NOT EXISTS idx_positions_status       ON positions (status);
CREATE INDEX IF NOT EXISTS idx_agent_memory_pair      ON agent_memory (pair, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_created   ON agent_memory (created_at DESC);

-- ─── Row Level Security (optional but recommended) ────────────────────────────
-- Only your service role key (server-side) can write.
-- Anon key can read (for the dashboard).
ALTER TABLE trades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON trades        FOR SELECT USING (true);
CREATE POLICY "Public read access" ON positions     FOR SELECT USING (true);
CREATE POLICY "Public read access" ON agent_memory  FOR SELECT USING (true);

-- Service role bypasses RLS automatically — no insert policy needed.

-- ─── Done ────────────────────────────────────────────────────────────────────
-- After running this, go to your project Settings → API and copy:
--   NEXT_PUBLIC_SUPABASE_URL
--   NEXT_PUBLIC_SUPABASE_ANON_KEY   (for read-only dashboard)
--   SUPABASE_SERVICE_ROLE_KEY       (for server-side writes)
