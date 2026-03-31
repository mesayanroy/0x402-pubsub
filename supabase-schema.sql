-- ================================================
-- AgentForge Database Schema (Supabase / PostgreSQL)
-- Safe to re-run (idempotent)
-- ================================================

-- USERS
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  username TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AGENTS
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT[],
  model TEXT DEFAULT 'openai-gpt4o-mini',
  system_prompt TEXT DEFAULT '',
  tools JSONB DEFAULT '[]',
  price_xlm NUMERIC(10,4) DEFAULT 0.01,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'forked')),
  forked_from UUID,
  api_endpoint TEXT,
  api_key TEXT,
  soroban_contract_id TEXT,
  total_requests BIGINT DEFAULT 0,
  total_earned_xlm NUMERIC(16,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns to existing agents table (idempotent migrations)
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS model TEXT DEFAULT 'openai-gpt4o-mini';
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT '';
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS total_requests BIGINT DEFAULT 0;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS total_earned_xlm NUMERIC(16,4) DEFAULT 0;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- AGENT REQUESTS
CREATE TABLE IF NOT EXISTS public.agent_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  caller_wallet TEXT,
  caller_ip TEXT,
  input_payload JSONB,
  output_payload JSONB,
  payment_tx_hash TEXT,
  payment_amount_xlm NUMERIC(12,4) DEFAULT 0,
  latency_ms INTEGER,
  tx_explorer_url TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns to existing agent_requests table (idempotent migrations)
ALTER TABLE public.agent_requests ADD COLUMN IF NOT EXISTS payment_amount_xlm NUMERIC(12,4) DEFAULT 0;
ALTER TABLE public.agent_requests ADD COLUMN IF NOT EXISTS latency_ms INTEGER;
ALTER TABLE public.agent_requests ADD COLUMN IF NOT EXISTS tx_explorer_url TEXT;

-- INVOICES
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID UNIQUE,
  agent_id UUID NOT NULL,
  owner_wallet TEXT NOT NULL,
  caller_wallet TEXT,
  amount_xlm NUMERIC(12,4) NOT NULL,
  tx_hash TEXT,
  tx_explorer_url TEXT,
  payment_tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add missing columns to existing invoices table (idempotent migrations)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tx_explorer_url TEXT;

-- AGENT FORKS
CREATE TABLE IF NOT EXISTS public.agent_forks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_agent_id UUID,
  forked_agent_id UUID,
  forked_by_wallet TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API KEYS
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID,
  owner_wallet TEXT,
  key_hash TEXT UNIQUE NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =================================================
-- INDEXES (FIXED + SCHEMA QUALIFIED)
-- =================================================

-- Agents
DROP INDEX IF EXISTS idx_agents_owner;
CREATE INDEX IF NOT EXISTS idx_agents_owner
ON public.agents(owner_wallet);

DROP INDEX IF EXISTS idx_agents_visibility;
CREATE INDEX IF NOT EXISTS idx_agents_visibility
ON public.agents(visibility);

CREATE INDEX IF NOT EXISTS idx_agents_is_active
ON public.agents(is_active);

-- Agent Requests
DROP INDEX IF EXISTS idx_agent_requests_agent;
CREATE INDEX IF NOT EXISTS idx_agent_requests_agent
ON public.agent_requests(agent_id);

DROP INDEX IF EXISTS idx_agent_requests_created;
CREATE INDEX IF NOT EXISTS idx_agent_requests_created
ON public.agent_requests(created_at DESC);

DROP INDEX IF EXISTS idx_agent_requests_tx_hash;
CREATE INDEX IF NOT EXISTS idx_agent_requests_tx_hash
ON public.agent_requests(payment_tx_hash);

-- Invoices
DROP INDEX IF EXISTS idx_invoices_owner_created;
CREATE INDEX IF NOT EXISTS idx_invoices_owner_created
ON public.invoices(owner_wallet, created_at DESC);

-- API Keys
DROP INDEX IF EXISTS idx_api_keys_hash;
CREATE INDEX IF NOT EXISTS idx_api_keys_hash
ON public.api_keys(key_hash);

-- =================================================
-- ROW LEVEL SECURITY (UNCHANGED - DISABLED)
-- =================================================

ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_forks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys DISABLE ROW LEVEL SECURITY;
