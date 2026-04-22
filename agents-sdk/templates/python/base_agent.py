"""
AgentForge LangGraph Base Agent Template
Provides the common 0x402 payment-gated LangGraph workflow pattern.
"""

import os
import json
import time
from typing import TypedDict, Optional, List
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain.schema import HumanMessage, SystemMessage
import requests

load_dotenv()

AGENTFORGE_API_URL = os.getenv("AGENTFORGE_API_URL", "http://localhost:3000")
STELLAR_AGENT_SECRET = os.getenv("STELLAR_AGENT_SECRET", "")
ABLY_API_KEY = os.getenv("ABLY_API_KEY", "")


class AgentState(TypedDict):
    input: str
    output: str
    agent_id: str
    wallet_address: str
    tx_hash: Optional[str]
    payment_required: bool
    payment_amount: float
    payment_address: str
    error: Optional[str]
    steps: List[str]


def build_model(model_name: str = "openai-gpt4o-mini"):
    """Build a LangChain model from the model name."""
    if model_name == "openai-gpt4o-mini":
        return ChatOpenAI(model="gpt-4o-mini", api_key=os.getenv("OPENAI_API_KEY"))
    elif model_name == "anthropic-claude-haiku":
        return ChatAnthropic(model="claude-haiku-20240307", api_key=os.getenv("ANTHROPIC_API_KEY"))
    else:
        return ChatOpenAI(model="gpt-4o-mini", api_key=os.getenv("OPENAI_API_KEY"))


def create_run_node(agent_id: str, system_prompt: str, model_name: str = "openai-gpt4o-mini"):
    """Create a LangGraph node that runs an agent via the 0x402 API."""
    model = build_model(model_name)

    def run_node(state: AgentState) -> AgentState:
        headers = {"Content-Type": "application/json"}
        if state.get("wallet_address"):
            headers["X-Payment-Wallet"] = state["wallet_address"]
        if state.get("tx_hash"):
            headers["X-Payment-Tx-Hash"] = state["tx_hash"]

        try:
            resp = requests.post(
                f"{AGENTFORGE_API_URL}/api/agents/{agent_id}/run",
                headers=headers,
                json={"input": state["input"]},
                timeout=30,
            )
            data = resp.json()

            if resp.status_code == 402:
                pd = data.get("payment_details", {})
                return {
                    **state,
                    "payment_required": True,
                    "payment_amount": pd.get("amount_xlm", 0),
                    "payment_address": pd.get("address", ""),
                    "steps": state.get("steps", []) + ["payment_required"],
                }

            if not resp.ok or data.get("error"):
                return {
                    **state,
                    "error": data.get("error", f"HTTP {resp.status_code}"),
                    "steps": state.get("steps", []) + [f"error:{resp.status_code}"],
                }

            return {
                **state,
                "output": data.get("output", ""),
                "payment_required": False,
                "steps": state.get("steps", []) + ["completed"],
            }
        except Exception as e:
            return {**state, "error": str(e), "steps": state.get("steps", []) + ["exception"]}

    return run_node


def should_retry_payment(state: AgentState) -> str:
    if state.get("error"):
        return "error"
    if state.get("payment_required"):
        return "payment_required"
    return "completed"


def build_single_agent_graph(agent_id: str, system_prompt: str, model_name: str = "openai-gpt4o-mini") -> StateGraph:
    """Build a simple single-agent LangGraph workflow."""
    run_node = create_run_node(agent_id, system_prompt, model_name)

    graph = StateGraph(AgentState)
    graph.add_node("run", run_node)
    graph.set_entry_point("run")
    graph.add_edge("run", END)

    return graph.compile()


def build_a2a_graph(
    agent1_id: str,
    agent2_id: str,
    system_prompt1: str,
    system_prompt2: str,
    model_name: str = "openai-gpt4o-mini",
) -> StateGraph:
    """Build a multi-agent A2A LangGraph workflow where agent1 feeds agent2."""
    run1 = create_run_node(agent1_id, system_prompt1, model_name)
    run2 = create_run_node(agent2_id, system_prompt2, model_name)

    def bridge_node(state: AgentState) -> AgentState:
        """Pass agent1 output as agent2 input."""
        return {
            **state,
            "input": f"[Agent 1 Output]: {state['output']}\n\n[Original Task]: {state['input']}",
        }

    graph = StateGraph(AgentState)
    graph.add_node("run_agent1", run1)
    graph.add_node("bridge", bridge_node)
    graph.add_node("run_agent2", run2)
    graph.set_entry_point("run_agent1")
    graph.add_edge("run_agent1", "bridge")
    graph.add_edge("bridge", "run_agent2")
    graph.add_edge("run_agent2", END)

    return graph.compile()


if __name__ == "__main__":
    # Example: run a single agent
    agent_app = build_single_agent_graph(
        agent_id="1",
        system_prompt="You are a DeFi analyst.",
    )
    result = agent_app.invoke({
        "input": "Analyze current XLM/USDC liquidity",
        "output": "",
        "agent_id": "1",
        "wallet_address": "",
        "tx_hash": None,
        "payment_required": False,
        "payment_amount": 0.0,
        "payment_address": "",
        "error": None,
        "steps": [],
    })
    print(json.dumps(result, indent=2))
