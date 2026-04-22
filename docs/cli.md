# AgentForge CLI — Complete Guide

> **Build, deploy, and operate AI agents from your terminal with real-time crypto market data, Stellar 0x402 payments, and Ably live notifications.**

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start — 5 minutes to your first agent](#quick-start)
3. [agentforge init — Interactive Project Setup](#agentforge-init)
4. [agentforge dash — Live Polymarket Dashboard](#agentforge-dash)
5. [agentforge agents — List & Run Agents](#agentforge-agents)
6. [agentforge deploy — Deploy to Platform](#agentforge-deploy)
7. [agentforge faucet — Claim Testnet Tokens](#agentforge-faucet)
8. [agentforge a2a — Agent-to-Agent Routing](#agentforge-a2a)
9. [agentforge tx — Transaction Inspector](#agentforge-tx)
10. [0x402 Payment Protocol](#0x402-payment-protocol)
11. [Ably Real-Time Notifications](#ably-real-time-notifications)
12. [Environment Variables Reference](#environment-variables-reference)
13. [Troubleshooting](#troubleshooting)

---

## Installation

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 18 | Required — uses `readline/promises` |
| pnpm | ≥ 8 | `npm install -g pnpm` |
| Stellar Freighter | Latest | Browser wallet for web confirmations |

### Install from Source

```bash
# 1. Clone the repo
git clone https://github.com/mesayanroy/AgentForge
cd AgentForge

# 2. Install dependencies
pnpm install

# 3. Run the CLI directly (development)
pnpm cli -- --help

# 4. Or install globally (builds ts → js first)
npx tsc --outDir dist --module commonjs cli/index.ts
npm install -g .
agentforge --help
```

### Verify the installation

```bash
agentforge --version
# AgentForge CLI v0.2.0
```

---

## Quick Start

```bash
# ── Step 1 — scaffold a project ──────────────────────────────────────────────
agentforge init my-trading-agent
# Follow the interactive prompts (template, model, prompt, price, keys)

# ── Step 2 — enter the project directory ─────────────────────────────────────
cd my-trading-agent

# ── Step 3 — fill in your environment variables ──────────────────────────────
# Edit .env and add: STELLAR_AGENT_SECRET, OPENAI_API_KEY, ABLY_API_KEY

# ── Step 4 — claim testnet tokens so your wallet has XLM ─────────────────────
agentforge faucet --wallet G<YOUR_FREIGHTER_ADDRESS>

# ── Step 5 — open the live dashboard ────────────────────────────────────────
agentforge dash

# ── Step 6 — run your agent ──────────────────────────────────────────────────
agentforge agents run my_trading_agent \
  --input "Find the best XLM/USDC opportunity right now" \
  --secret $STELLAR_AGENT_SECRET

# ── Step 7 — deploy to the platform ─────────────────────────────────────────
agentforge deploy my_trading_agent
```

---

## agentforge init

**Interactive project scaffolding with guided prompts.**

```bash
agentforge init [projectName]
```

If `projectName` is omitted you will be prompted.

### What `init` does

1. Prints the ASCII banner and `CLI init` header.
2. Asks you a series of questions:
   - Project name
   - Starter template (see list below)
   - Agent name
   - AI model
   - Agent goal (one-line description / system prompt)
   - Price per run in XLM
   - AgentForge API URL
   - Stellar secret key (optional — can be added later)
3. Creates the following directory structure:

```
my-trading-agent/
├── .env                         ← Environment variables
├── README.md                    ← Project README
├── agents/
│   └── templates/
│       └── trading-bot.json     ← Your agent template
├── config/
│   └── agents.json              ← Agent registry
├── docs/                        ← Your project docs
├── env/                         ← Per-agent env overrides
├── tasks/
│   └── queue.json               ← Task queue
├── workflows/
│   └── default.json             ← Workflow definition
└── .agentforge/                 ← CLI metadata
```

### Available Starter Templates

| Template | Description |
|----------|-------------|
| `defi-analyst` | DeFi protocol analysis — yield rates, TVL, liquidity |
| `trading-bot` | Automated buy/sell/hold signals with confidence scores |
| `mev-bot` | MEV opportunity detection on Stellar DEX pending orders |
| `arbitrage-tracker` | Cross-DEX spread monitoring and alerting |
| `prediction-market` | Polymarket-style event probability estimation |
| `custom` | Blank canvas — write your own system prompt |

### Example session

```
╔══════════════════════════════════╗
║   AgentForge  •  CLI  init       ║
╚══════════════════════════════════╝

? Project name (default: my-agent): my-trading-agent
? Choose a starter template:
  1) defi-analyst      — DeFi protocol analysis & yield tracking
  2) trading-bot       — Automated trading signals & execution
  ...
  Enter number: 2
? Agent name (default: trading-bot-agent): Alpha Trader
? AI model for the agent:
  1) openai-gpt4o-mini   (fast, cost-efficient)
  2) openai-gpt4o        (best reasoning)
  ...
  Enter number: 1
? Describe your agent's goal in one sentence: Trade XLM pairs for maximum yield
? Price per run in XLM (default: 0.05): 0.1
? AgentForge API URL (default: http://localhost:3000): https://agentforge.dev
? Stellar secret key (S...) — leave blank to fill later:

✔ Project structure created!
```

---

## agentforge dash

**Live terminal polymarket dashboard.**

```bash
agentforge dash [--interval <ms>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `--interval` | `3000` | Refresh interval in milliseconds |

### Dashboard sections

| Section | Colour | Description |
|---------|--------|-------------|
| **CRYPTO POLYMARKET** | 🔵 cyan / white | XLM, BTC, ETH, SOL, AF$ prices with 24h change |
| **STAKING & YIELD RATES** | 🟡 yellow | Active staking pools, APY, TVL |
| **ACTIVE AGENTS** | 🟡 yellow | Your deployed agents, request counts, earned XLM |
| **REAL-TIME ACTIVITY** | 🟢 green | Live Ably events — payments, runs, faucet, predictions |

### Colour legend

| Colour | Meaning |
|--------|---------|
| 🟢 Green | Bullish / positive PnL / active agent |
| 🔴 Red | Bearish / negative PnL / inactive |
| 🟡 Yellow | Staking / earnings / warning |
| 🔵 Blue | Prediction / informational |
| ⚪ White | Neutral price / faucet event |
| 🔘 Gray | Metadata / timestamps / muted |
| 🟦 Cyan | Token pair / wallet identity |

```bash
# Refresh every 5 seconds
agentforge dash --interval 5000

# Default (3s)
agentforge dash
```

Press **Ctrl+C** to exit.

---

## agentforge agents

### List agents

```bash
agentforge agents list
```

Shows all agents registered on the platform (or from `.agent-store.json` if offline).

Output columns: status dot (green/red), name, ID, price, model, requests, earned XLM.

### Run an agent

```bash
agentforge agents run <agentId> \
  --input "your prompt" \
  [--secret <STELLAR_SECRET>] \
  [--signed-xdr <xdr>]
```

| Option | Description |
|--------|-------------|
| `-i, --input` | **(required)** Input prompt to send to the agent |
| `-s, --secret` | Stellar secret key for signing payments (or use env var) |
| `--signed-xdr` | Pre-signed transaction XDR (e.g. from Freighter browser extension) |
| `--api` | Override API base URL |

**Flow:**

1. CLI sends the prompt to `POST /api/agents/<id>/run`.
2. If the agent costs XLM the API returns HTTP 402 with `payment_details`.
3. CLI builds, signs, and submits a Stellar payment from your secret key.
4. Publishes a `payment_confirmed` event to the Ably `agentforge-cli` channel.
5. Retries the agent call with `X-Payment-Tx-Hash` and `X-Payment-Wallet` headers.
6. Prints the agent's output.

**Examples:**

```bash
# Free agent
agentforge agents run defi_analyst --input "What is the XLM APY today?"

# Paid agent (uses env var)
export STELLAR_AGENT_SECRET=S...
agentforge agents run mev_bot \
  --input "Find MEV opportunities for XLM/USDC" \
  --secret $STELLAR_AGENT_SECRET

# Paid agent with Freighter-signed XDR
agentforge agents run trading_bot \
  --input "Execute best arbitrage" \
  --signed-xdr "AAAAAgAAAA..."
```

---

## agentforge deploy

**Register and deploy an agent to the AgentForge platform.**

```bash
agentforge deploy <agentId> \
  [--secret <STELLAR_SECRET>] \
  [--env-file <path>]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-s, --secret` | `$STELLAR_AGENT_SECRET` | Stellar secret (used as owner proof) |
| `--env-file` | `.env` | Path to `.env` file where the API key is written |

**What deploy does:**

1. Reads `config/agents.json` and `agents/templates/<template>.json` from the current directory.
2. POSTs the agent config to `POST /api/agents/register`.
3. Writes the returned API key to your `.env` file as `AGENTFORGE_API_KEY_<ID>=...`.
4. Publishes an `agent_deployed` event to Ably so the website reflects the new agent in real time.
5. Prints the dashboard URL and the run command.

**If the API is unreachable** (offline/dev mode), the agent is saved to `.agent-store.json` and will appear in `agents list` and `dash`.

```bash
# From inside your project directory
cd my-trading-agent
agentforge deploy alpha_trader --secret $STELLAR_AGENT_SECRET

# Output:
# ✔ Agent alpha_trader deployed!
#   API key written to .env:
#     AGENTFORGE_API_KEY_ALPHA_TRADER=ag_sk_...
#   Dashboard: https://agentforge.dev/agents/alpha_trader
#   Run it: agentforge agents run alpha_trader --input "test"
```

---

## agentforge faucet

**Claim AF$ testnet tokens directly from the terminal.**

```bash
agentforge faucet --wallet <G_ADDRESS> [--api <url>]
```

| Option | Description |
|--------|-------------|
| `-w, --wallet` | **(required)** Your Stellar G-address (copy from Freighter) |
| `--api` | Override the AgentForge API URL |

**Limits:** 3 claims per wallet · 5 XLM per claim

```bash
# Get your address from Freighter, then:
agentforge faucet --wallet GABCDE...

# Output:
# ✔ Claims remaining: 3 / 3
# ✔ ✅  5 XLM sent to your Freighter wallet!
#   Tx Hash : 8f3a9b...
#   Explorer: https://stellar.expert/explorer/testnet/tx/8f3a9b...
```

After claiming, open **Freighter** → check your XLM balance.

> **Note:** If you get "Faucet wallet has insufficient XLM", the server-side faucet wallet needs funding.  
> Visit: `https://friendbot.stellar.org?addr=<FAUCET_WALLET_ADDRESS>`

---

## agentforge a2a

**Multi-agent composition via the 0x402 protocol.**

```bash
agentforge a2a call <fromAgentId> <toAgentId> \
  --input "combined task" \
  --secret $STELLAR_AGENT_SECRET
```

Routes a request from one agent to another. When `QSTASH_TOKEN` is set the request is queued asynchronously via Upstash QStash; otherwise the target agent is called directly.

```bash
# Analyze → Execute pipeline
agentforge a2a call arbitrage_tracker trading_bot \
  --input "Find XLM triangular arbitrage then execute the best path" \
  --secret $STELLAR_AGENT_SECRET

# With custom correlation ID for tracking
agentforge a2a call mev_bot trading_bot \
  --input "MEV sweep + execute" \
  --secret $STELLAR_AGENT_SECRET \
  --correlation my-run-001
```

---

## agentforge tx

**Inspect Stellar transactions.**

```bash
# Quick status
agentforge tx status <txHash>

# Full JSON details
agentforge tx inspect <txHash>
```

Both commands query Stellar Horizon and print a direct link to the Stellar Expert explorer.

---

## 0x402 Payment Protocol

Every time you run a paid agent, this flow happens automatically:

```
CLI  ──[POST /api/agents/:id/run]──►  Server
         ◄──[402 + payment_details]──
         
CLI builds Stellar XLM payment tx
CLI signs with STELLAR_AGENT_SECRET (or Freighter XDR)
CLI  ──[submitTransaction]──►  Stellar Horizon
         ◄──[txHash]──

CLI  ──[POST /api/agents/:id/run + X-Payment-Tx-Hash]──►  Server
         ◄──[200 + output]──

CLI publishes payment_confirmed to Ably
Website receives notification → updates wallet balance
```

All payments are on **Stellar testnet** — no real money.

---

## Ably Real-Time Notifications

The CLI publishes events to the Ably channel `agentforge-cli` on:

| Event | Trigger |
|-------|---------|
| `payment_confirmed` | After a Stellar payment is submitted |
| `agent_deployed` | After `agentforge deploy` succeeds |
| `agent_run` | After an agent run completes |
| `faucet_claim` | After `agentforge faucet` succeeds |
| `a2a_queued` | After an A2A request is queued |

The **website** subscribes to the same channel to show real-time wallet confirmations.

The CLI also subscribes and prints incoming notifications while `agents run` is active.

To enable: set `ABLY_API_KEY` in your `.env`.

---

## Environment Variables Reference

Copy these into your project's `.env` (created by `agentforge init`):

```bash
# ── Core ─────────────────────────────────────────────────────────────────
AGENTFORGE_API_URL=https://agentforge.dev   # or http://localhost:3000

# ── Stellar ──────────────────────────────────────────────────────────────
# MUST start with "S" — get one from https://laboratory.stellar.org
STELLAR_AGENT_SECRET=S...
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK=testnet

# ── AI Providers ─────────────────────────────────────────────────────────
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...

# ── Real-time (Ably) ─────────────────────────────────────────────────────
ABLY_API_KEY=...         # server-side / CLI key
NEXT_PUBLIC_ABLY_KEY=... # client-side key (restricted)

# ── Queue (Upstash QStash) ────────────────────────────────────────────────
QSTASH_TOKEN=...

# ── Database (Supabase) ───────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Getting a Stellar secret key

1. Open [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test)
2. Click **Generate Keypair** → copy the **Secret Key** (starts with `S`)
3. Fund the account via [Friendbot](https://friendbot.stellar.org) — paste the public key
4. Set `STELLAR_AGENT_SECRET=S...` in your `.env`

> ⚠️ **Never commit your secret key to git.** `.env` is already in `.gitignore`.

---

## Troubleshooting

### `Error: invalid encoded string`

Your `STELLAR_AGENT_SECRET` is not a valid Stellar secret key.

**Fix:**
- Secret keys must start with `S` (56 characters)
- Keys starting with `C` are Soroban contract IDs — wrong value
- Keys starting with `G` are public keys — also wrong
- Generate a new keypair at [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test)

### `Faucet wallet has insufficient XLM`

The server-side faucet wallet has run out of testnet XLM.

**Fix:** Fund it via Friendbot:
```bash
curl "https://friendbot.stellar.org?addr=GDLYT6GN4DG3RK25DHBMOVTBQYFF7P5YPB2ORU4H7MCWMYAB6HPBFHMO"
```

### `API error 404` on `agents list`

The server isn't running or the API URL is wrong.

**Fix:**
```bash
# Start the dev server
pnpm dev

# Or point CLI to prod
agentforge --api https://agentforge.dev agents list
```

### Dashboard shows no agents

No agents are registered yet.

**Fix:**
```bash
agentforge init my-agent
cd my-agent
agentforge deploy <agentId>
```

### Ably notifications not appearing

`ABLY_API_KEY` is not set or the key doesn't have `subscribe` capabilities.

**Fix:** Set `ABLY_API_KEY=<server key>` in your `.env`. Get keys from [Ably Dashboard](https://ably.com/dashboard).

---

*Built with ❤️ on Stellar testnet · AgentForge v0.2.0*

