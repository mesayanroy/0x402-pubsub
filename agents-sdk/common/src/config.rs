//! Common environment-variable configuration shared across all agents.

use anyhow::{Context, Result};

/// Stroops per XLM (1 XLM = 10_000_000 stroops).
pub const STROOPS_PER_XLM: i64 = 10_000_000;

/// Stellar mainnet network passphrase.
pub const MAINNET_PASSPHRASE: &str =
    "Public Global Stellar Network ; September 2015";

/// Stellar testnet network passphrase.
pub const TESTNET_PASSPHRASE: &str =
    "Test SDF Network ; September 2015";

/// Configuration loaded from the environment (via `.env` / shell).
///
/// Fields that are not provided use sensible production defaults.
#[derive(Debug, Clone)]
pub struct CommonConfig {
    /// Stellar Horizon base URL, e.g. `https://horizon.stellar.org`
    pub horizon_url: String,
    /// Stellar network passphrase (mainnet or testnet).
    pub network_passphrase: String,
    /// Soroban RPC endpoint (for contract invocations).
    pub soroban_rpc_url: String,
    /// AgentRegistry contract ID deployed via `contracts/deploy.sh`.
    pub contract_id: String,
    /// Agent's Stellar secret key (`S…`).
    pub agent_secret: String,
    /// Minimum fee per operation in stroops (default: 100).
    pub base_fee_stroops: u32,
    /// Maximum acceptable slippage in basis points (default: 50 = 0.5%).
    pub max_slippage_bps: u32,
    /// Log level (default: `info`).
    pub log_level: String,
}

impl CommonConfig {
    /// Load configuration from the process environment.
    ///
    /// Call `dotenvy::dotenv().ok()` before this to pick up a `.env` file.
    pub fn from_env() -> Result<Self> {
        let horizon_url = std::env::var("HORIZON_URL")
            .unwrap_or_else(|_| "https://horizon-testnet.stellar.org".to_string());

        let network_passphrase = std::env::var("STELLAR_NETWORK_PASSPHRASE")
            .unwrap_or_else(|_| TESTNET_PASSPHRASE.to_string());

        let soroban_rpc_url = std::env::var("SOROBAN_RPC_URL")
            .unwrap_or_else(|_| "https://soroban-testnet.stellar.org".to_string());

        let contract_id = std::env::var("SOROBAN_CONTRACT_ID")
            .unwrap_or_default();

        let agent_secret = std::env::var("AGENT_SECRET_KEY")
            .context("AGENT_SECRET_KEY env var is required")?;

        let base_fee_stroops = std::env::var("BASE_FEE_STROOPS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(100);

        let max_slippage_bps = std::env::var("MAX_SLIPPAGE_BPS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(50);

        let log_level = std::env::var("LOG_LEVEL").unwrap_or_else(|_| "info".to_string());

        Ok(Self {
            horizon_url,
            network_passphrase,
            soroban_rpc_url,
            contract_id,
            agent_secret,
            base_fee_stroops,
            max_slippage_bps,
            log_level,
        })
    }

    /// Returns `true` when running against the Stellar mainnet.
    pub fn is_mainnet(&self) -> bool {
        self.network_passphrase == MAINNET_PASSPHRASE
    }
}
