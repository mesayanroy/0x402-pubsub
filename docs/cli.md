# AgentForge CLI

The AgentForge CLI provides full terminal access to all platform features.

## Installation

```bash
pnpm install
pnpm cli -- --help
# or build and install globally:
pnpm build && npm install -g .
```

## Terminal Workflow

### 1. Initialize a project

```bash
agentforge init my-agent
cd my-agent
cp .env.example .env
```

`agentforge init` creates the scaffold for agents, tasks, workflows, dashboard config, and docs.

### 2. Inspect agents

```bash
agentforge agents list
```

### 3. Run an agent with payment handling

```bash
agentforge agents run <agentId> \
  --input "Summarize today's market tape" \
  --secret $STELLAR_AGENT_SECRET
```

If the agent returns a 402 challenge, the CLI signs and submits the Stellar payment, then retries the request automatically.

### 4. Watch the live dashboard

```bash
agentforge dash --interval 3000
```

The dashboard shows a terminal Polymarket-style view with prices, request stats, earnings, and recent activity.

### 5. Route agent-to-agent work

```bash
agentforge a2a call <fromAgentId> <toAgentId> \
  --input "Delegate: analyze the liquidity report" \
  --secret $STELLAR_AGENT_SECRET
```

### 6. Inspect payments

```bash
agentforge tx status <txHash>
agentforge tx inspect <txHash>
```

## Commands

### `agentforge init [projectName]`
Creates a new AgentForge project scaffold with folders and starter files for agents, tasks, workflows, dashboard config, and CLI docs:
```bash
agentforge init my-trading-agent
```
Creates:
- `my-trading-agent/agents/templates/` — starter agent templates
- `my-trading-agent/tasks/queued.json` — queued task list
- `my-trading-agent/tasks/completed.json` — completed task list
- `my-trading-agent/workflows/default.json` — workflow definition
- `my-trading-agent/config/agents.json` — agent registry config
- `my-trading-agent/config/dashboard.json` — terminal dashboard config
- `my-trading-agent/docs/CLI_GUIDE.md` — local CLI usage guide
- `my-trading-agent/.env.example` — environment template
- `my-trading-agent/.agentforge/dashboard.json` — terminal dashboard metadata

### `agentforge dash`
Opens the live terminal polymarket dashboard with:
- Real-time crypto market prices in green, yellow, red, blue, and white
- Active agent list with earnings
- Recent activity feed (via Ably)
- Simulated PnL tracking and request rates

```bash
agentforge dash --interval 5000  # refresh every 5s
```

### `agentforge agents list`
Lists all available agents with status, price, and stats.

### `agentforge agents run <agentId>`
Runs an agent with optional 0x402 Stellar payment.

```bash
agentforge agents run mev_bot --input "Find MEV opportunities" --secret $STELLAR_SECRET
```

If the requested agent is paid, the CLI will:
1. Receive the 402 payment challenge.
2. Build and sign a Stellar payment transaction.
3. Submit to Horizon.
4. Retry the agent call with payment proof headers.

### `agentforge a2a call <fromAgentId> <toAgentId>`
Routes a request between two agents (multi-agent compose).

```bash
agentforge a2a call mev_bot trading_bot --input "Find and execute best opportunity" --secret $STELLAR_SECRET
```

### `agentforge tx status <txHash>`
Checks the status of a Stellar transaction.

### `agentforge tx inspect <txHash>`
Shows full transaction details.

## Multi-Agent (A2A) Workflow

```bash
# Agent 1 analyzes → Agent 2 executes
agentforge a2a call arbitrage_tracker trading_bot \
  --input "Find triangular arbitrage for XLM/USDC/BTC then execute" \
  --secret $STELLAR_SECRET
```

## 0x402 Payment Protocol

When an agent requires payment:
1. CLI detects `payment_details` in the 402 response
2. Builds a Stellar XLM payment transaction
3. Signs and submits to Horizon
4. Retries the agent call with `X-Payment-Tx-Hash` header

If a faucet or payment step reports `invalid encoded string`, the wallet address is not a valid Stellar public key. Use a Freighter address that starts with `G` and retry.

## Python LangGraph Templates

See `agents-sdk/templates/python/README.md` for LangGraph agent templates.

```bash
cd agents-sdk/templates/python
pip install -r requirements.txt
python mev_bot_agent.py
python arbitrage_tracker_agent.py
# etc.
```

## AF$ Token Faucet

Visit `/faucet` in the browser or use the API:
```bash
curl -X POST http://localhost:3000/api/faucet/claim \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "G..."}'
```

After a successful claim, use the Freighter token add prompt in the faucet UI if AF$ does not appear automatically in your wallet.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENTFORGE_API_URL` | AgentForge server URL (default: http://localhost:3000) |
| `STELLAR_AGENT_SECRET` | Stellar secret key for payments |
| `QSTASH_TOKEN` | Upstash QStash token |
| `ABLY_API_KEY` | Ably server API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
