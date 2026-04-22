//! AF$ Token — AgentForge Native Token
//!
//! A Soroban fungible token on Stellar testnet.
//! Total supply: 100,000,000 AF$
//! Faucet: 5,000 AF$ per claim, max 3 claims per wallet.
//!
//! Deploy on testnet:
//!   stellar contract deploy --wasm target/wasm32-unknown-unknown/release/af_token.wasm \
//!     --source <secret> --network testnet

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String, Symbol,
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

const TOTAL_SUPPLY_KEY: Symbol = symbol_short!("TSUPPLY");
const ADMIN_KEY: Symbol = symbol_short!("ADMIN");
const NAME_KEY: Symbol = symbol_short!("NAME");
const SYMBOL_KEY: Symbol = symbol_short!("SYMBOL");
const DECIMALS_KEY: Symbol = symbol_short!("DECIMALS");

const FAUCET_AMOUNT: i128 = 5_000 * 10_000_000; // 5000 AF$ in smallest unit (7 decimals)
const FAUCET_MAX_CLAIMS: u32 = 3;
const TOTAL_SUPPLY: i128 = 100_000_000 * 10_000_000; // 100M AF$

#[contracttype]
pub enum DataKey {
    Balance(Address),
    Allowance(Address, Address),
    FaucetClaims(Address),
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct AfToken;

#[contractimpl]
impl AfToken {
    /// Initialize the AF$ token. Must be called once after deployment.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&ADMIN_KEY) {
            panic!("already initialized");
        }
        admin.require_auth();

        env.storage().instance().set(&ADMIN_KEY, &admin);
        env.storage().instance().set(&TOTAL_SUPPLY_KEY, &TOTAL_SUPPLY);
        env.storage().instance().set(&NAME_KEY, &String::from_str(&env, "AgentForge Token"));
        env.storage().instance().set(&SYMBOL_KEY, &String::from_str(&env, "AF$"));
        env.storage().instance().set(&DECIMALS_KEY, &7u32);

        // Mint all supply to admin
        env.storage()
            .persistent()
            .set(&DataKey::Balance(admin.clone()), &TOTAL_SUPPLY);
    }

    // ─── ERC-20-like interface ────────────────────────────────────────────────

    pub fn name(env: Env) -> String {
        env.storage().instance().get(&NAME_KEY).unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage().instance().get(&SYMBOL_KEY).unwrap()
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&DECIMALS_KEY).unwrap_or(7)
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&TOTAL_SUPPLY_KEY).unwrap_or(0)
    }

    pub fn balance(env: Env, owner: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(owner))
            .unwrap_or(0)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        assert!(amount > 0, "amount must be positive");

        let from_balance = Self::balance(env.clone(), from.clone());
        assert!(from_balance >= amount, "insufficient balance");

        env.storage()
            .persistent()
            .set(&DataKey::Balance(from), &(from_balance - amount));

        let to_balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to), &(to_balance + amount));
    }

    pub fn approve(env: Env, owner: Address, spender: Address, amount: i128) {
        owner.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::Allowance(owner, spender), &amount);
    }

    pub fn allowance(env: Env, owner: Address, spender: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Allowance(owner, spender))
            .unwrap_or(0)
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        let allowed = Self::allowance(env.clone(), from.clone(), spender.clone());
        assert!(allowed >= amount, "allowance exceeded");

        env.storage()
            .persistent()
            .set(&DataKey::Allowance(from.clone(), spender), &(allowed - amount));

        Self::transfer(env, from, to, amount);
    }

    // ─── Faucet ───────────────────────────────────────────────────────────────

    /// Claim 5,000 AF$ tokens. Max 3 claims per wallet address.
    /// Authorization is provided by the admin (server-side faucet), NOT the recipient,
    /// so this can be called from the backend without the user signing.
    pub fn faucet_claim(env: Env, admin: Address, recipient: Address) {
        // Only the contract admin may call the faucet on behalf of a recipient.
        admin.require_auth();
        let stored_admin: Address = env.storage().instance().get(&ADMIN_KEY).unwrap();
        assert!(admin == stored_admin, "caller is not the admin");

        let claims: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::FaucetClaims(recipient.clone()))
            .unwrap_or(0);

        assert!(claims < FAUCET_MAX_CLAIMS, "faucet claim limit reached (max 3)");

        // Transfer from admin balance to recipient
        let admin_balance = Self::balance(env.clone(), admin.clone());
        assert!(admin_balance >= FAUCET_AMOUNT, "faucet depleted");

        env.storage()
            .persistent()
            .set(&DataKey::Balance(admin), &(admin_balance - FAUCET_AMOUNT));

        let recipient_balance = Self::balance(env.clone(), recipient.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Balance(recipient.clone()), &(recipient_balance + FAUCET_AMOUNT));

        env.storage()
            .persistent()
            .set(&DataKey::FaucetClaims(recipient), &(claims + 1));
    }

    pub fn faucet_claims_remaining(env: Env, address: Address) -> u32 {
        let claims: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::FaucetClaims(address))
            .unwrap_or(0);
        FAUCET_MAX_CLAIMS.saturating_sub(claims)
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&ADMIN_KEY).unwrap();
        admin.require_auth();
        assert!(amount > 0, "amount must be positive");
        let balance = Self::balance(env.clone(), to.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Balance(to), &(balance + amount));
        let supply: i128 = env.storage().instance().get(&TOTAL_SUPPLY_KEY).unwrap_or(0);
        env.storage().instance().set(&TOTAL_SUPPLY_KEY, &(supply + amount));
    }
}
