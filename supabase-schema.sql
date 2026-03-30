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
  tools JSONB DEFAULT '[]',
  price_xlm NUMERIC(10,4) DEFAULT 0.01,
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'forked')),
  forked_from UUID,
  api_endpoint TEXT,
  api_key TEXT,
  soroban_contract_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AGENT REQUESTS
CREATE TABLE IF NOT EXISTS public.agent_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  caller_wallet TEXT,
  caller_ip TEXT,
  input_payload JSONB,
  output_payload JSONB,
  payment_tx_hash TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- INVOICES
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID UNIQUE,
  agent_id UUID NOT NULL,
  owner_wallet TEXT NOT NULL,
  caller_wallet TEXT,
  amount_xlm NUMERIC(12,4) NOT NULL,
  payment_tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

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

-- check table exists
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('users','agents','agent_requests','invoices','agent_forks','api_keys');

insert into public.agents (owner_wallet, name)
values ('TEST_WALLET', 'Agent One')
returning id, owner_wallet, name;

select * from public.agents limit 5;

(SELECT wallet_address FROM public.users WHERE id = auth.uid())
