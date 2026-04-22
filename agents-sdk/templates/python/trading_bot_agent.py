"""
AgentForge LangGraph Template — Trading Bot Agent
Buy/sell/short strategies with grid & DCA modes on Stellar testnet.
"""
import json
from base_agent import build_single_agent_graph, build_a2a_graph, AgentState

SYSTEM_PROMPT = """You are a professional trading bot for the Stellar DEX testnet.
Strategies available:
1. Grid Trading: Set buy/sell grid levels, auto-rebalance on price movements
2. DCA (Dollar Cost Averaging): Periodic XLM purchases at set intervals
3. Trend Following: Use moving averages to follow market momentum
4. Mean Reversion: Trade when prices deviate from historical averages
5. Stop-Loss/Take-Profit: Automatic position management

For each trade signal provide: direction (buy/sell/short), pair, entry price, target, stop-loss,
position size, leverage (if applicable), and confidence score.
"""

def run_trading_bot(input_prompt: str, wallet_address: str = "", tx_hash: str = None):
    app = build_single_agent_graph(agent_id="trading_bot", system_prompt=SYSTEM_PROMPT)
    state: AgentState = {
        "input": input_prompt, "output": "", "agent_id": "trading_bot",
        "wallet_address": wallet_address, "tx_hash": tx_hash,
        "payment_required": False, "payment_amount": 0.0, "payment_address": "",
        "error": None, "steps": [],
    }
    return app.invoke(state)

if __name__ == "__main__":
    result = run_trading_bot("Set up a grid trading strategy for XLM/USDC between 0.10 and 0.15")
    print(json.dumps(result, indent=2))
