"""
AgentForge LangGraph Template — MEV Bot Agent
Front-running & sandwich detection on Stellar DEX with A2A support.
"""
import json
from base_agent import build_single_agent_graph, build_a2a_graph, AgentState

SYSTEM_PROMPT = """You are an advanced MEV (Maximal Extractable Value) bot operating on the Stellar DEX.
Your tasks:
1. Detect front-running opportunities in the Stellar DEX order book
2. Identify sandwich attack vectors on large pending transactions
3. Calculate optimal trade sizes and slippage tolerances
4. Execute atomic arbitrage within a single ledger when profitable
5. Report all detected opportunities with risk/reward ratios

Always provide quantitative analysis with entry/exit prices, expected profit in XLM, and confidence levels.
"""

def run_mev_bot(input_prompt: str, wallet_address: str = "", tx_hash: str = None):
    app = build_single_agent_graph(
        agent_id="mev_bot",
        system_prompt=SYSTEM_PROMPT,
    )
    state: AgentState = {
        "input": input_prompt,
        "output": "",
        "agent_id": "mev_bot",
        "wallet_address": wallet_address,
        "tx_hash": tx_hash,
        "payment_required": False,
        "payment_amount": 0.0,
        "payment_address": "",
        "error": None,
        "steps": [],
    }
    return app.invoke(state)


if __name__ == "__main__":
    result = run_mev_bot("Scan Stellar DEX for MEV opportunities in the last 100 transactions")
    print(json.dumps(result, indent=2))
