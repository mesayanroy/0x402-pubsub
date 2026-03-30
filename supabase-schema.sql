-- ================================================
-- AgentForge Database Schema (Supabase / PostgreSQL)
-- Run this in the Supabase SQL editor to initialise the database.
-- All statements are idempotent (IF NOT EXISTS) so the script can be
-- re-run safely at any time.
-- ================================================

-- Users / Wallet Owners
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  username TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agents
-- NOTE: owner_wallet is stored as plain TEXT (no FK to users) to avoid
-- insertion-ordering failures on serverless deployments.
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT[],
  model TEXT NOT NULL CHECK (model IN ('openai-gpt4o-mini', 'anthropic-claude-haiku')),
  system_prompt TEXT NOT NULL,
  tools JSONB DEFAULT '[]',
  price_xlm NUMERIC(10,4) DEFAULT 0.01,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'forked')),
  forked_from UUID,
  api_endpoint TEXT,
  api_key TEXT,
  soroban_contract_id TEXT,
  on_chain_node_id TEXT,
  total_requests INT DEFAULT 0,
  total_earned_xlm NUMERIC(12,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent Requests (per-request log for 0x402)
CREATE TABLE IF NOT EXISTS agent_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  caller_wallet TEXT,
  caller_ip TEXT,
  input_payload JSONB,
  output_response JSONB,
  payment_tx_hash TEXT,
  tx_explorer_url TEXT,
  payment_amount_xlm NUMERIC(10,4),
  protocol TEXT DEFAULT '0x402',
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'pending')),
  latency_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Invoice Ledger (one row per paid request)
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID UNIQUE,
  agent_id UUID NOT NULL,
  owner_wallet TEXT NOT NULL,
  caller_wallet TEXT,
  amount_xlm NUMERIC(12,4) NOT NULL,
  tx_hash TEXT UNIQUE NOT NULL,
  tx_explorer_url TEXT NOT NULL,
  status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Forks
CREATE TABLE IF NOT EXISTS agent_forks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_agent_id UUID,
  forked_agent_id UUID,
  forked_by_wallet TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID,
  owner_wallet TEXT,
  key_hash TEXT UNIQUE NOT NULL,
  label TEXT,
  last_used TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_wallet);
CREATE INDEX IF NOT EXISTS idx_agents_visibility ON agents(visibility) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agent_requests_agent ON agent_requests(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_requests_created ON agent_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_requests_tx_hash ON agent_requests(payment_tx_hash);
CREATE INDEX IF NOT EXISTS idx_invoices_owner_created ON invoices(owner_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash) WHERE is_active = true;

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Disable RLS so the server-side service-role key can read/write freely.
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE agent_forks DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;
