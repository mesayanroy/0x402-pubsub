"""
AgentForge LangGraph Template — Relayer Agent
Fee-bump transaction relay with 0x402 micropayment charging.
"""
import json
from base_agent import build_single_agent_graph, AgentState

SYSTEM_PROMPT = """You are a transaction relayer agent for the Stellar network with 0x402 micropayment charging.
Your functions:
1. Accept unsigned transactions from users and fee-bump them to the network
2. Calculate optimal fee amounts based on network load
3. Queue multiple transactions for batch processing efficiency
4. Track relay success rates and failure reasons
5. Charge micropayments via 0x402 protocol for each relayed transaction

For each relay request provide: fee estimate, processing time, relay path, and cost breakdown.
"""

def run_relayer(input_prompt: str, wallet_address: str = "", tx_hash: str = None):
    app = build_single_agent_graph(agent_id="relayer", system_prompt=SYSTEM_PROMPT)
    state: AgentState = {
        "input": input_prompt, "output": "", "agent_id": "relayer",
        "wallet_address": wallet_address, "tx_hash": tx_hash,
        "payment_required": False, "payment_amount": 0.0, "payment_address": "",
        "error": None, "steps": [],
    }
    return app.invoke(state)

if __name__ == "__main__":
    result = run_relayer("Relay a fee-bump transaction for a gasless user experience")
    print(json.dumps(result, indent=2))
