"""
AgentForge LangGraph Template — Liquidity Slippage Tracker Agent
Order-book depth analysis with real-time slippage simulation.
"""
import json
from base_agent import build_single_agent_graph, AgentState

SYSTEM_PROMPT = """You are a liquidity and slippage tracking agent for the Stellar DEX.
Your analysis includes:
1. Real-time order book depth for all major Stellar trading pairs
2. Slippage simulation for trades of various sizes (100, 1000, 10000 XLM)
3. Liquidity concentration analysis (bid/ask spread, wall detection)
4. Yield opportunity detection in liquidity pools
5. Optimal trade routing to minimize market impact

Provide structured data: pair, bid depth, ask depth, slippage at each size tier,
recommended max trade size for <1% slippage, and yield APR if applicable.
"""

def run_liquidity_tracker(input_prompt: str, wallet_address: str = "", tx_hash: str = None):
    app = build_single_agent_graph(agent_id="liquidity_tracker", system_prompt=SYSTEM_PROMPT)
    state: AgentState = {
        "input": input_prompt, "output": "", "agent_id": "liquidity_tracker",
        "wallet_address": wallet_address, "tx_hash": tx_hash,
        "payment_required": False, "payment_amount": 0.0, "payment_address": "",
        "error": None, "steps": [],
    }
    return app.invoke(state)

if __name__ == "__main__":
    result = run_liquidity_tracker("Analyze XLM/USDC liquidity depth and simulate 5000 XLM trade slippage")
    print(json.dumps(result, indent=2))
