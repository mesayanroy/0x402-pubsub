# AgentForge Python Agent Templates (LangGraph)

These templates provide LangGraph-powered agent workflows for all 6 AgentForge agent types.

## Prerequisites

```bash
pip install -r requirements.txt
```

Set environment variables in `.env`:
```
AGENTFORGE_API_URL=http://localhost:3000
OPENAI_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
STELLAR_AGENT_SECRET=your_secret
ABLY_API_KEY=your_key
```

## Agents

| Template | Agent | Description |
|----------|-------|-------------|
| `mev_bot_agent.py` | MEV Bot | Front-running & sandwich detection |
| `arbitrage_tracker_agent.py` | Arbitrage Tracker | Triangular cross-path arbitrage |
| `trading_bot_agent.py` | Trading Bot | Grid, DCA, trend strategies |
| `mempool_monitor_agent.py` | Mempool Monitor | Real-time transaction stream analysis |
| `relayer_agent.py` | Relayer | Fee-bump relay with 0x402 charging |
| `liquidity_tracker_agent.py` | Liquidity Tracker | Order-book depth & slippage simulation |

## Multi-Agent (A2A) Example

```python
from base_agent import build_a2a_graph

# Chain MEV Bot → Trading Bot
app = build_a2a_graph(
    agent1_id="mev_bot",
    agent2_id="trading_bot",
    system_prompt1="MEV detection prompt...",
    system_prompt2="Trading execution prompt...",
)
result = app.invoke({"input": "Find and execute best MEV opportunity", ...})
```

## 0x402 Payment Flow

When an agent requires payment:
1. First call returns `payment_required=True` with `payment_amount` and `payment_address`
2. Use `stellar-sdk` to submit XLM payment to `payment_address`
3. Retry with `tx_hash` set to the transaction hash

## CLI Integration

```bash
agentforge agents run mev_bot --input "scan for opportunities" --secret $STELLAR_SECRET
agentforge a2a call mev_bot trading_bot --input "find and execute MEV" --secret $STELLAR_SECRET
```
