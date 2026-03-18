#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

#[contracttype]
#[derive(Clone)]
pub struct AgentData {
    pub owner: Address,
    pub price_xlm: i128,
    pub request_count: u64,
    pub is_active: bool,
    pub node_id: Symbol,
}

#[contracttype]
pub enum DataKey {
    Agent(Symbol),
}

#[contract]
pub struct AgentRegistry;

#[contractimpl]
impl AgentRegistry {
    /// Register a new agent on-chain
    pub fn register_agent(
        env: Env,
        owner: Address,
        agent_id: Symbol,
        price_xlm: i128,
        metadata_hash: Symbol,
    ) {
        owner.require_auth();

        let key = DataKey::Agent(agent_id.clone());
        let agent = AgentData {
            owner: owner.clone(),
            price_xlm,
            request_count: 0,
            is_active: true,
            node_id: metadata_hash,
        };

        env.storage().persistent().set(&key, &agent);

        env.events().publish(
            (symbol_short!("AREG"), symbol_short!("agent")),
            (agent_id, owner, price_xlm),
        );
    }

    /// Pay for an agent request
    pub fn pay_for_request(
        env: Env,
        caller: Address,
        agent_id: Symbol,
        amount: i128,
    ) {
        caller.require_auth();

        let key = DataKey::Agent(agent_id.clone());
        let mut agent: AgentData = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Agent not found");

        assert!(amount >= agent.price_xlm, "Insufficient payment");

        // In production: transfer XLM via Stellar Asset Contract
        // For testnet demo, we record the payment intent
        agent.request_count += 1;
        env.storage().persistent().set(&key, &agent);

        env.events().publish(
            (symbol_short!("AREG"), symbol_short!("paid")),
            (agent_id, caller, amount),
        );
    }

    /// Fork an existing agent
    pub fn fork_agent(
        env: Env,
        caller: Address,
        original_id: Symbol,
        new_id: Symbol,
    ) {
        caller.require_auth();

        env.events().publish(
            (symbol_short!("AREG"), symbol_short!("fork")),
            (original_id, new_id, caller),
        );
    }

    /// Get agent data
    pub fn get_agent(env: Env, agent_id: Symbol) -> AgentData {
        let key = DataKey::Agent(agent_id);
        env.storage()
            .persistent()
            .get(&key)
            .expect("Agent not found")
    }

    /// Update agent price (owner only)
    pub fn update_price(
        env: Env,
        owner: Address,
        agent_id: Symbol,
        new_price: i128,
    ) {
        owner.require_auth();

        let key = DataKey::Agent(agent_id.clone());
        let mut agent: AgentData = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Agent not found");

        assert!(agent.owner == owner, "Not the agent owner");
        assert!(new_price > 0, "Price must be positive");

        agent.price_xlm = new_price;
        env.storage().persistent().set(&key, &agent);

        env.events().publish(
            (symbol_short!("AREG"), symbol_short!("price")),
            (agent_id, new_price),
        );
    }
}
