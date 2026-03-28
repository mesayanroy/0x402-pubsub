-- ================================================
-- AgentForge Database Schema (Supabase / PostgreSQL)
-- ================================================

-- Users / Wallet Owners
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,  -- Stellar public key (G...)
  username TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agents
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet TEXT NOT NULL REFERENCES users(wallet_address),
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT[],
  model TEXT NOT NULL CHECK (model IN ('openai-gpt4o-mini', 'anthropic-claude-haiku')),
  system_prompt TEXT NOT NULL,
  tools JSONB DEFAULT '[]',
  price_xlm NUMERIC(10,4) DEFAULT 0.01,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'forked')),
  forked_from UUID REFERENCES agents(id),
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
CREATE TABLE agent_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
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
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID UNIQUE REFERENCES agent_requests(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  owner_wallet TEXT NOT NULL,
  caller_wallet TEXT,
  amount_xlm NUMERIC(12,4) NOT NULL,
  tx_hash TEXT UNIQUE NOT NULL,
  tx_explorer_url TEXT NOT NULL,
  status TEXT DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Forks
CREATE TABLE agent_forks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_agent_id UUID REFERENCES agents(id),
  forked_agent_id UUID REFERENCES agents(id),
  forked_by_wallet TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  owner_wallet TEXT,
  key_hash TEXT UNIQUE NOT NULL,
  label TEXT,
  last_used TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_agents_owner ON agents(owner_wallet);
CREATE INDEX idx_agents_visibility ON agents(visibility) WHERE is_active = true;
CREATE INDEX idx_agent_requests_agent ON agent_requests(agent_id);
CREATE INDEX idx_agent_requests_created ON agent_requests(created_at DESC);
CREATE INDEX idx_agent_requests_tx_hash ON agent_requests(payment_tx_hash);
CREATE INDEX idx_invoices_owner_created ON invoices(owner_wallet, created_at DESC);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash) WHERE is_active = true;

-- Row Level Security (optional — enable for user-scoped access)
-- ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE agent_requests ENABLE ROW LEVEL SECURITY;
