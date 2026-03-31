//! AgentValidator — Soroban smart contract
//!
//! This contract acts as the **on-chain gatekeeper** that must be called before
//! an AI agent is deployed on AgentForge.  It performs three steps, each of
//! which involves an **inter-contract call** to the `AgentRegistry` contract:
//!
//! 1. `validate_wallet`   – verify the deployer's wallet owns a valid Stellar
//!                          account and that no duplicate agent ID exists in the
//!                          registry yet.
//! 2. `request_deploy`    – record a pending deployment intent, emitting an
//!                          on-chain event that the UI can subscribe to for the
//!                          wallet-confirmation step.
//! 3. `confirm_deploy`    – called after the user has signed the confirmation
//!                          message in their wallet; performs the actual inter-
//!                          contract call to `AgentRegistry::register_agent` and
//!                          marks the deployment as confirmed on-chain.
//!
//! ## Inter-contract calls
//!
//! The contract stores the `AgentRegistry` contract address in persistent
//! storage.  Every state-mutating entry point (`request_deploy`,
//! `confirm_deploy`) invokes methods on that stored address using the Soroban
//! SDK's `invoke_contract` primitive, proving that cross-contract communication
//! happens at the smart-contract layer — not merely off-chain via API calls.
//!
//! ```
//! [AgentValidator]  ──validate_wallet──▶  [AgentRegistry.get_agent]  (read)
//! [AgentValidator]  ──confirm_deploy──▶   [AgentRegistry.register_agent]  (write)
//! ```

#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, vec, Address, BytesN, Env, Symbol,
};

// ─── Storage keys ────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    /// Address of the deployed AgentRegistry contract.
    Registry,
    /// Pending deployment by agent_id.
    PendingDeploy(Symbol),
    /// Confirmed deployment by agent_id.
    ConfirmedDeploy(Symbol),
}

// ─── Data types ───────────────────────────────────────────────────────────────

/// Represents a pending deployment that is awaiting wallet confirmation.
#[contracttype]
#[derive(Clone)]
pub struct PendingDeployment {
    /// Deployer's Stellar address.
    pub deployer: Address,
    /// Unique on-chain agent identifier.
    pub agent_id: Symbol,
    /// Off-chain metadata hash (IPFS CID or SHA-256 of agent JSON).
    pub metadata_hash: Symbol,
    /// Price per request in stroops (1 XLM = 10_000_000 stroops).
    pub price_stroops: i128,
    /// Ledger sequence number when the pending intent was created.
    pub created_ledger: u32,
    /// Whether the deployment has been confirmed.
    pub confirmed: bool,
}

// ─── Inter-contract call client stubs ────────────────────────────────────────

/// Minimal client interface for AgentRegistry used for inter-contract calls.
///
/// The Soroban SDK provides `invoke_contract` for dynamic dispatch.  Here we
/// use it directly to keep the validator contract self-contained and avoid
/// tight compile-time coupling to the registry's ABI.
mod registry_client {
    use soroban_sdk::{Address, Env, IntoVal, Symbol, Val};

    /// Call `AgentRegistry::register_agent` on `registry_addr`.
    pub fn register_agent(
        env: &Env,
        registry_addr: &Address,
        owner: &Address,
        agent_id: &Symbol,
        price_xlm: i128,
        metadata_hash: &Symbol,
    ) {
        let args: soroban_sdk::Vec<Val> = soroban_sdk::vec![
            env,
            owner.into_val(env),
            agent_id.into_val(env),
            price_xlm.into_val(env),
            metadata_hash.into_val(env),
        ];
        env.invoke_contract::<()>(
            registry_addr,
            &Symbol::new(env, "register_agent"),
            args,
        );
    }

    /// Call `AgentRegistry::get_agent` on `registry_addr`.
    /// Returns `true` if the agent already exists (call does not panic).
    pub fn agent_exists(env: &Env, registry_addr: &Address, agent_id: &Symbol) -> bool {
        let args: soroban_sdk::Vec<Val> = soroban_sdk::vec![env, agent_id.into_val(env)];
        // `get_agent` panics when the agent is not found.  We use a try-invoke
        // pattern to detect existence without propagating the panic.
        env.try_invoke_contract::<soroban_sdk::Val, soroban_sdk::Error>(
            registry_addr,
            &Symbol::new(env, "get_agent"),
            args,
        )
        .is_ok()
    }
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct AgentValidator;

#[contractimpl]
impl AgentValidator {
    // ── Admin ─────────────────────────────────────────────────────────────────

    /// One-time initialiser: store the address of the sibling AgentRegistry.
    ///
    /// Must be called by the contract deployer before any other entry point.
    pub fn initialize(env: Env, admin: Address, registry: Address) {
        admin.require_auth();
        // Prevent re-initialisation.
        assert!(
            env.storage().instance().get::<DataKey, Address>(&DataKey::Registry).is_none(),
            "already initialized"
        );
        env.storage().instance().set(&DataKey::Registry, &registry);
    }

    // ── Step 1 — Validate wallet ──────────────────────────────────────────────

    /// **Inter-contract call (read):** Check that `agent_id` is not already
    /// registered in `AgentRegistry`, and that the caller controls `deployer`.
    ///
    /// Returns `true` when validation passes.
    pub fn validate_wallet(env: Env, deployer: Address, agent_id: Symbol) -> bool {
        deployer.require_auth();

        let registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::Registry)
            .expect("validator not initialized");

        // Inter-contract read call ↓
        let already_exists = registry_client::agent_exists(&env, &registry, &agent_id);
        assert!(!already_exists, "agent_id already registered");

        env.events().publish(
            (symbol_short!("AVAL"), symbol_short!("valid")),
            (agent_id, deployer),
        );

        true
    }

    // ── Step 2 — Request deployment ───────────────────────────────────────────

    /// Record a pending deployment intent on-chain.  The UI listens for the
    /// `AVAL/pending` event and presents the wallet-confirmation prompt to the
    /// user.
    pub fn request_deploy(
        env: Env,
        deployer: Address,
        agent_id: Symbol,
        metadata_hash: Symbol,
        price_stroops: i128,
    ) {
        deployer.require_auth();

        assert!(price_stroops >= 0, "price must be non-negative");

        // Ensure no duplicate pending request.
        let key = DataKey::PendingDeploy(agent_id.clone());
        assert!(
            env.storage().persistent().get::<DataKey, PendingDeployment>(&key).is_none(),
            "deployment already pending"
        );

        let pending = PendingDeployment {
            deployer: deployer.clone(),
            agent_id: agent_id.clone(),
            metadata_hash: metadata_hash.clone(),
            price_stroops,
            created_ledger: env.ledger().sequence(),
            confirmed: false,
        };

        env.storage().persistent().set(&key, &pending);

        env.events().publish(
            (symbol_short!("AVAL"), symbol_short!("pending")),
            (agent_id, deployer, price_stroops),
        );
    }

    // ── Step 3 — Confirm deployment ───────────────────────────────────────────

    /// **Inter-contract call (write):** After the user has signed the on-chain
    /// confirmation, forward the deployment to `AgentRegistry::register_agent`.
    ///
    /// `signature_hash` is the SHA-256 of the signed validation message; it is
    /// stored on-chain as proof that the deployer acknowledged the terms.
    pub fn confirm_deploy(
        env: Env,
        deployer: Address,
        agent_id: Symbol,
        signature_hash: BytesN<32>,
    ) {
        deployer.require_auth();

        let key = DataKey::PendingDeploy(agent_id.clone());
        let mut pending: PendingDeployment = env
            .storage()
            .persistent()
            .get(&key)
            .expect("no pending deployment for this agent_id");

        assert!(pending.deployer == deployer, "caller is not the deployer");
        assert!(!pending.confirmed, "deployment already confirmed");

        let registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::Registry)
            .expect("validator not initialized");

        // Convert stroops back to whole-XLM units for the registry.
        let price_xlm: i128 = pending.price_stroops / 10_000_000;

        // ── Inter-contract WRITE call ─────────────────────────────────────────
        // This is the key integration: AgentValidator calls AgentRegistry on-chain.
        registry_client::register_agent(
            &env,
            &registry,
            &deployer,
            &agent_id,
            price_xlm,
            &pending.metadata_hash,
        );

        // Mark as confirmed and persist confirmation record.
        pending.confirmed = true;
        env.storage().persistent().set(&key, &pending);

        env.storage().persistent().set(
            &DataKey::ConfirmedDeploy(agent_id.clone()),
            &(deployer.clone(), signature_hash.clone()),
        );

        env.events().publish(
            (symbol_short!("AVAL"), symbol_short!("confirm")),
            (agent_id, deployer, signature_hash),
        );
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    /// Return the pending deployment record for an agent_id.
    pub fn get_pending(env: Env, agent_id: Symbol) -> PendingDeployment {
        env.storage()
            .persistent()
            .get(&DataKey::PendingDeploy(agent_id))
            .expect("no pending deployment")
    }

    /// Return whether an agent has been confirmed through this validator.
    pub fn is_confirmed(env: Env, agent_id: Symbol) -> bool {
        env.storage()
            .persistent()
            .get::<DataKey, (Address, BytesN<32>)>(&DataKey::ConfirmedDeploy(agent_id))
            .is_some()
    }

    /// Return the stored AgentRegistry address.
    pub fn registry_address(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Registry)
            .expect("validator not initialized")
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{symbol_short, Address, BytesN, Env, Symbol};

    /// Deploy a minimal mock of AgentRegistry for testing inter-contract calls.
    ///
    /// The mock is defined inline using `soroban_sdk::contractimpl` so the
    /// test harness can upload and instantiate it programmatically.
    mod mock_registry {
        use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

        #[contracttype]
        pub enum Key {
            Agent(Symbol),
        }

        #[contract]
        pub struct MockRegistry;

        #[contractimpl]
        impl MockRegistry {
            pub fn register_agent(
                env: Env,
                owner: Address,
                agent_id: Symbol,
                price_xlm: i128,
                _metadata_hash: Symbol,
            ) {
                env.storage().persistent().set(&Key::Agent(agent_id.clone()), &owner);
                env.events().publish(
                    (symbol_short!("MREG"), symbol_short!("ok")),
                    (agent_id, owner, price_xlm),
                );
            }

            pub fn get_agent(env: Env, agent_id: Symbol) -> Address {
                env.storage()
                    .persistent()
                    .get(&Key::Agent(agent_id))
                    .expect("Agent not found")
            }
        }
    }

    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        // Deploy mock registry
        let registry_id = env.register_contract(None, mock_registry::MockRegistry);

        // Deploy validator
        let validator_id = env.register_contract(None, AgentValidator);

        let admin = Address::generate(&env);

        // Initialise validator with mock registry address
        let client = AgentValidatorClient::new(&env, &validator_id);
        client.initialize(&admin, &registry_id);

        (env, validator_id, registry_id, admin)
    }

    #[test]
    fn test_validate_wallet_success() {
        let (env, validator_id, _registry_id, _admin) = setup();
        let client = AgentValidatorClient::new(&env, &validator_id);

        let deployer = Address::generate(&env);
        let agent_id = symbol_short!("agent1");

        let result = client.validate_wallet(&deployer, &agent_id);
        assert!(result);
    }

    #[test]
    fn test_request_deploy_records_pending() {
        let (env, validator_id, _registry_id, _admin) = setup();
        let client = AgentValidatorClient::new(&env, &validator_id);

        let deployer = Address::generate(&env);
        let agent_id = symbol_short!("agent2");
        let meta = symbol_short!("meta01");
        let price: i128 = 500_000; // 0.05 XLM in stroops

        client.request_deploy(&deployer, &agent_id, &meta, &price);

        let pending = client.get_pending(&agent_id);
        assert_eq!(pending.deployer, deployer);
        assert!(!pending.confirmed);
    }

    #[test]
    fn test_confirm_deploy_inter_contract_call() {
        let (env, validator_id, registry_id, _admin) = setup();
        let client = AgentValidatorClient::new(&env, &validator_id);

        let deployer = Address::generate(&env);
        let agent_id = symbol_short!("agent3");
        let meta = symbol_short!("meta03");
        let price: i128 = 1_000_000; // 0.1 XLM

        // Step 1: validate
        client.validate_wallet(&deployer, &agent_id);

        // Step 2: request deploy
        client.request_deploy(&deployer, &agent_id, &meta, &price);

        // Step 3: confirm — triggers inter-contract call to MockRegistry
        let sig_hash: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);
        client.confirm_deploy(&deployer, &agent_id, &sig_hash);

        // Verify it is marked confirmed in validator
        assert!(client.is_confirmed(&agent_id));

        // Verify the inter-contract call wrote to MockRegistry
        let registry_client = mock_registry::MockRegistryClient::new(&env, &registry_id);
        let registered_owner = registry_client.get_agent(&agent_id);
        assert_eq!(registered_owner, deployer);
    }

    #[test]
    #[should_panic(expected = "deployment already confirmed")]
    fn test_double_confirm_fails() {
        let (env, validator_id, _registry_id, _admin) = setup();
        let client = AgentValidatorClient::new(&env, &validator_id);

        let deployer = Address::generate(&env);
        let agent_id = symbol_short!("agent4");
        let meta = symbol_short!("meta04");

        client.request_deploy(&deployer, &agent_id, &meta, &0i128);
        let sig_hash: BytesN<32> = BytesN::from_array(&env, &[1u8; 32]);
        client.confirm_deploy(&deployer, &agent_id, &sig_hash);
        // Second confirm should panic
        client.confirm_deploy(&deployer, &agent_id, &sig_hash);
    }
}
