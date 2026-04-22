# AgentForge CLI

The AgentForge CLI provides full terminal access to all platform features.

## Installation

```bash
pnpm cli
# or build and install globally:
pnpm build && npm install -g .
```

## Commands

### `agentforge init [projectName]`
Creates a new AgentForge project scaffold:
```bash
agentforge init my-trading-agent
```
Creates:
- `my-trading-agent/agents/templates/` — agent templates
- `my-trading-agent/tasks/` — task queue
- `my-trading-agent/workflows/` — workflow definitions  
- `my-trading-agent/config/agents.json` — agent config
- `my-trading-agent/.env` — environment template

### `agentforge dash`
Opens the live terminal polymarket dashboard with:
- Real-time crypto market prices (XLM, BTC, ETH, SOL, AF$)
- Active agent list with earnings
- Recent activity feed (via Ably)
- Simulated PnL tracking

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

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AGENTFORGE_API_URL` | AgentForge server URL (default: http://localhost:3000) |
| `STELLAR_AGENT_SECRET` | Stellar secret key for payments |
| `QSTASH_TOKEN` | Upstash QStash token |
| `ABLY_API_KEY` | Ably server API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
