"""
AgentForge LangGraph Template — Arbitrage Tracker Agent
Triangular & cross-path arbitrage across Stellar DEX.
"""
import json
from base_agent import build_single_agent_graph, AgentState

SYSTEM_PROMPT = """You are an arbitrage tracking agent for the Stellar DEX.
Your tasks:
1. Monitor triangular arbitrage opportunities across XLM, USDC, BTC, ETH pairs
2. Calculate profit margins after transaction fees and slippage
3. Identify optimal arbitrage paths with lowest risk
4. Track historical arbitrage performance and success rates
5. Alert on opportunities above 0.5% profit threshold

Provide structured analysis with: pair paths, expected profit %, execution risk, and recommended action.
"""

def run_arbitrage_tracker(input_prompt: str, wallet_address: str = "", tx_hash: str = None):
    app = build_single_agent_graph(agent_id="arb_tracker", system_prompt=SYSTEM_PROMPT)
    state: AgentState = {
        "input": input_prompt, "output": "", "agent_id": "arb_tracker",
        "wallet_address": wallet_address, "tx_hash": tx_hash,
        "payment_required": False, "payment_amount": 0.0, "payment_address": "",
        "error": None, "steps": [],
    }
    return app.invoke(state)

if __name__ == "__main__":
    result = run_arbitrage_tracker("Find arbitrage opportunities for XLM/USDC/BTC triangle")
    print(json.dumps(result, indent=2))
