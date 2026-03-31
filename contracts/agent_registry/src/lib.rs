//! ╔════════════════════════════════════════════════════════════════════════════╗
//! ║           AgentRegistry — Soroban Smart Contract                            ║
//! ║                 Professional Agent Registration & Management                 ║
//! ╚════════════════════════════════════════════════════════════════════════════╝
//!
//! AgentRegistry is the **immutable ledger** of deployed AI agents on AgentForge.
//! It stores agent metadata, pricing, and usage statistics in persistent on-chain
//! storage, ensuring agents are discoverable and payments can be verified.
//!
//! ## Architecture
//!
//! This contract is called **exclusively** by AgentValidator after:
//! 1. ✅ Wallet authentication (Freighter signature verification)
//! 2. ✅ Duplicate-check (no agent_id collision)
//! 3. ✅ Fee collection (validation fee paid in XLM)
//!
//! Agent Registry then:
//! - Stores agent metadata permanently
//! - Enables payment tracking and request counting
//! - Provides query interface for agent discovery
//! - Emits events for off-chain indexing
//!
//! ## Security Model
//!
//! - Only AgentValidator may call `register_agent()`
//! - Once registered, agents are immutable (requires admin override to modify)
//! - Payment tracking is audit-friendly for payout calculations

#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

// ═══════════════════════════════════════════════════════════════════════════════
// ─── DATA STRUCTURES ─────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/// **AgentData**: Comprehensive on-chain record of a deployed AI agent
#[contracttype]
#[derive(Clone)]
pub struct AgentData {
    /// Stellar address of the agent owner
    pub owner: Address,
    /// Price per request in whole XLM units
    pub price_xlm: i128,
    /// Total number of requests serviced by this agent
    pub request_count: u64,
    /// Whether the agent is currently active and accepting requests
    pub is_active: bool,
    /// IPFS CID or content hash pointing to agent configuration/model
    pub metadata_hash: Symbol,
    /// Ledger sequence when agent was registered
    pub registered_ledger: u32,
    /// Total payments received (in stroops, for accounting)
    pub total_earnings_stroops: i128,
    /// Upgrade/modification version number
    pub version: u64,
}

/// **Storage Keys**: Persistent and instance storage structure
#[contracttype]
pub enum DataKey {
    /// Agent records indexed by agent_id
    Agent(Symbol),
    /// Admin address for upgrade/deactivation
    Admin,
    /// AgentValidator address (only contract that can register agents)
    Validator,
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── SOROBAN CONTRACT ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

#[contract]
pub struct AgentRegistry;

#[contractimpl]
impl AgentRegistry {
    // ─────────────────────────────────────────────────────────────────────────
    // ADMIN & INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────────

    /// **initialize**: One-time setup to configure admin and validator addresses.
    /// Must be called immediately after contract deployment.
    pub fn initialize(env: Env, admin: Address, validator: Address) {
        admin.require_auth();

        // Guard against re-initialization
        assert!(
            env.storage()
                .instance()
                .get::<DataKey, Address>(&DataKey::Admin)
                .is_none(),
            "already initialized"
        );

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Validator, &validator);

        env.events().publish(
            (symbol_short!("AREG"), symbol_short!("init")),
            (admin, validator),
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AGENT REGISTRATION (called by AgentValidator only)
    // ─────────────────────────────────────────────────────────────────────────

    /// **register_agent**: Permanently record a new agent on-chain.
    /// Called exclusively by AgentValidator after fee collection + signature verification.
    ///
    /// # Arguments
    /// * `owner` - Stellar address of agent owner
    /// * `agent_id` - Unique on-chain identifier
    /// * `price_xlm` - Agent price per request (whole XLM)
    /// * `metadata_hash` - IPFS CID or configuration hash
    ///
    /// # Authority
    /// - Only AgentValidator may call this method
    /// - Owner authentication is verified at Validator level
    pub fn register_agent(
        env: Env,
        owner: Address,
        agent_id: Symbol,
        price_xlm: i128,
        metadata_hash: Symbol,
    ) {
        // ─ Verify caller is the authorized AgentValidator ─────────────────
        let validator: Address = env
            .storage()
            .instance()
            .get(&DataKey::Validator)
            .expect("registry not initialized");

        validator.require_auth();

        // ─ Prevent duplicate registration ────────────────────────────────
        let key = DataKey::Agent(agent_id.clone());
        assert!(
            env.storage()
                .persistent()
                .get::<DataKey, AgentData>(&key)
                .is_none(),
            "agent already registered"
        );

        // ─ Create agent record ───────────────────────────────────────────
        let agent = AgentData {
            owner: owner.clone(),
            price_xlm,
            request_count: 0,
            is_active: true,
            metadata_hash,
            registered_ledger: env.ledger().sequence(),
            total_earnings_stroops: 0,
            version: 1,
        };

        env.storage().persistent().set(&key, &agent);

        env.events().publish(
            (symbol_short!("AREG"), symbol_short!("reg")),
            (agent_id, owner, price_xlm),
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PAYMENT & REQUEST TRACKING
    // ─────────────────────────────────────────────────────────────────────────

    /// **record_payment**: Track a payment for an agent request.
    /// In production, this integrates with Stellar Asset Contract for actual XLM transfers.
    ///
    /// # Arguments
    /// * `caller` - Address making the payment
    /// * `agent_id` - Agent being paid for
    /// * `amount_stroops` - Payment amount in stroops
    pub fn record_payment(
        env: Env,
        caller: Address,
        agent_id: Symbol,
        amount_stroops: i128,
    ) {
        caller.require_auth();

        let key = DataKey::Agent(agent_id.clone());
        let mut agent: AgentData = env
            .storage()
            .persistent()
            .get(&key)
            .expect("agent not found");

        assert!(agent.is_active, "agent is inactive");

        // Convert stroops to XLM for comparison
        let price_stroops = agent.price_xlm * 10_000_000;
        assert!(
            amount_stroops >= price_stroops,
            "insufficient payment"
        );

        // Update agent statistics
        agent.request_count += 1;
        agent.total_earnings_stroops += amount_stroops;

        env.storage().persistent().set(&key, &agent);

        env.events().publish(
            (symbol_short!("AREG"), symbol_short!("paid")),
            (agent_id, caller, amount_stroops),
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADMIN FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────

    /// **deactivate_agent**: Disable an agent (admin-only, irreversible).
    pub fn deactivate_agent(env: Env, agent_id: Symbol) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("registry not initialized");

        admin.require_auth();

        let key = DataKey::Agent(agent_id.clone());
        let mut agent: AgentData = env
            .storage()
            .persistent()
            .get(&key)
            .expect("agent not found");

        assert!(agent.is_active, "agent already inactive");

        agent.is_active = false;
        env.storage().persistent().set(&key, &agent);

        env.events().publish(
            (symbol_short!("AREG"), symbol_short!("deac")),
            agent_id,
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // QUERY METHODS
    // ─────────────────────────────────────────────────────────────────────────

    /// **get_agent**: Retrieve full agent data by agent_id.
    pub fn get_agent(env: Env, agent_id: Symbol) -> AgentData {
        env.storage()
            .persistent()
            .get(&DataKey::Agent(agent_id))
            .expect("agent not found")
    }

    /// **is_agent_active**: Quick check if agent is active.
    pub fn is_agent_active(env: Env, agent_id: Symbol) -> bool {
        let agent = Self::get_agent(env, agent_id);
        agent.is_active
    }

    /// **get_agent_price**: Query agent's price per request.
    pub fn get_agent_price(env: Env, agent_id: Symbol) -> i128 {
        let agent = Self::get_agent(env, agent_id);
        agent.price_xlm
    }

    /// **get_agent_stats**: Get usage and earnings statistics.
    pub fn get_agent_stats(env: Env, agent_id: Symbol) -> (u64, i128) {
        let agent = Self::get_agent(env, agent_id);
        (agent.request_count, agent.total_earnings_stroops)
    }

    /// **registry_admin**: Query the admin address.
    pub fn registry_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("registry not initialized")
    }

    /// **validator_address**: Query the registered validator address.
    pub fn validator_address(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Validator)
            .expect("registry not initialized")
    }
}
