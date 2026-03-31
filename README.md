# AgentForge — 0x402 / Pub/Sub AI Agent Marketplace

[![CI / CD](https://github.com/mesayanroy/0x402-pubsub/actions/workflows/ci.yml/badge.svg)](https://github.com/mesayanroy/0x402-pubsub/actions/workflows/ci.yml)

**AgentForge (Xylem)** is a Web3-native AI agent marketplace and builder platform on the Stellar blockchain.

## Overview

Users connect their Freighter wallet, build custom AI agents, monetize them on-chain, and every agent API request is metered and paid using the 0x402 AI-to-AI payment protocol. A live trading dashboard lets users test their XLM on the Stellar DEX directly from the UI — no CLI required.

<img width="375" height="586" alt="image" src="https://github.com/user-attachments/assets/21b0155a-ecfe-4ec3-a319-8a0f32eee2b6" />

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, TailwindCSS, Framer Motion
- **Wallet**: Multi-wallet support via `WalletConnect` modal — Freighter, LOBSTR, xBull, Albedo
- **Blockchain**: Stellar network — two Soroban smart contracts (AgentRegistry + AgentValidator) with inter-contract calls
- **Database**: Supabase (PostgreSQL)
- **AI Backends**: OpenAI GPT-4o-mini + Anthropic Claude Haiku
- **Payments**: 0x402 protocol for per-request payments in XLM
- **Realtime**: Ably pub/sub (optional) + Upstash QStash consumers
- **Containerisation**: Docker + Docker Compose

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Key variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `ABLY_API_KEY` | Ably realtime key *(optional — gracefully disabled if absent)* |
| `QSTASH_TOKEN` | Upstash QStash token *(optional)* |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` (default) or `mainnet` |
| `NEXT_PUBLIC_HORIZON_URL` | Stellar Horizon endpoint |

### 3. Set up Supabase

Run `supabase-schema.sql` in your Supabase SQL editor.

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with hero, stats, features |
| `/agents` | Browse all deployed agents (marketplace grid) |
| `/agents/[id]` | Agent detail with API docs, try it live, fork |
| `/build` | 3-step agent builder wizard (draft auto-saved to localStorage) |
| `/trading` | **Live trading page** — XLM/USDC chart, Breakout Lines, TP/SL, TVL, buy/sell, collateral, leverage, agent SDK templates |
| `/dashboard` | User dashboard: my agents, earnings in XLM, invoice stream |
| `/marketplace` | Featured + trending agents with owner profile links |
| `/docs` | Developer documentation + 0x402 guide |
| `/devs` | Developer hub: SDK snippets, webhooks |
| `/about` | About the project and architecture |

## 0x402 Payment Flow

1. Client calls `POST /api/agents/{id}/run`
2. Server returns HTTP 402 with payment headers:
   - `X-Payment-Required: xlm`
   - `X-Payment-Amount: {price_xlm}`
   - `X-Payment-Address: {agent_owner_address}`
   - `X-Payment-Network: stellar`
   - `X-Payment-Memo: agent:{id}:req:{nonce}`
3. Client signs XLM payment transaction via Freighter
4. Client retries with `X-Payment-Tx-Hash` header
5. Server verifies via Stellar Horizon API and runs agent

## Smart Contracts

Two Soroban contracts live in `contracts/`. Deploy both with:

```bash
chmod +x contracts/deploy.sh
./contracts/deploy.sh
```

### AgentRegistry (`contracts/agent_registry/`)

Core on-chain registry. Stores agent metadata, counts requests, and emits events for every paid call.

| Method | Description |
|---|---|
| `register_agent(owner, agent_id, price_xlm, metadata_hash)` | Register a new agent |
| `pay_for_request(caller, agent_id, amount)` | Record a paid 0x402 request |
| `fork_agent(caller, original_id, new_id)` | Fork an existing agent |
| `get_agent(agent_id)` | Read agent data |
| `update_price(owner, agent_id, new_price)` | Update per-request price |

### AgentValidator (`contracts/agent_validator/`)

Deployment gatekeeper that makes **inter-contract calls** to AgentRegistry.

| Method | Description |
|---|---|
| `initialize(admin, registry)` | Link validator to AgentRegistry |
| `validate_wallet(deployer, agent_id)` | **Inter-contract READ** — checks registry for duplicate agent_id |
| `request_deploy(deployer, agent_id, metadata_hash, price_stroops)` | Store pending deployment intent on-chain |
| `confirm_deploy(deployer, agent_id, signature_hash)` | **Inter-contract WRITE** — calls `AgentRegistry::register_agent` |
| `is_confirmed(agent_id)` | Check if agent passed on-chain validation |
| `get_pending(agent_id)` | Read pending deployment record |

### Inter-Contract Call Architecture

```
Browser / CLI
    │
    ▼
POST /api/agents/validate-deploy          ← builds Soroban XDR tx
    │ returns unsigned tx XDR
    ▼
Freighter Wallet (user signs)
    │ returns signed XDR
    ▼
POST /api/agents/confirm-deploy           ← submits to Horizon, builds confirm tx
    │ returns confirm XDR
    ▼
Freighter Wallet (user signs confirm tx)
    │ signed confirm XDR
    ▼
Stellar Horizon ── submits tx ──▶ AgentValidator::confirm_deploy
                                         │
                                         │ env.invoke_contract()  ← INTER-CONTRACT CALL
                                         ▼
                                   AgentRegistry::register_agent
                                         │
                                         ▼
                              Agent registered on-chain ✅
```

**Proof of inter-contract call** — the Soroban `env.invoke_contract` / `env.try_invoke_contract` calls in `contracts/agent_validator/src/lib.rs` (the `registry_client` module) are the on-chain cross-contract dispatch. The `confirm_deploy` entry point cannot succeed without successfully calling `AgentRegistry::register_agent`.

> **Contract IDs (Testnet)**
> | Contract | ID |
> |---|---|
> | AgentRegistry | `CDTLE6RKAXDXMKDTBLNXYQFIDQKXFM4ARYBX6DG6XDHJPXRESIJEL3MU` |
> | AgentValidator | *(set after deploy — see `NEXT_PUBLIC_SOROBAN_VALIDATOR_ID`)* |

## Demo Agent IDs

| Agent | ID |
|---|---|
| DeFi Analyst | `1` |
| Code Review Bot | `2` |
| Smart Contract Auditor | `3` |
| XLM Trading Bot | `4` |
| Soroban Dev Assistant | `5` |

> These IDs are available in demo mode (no Supabase required). When Supabase is configured, agents receive a UUID.

## API Routes

- `POST /api/agents/create` — Deploy a new agent
- `GET /api/agents/list` — List public agents
- `GET /api/agents/[id]` — Get agent by ID
- `POST /api/agents/[id]/run` — Run agent (0x402)
- `POST /api/agents/validate-deploy` — Build Soroban validation transaction XDR
- `POST /api/agents/confirm-deploy` — Submit + build confirm_deploy transaction XDR
- `POST /api/payment/verify` — Verify Stellar tx
- `GET /api/dashboard/analytics` — Dashboard PnL + 0x402 request metrics
- `GET /api/ably/token` — Ably auth token (returns 503 gracefully when not configured)

## Docker

Build and run with Docker Compose:

```bash
# Copy and fill in secrets
cp .env.example .env

# Build image and start services
docker compose up --build -d

# View logs
docker compose logs -f web
```

The `web` service listens on port **3000**. An optional `consumers` service runs the QStash background workers.

## CI / CD

The repository ships a GitHub Actions workflow at `.github/workflows/ci.yml`.

| Job | Trigger | What it does |
|---|---|---|
| `lint-and-type-check` | every push / PR | `next lint` + TypeScript checks |
| `build` | after lint passes | `next build`, uploads `.next/` artefact |
| `docker-build` | pushes to `main` | Builds Docker image (cached) |

To enable Vercel auto-deploy, uncomment the `deploy-preview` job and add `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` to repository secrets.
