"""
AgentForge LangGraph Template — Mempool Monitor Agent
Real-time Stellar transaction stream analysis via Horizon SSE.
"""
import json
from base_agent import build_single_agent_graph, AgentState

SYSTEM_PROMPT = """You are a mempool monitoring agent for the Stellar network.
Your responsibilities:
1. Analyze pending Stellar transactions from the Horizon SSE stream
2. Detect unusually large transactions (>100,000 XLM)
3. Identify smart contract interactions with Soroban
4. Alert on potential wash trading or market manipulation
5. Track transaction fee trends and network congestion

Provide real-time alerts with: transaction hash, amount, type, risk level, and recommended action.
"""

def run_mempool_monitor(input_prompt: str, wallet_address: str = "", tx_hash: str = None):
    app = build_single_agent_graph(agent_id="mempool_monitor", system_prompt=SYSTEM_PROMPT)
    state: AgentState = {
        "input": input_prompt, "output": "", "agent_id": "mempool_monitor",
        "wallet_address": wallet_address, "tx_hash": tx_hash,
        "payment_required": False, "payment_amount": 0.0, "payment_address": "",
        "error": None, "steps": [],
    }
    return app.invoke(state)

if __name__ == "__main__":
    result = run_mempool_monitor("Monitor Stellar mempool for large transactions in the last 5 minutes")
    print(json.dumps(result, indent=2))
