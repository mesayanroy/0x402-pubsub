//! MEV Bot — entry point.
//!
//! Connects to Horizon, watches for large order-book imbalances on configured
//! trading pairs, and submits front-run / sandwich orders when opportunities
//! exceed the configured profit threshold.
//!
//! ## Usage
//! ```
//! cp .env.template .env
//! # fill in AGENT_SECRET_KEY, pairs, thresholds …
//! cargo run --release --bin mev_bot
//! ```

mod config;
mod executor;
mod strategy;

use anyhow::Result;
use common::{HorizonClient, Keypair};
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    let cfg = config::MevBotConfig::from_env()?;

    tracing_subscriber::fmt()
        .with_env_filter(&cfg.common.log_level)
        .with_target(false)
        .compact()
        .init();

    info!(
        network  = if cfg.common.is_mainnet() { "mainnet" } else { "testnet" },
        horizon  = %cfg.common.horizon_url,
        pairs    = cfg.pairs.len(),
        "MEV Bot starting"
    );

    let horizon = HorizonClient::new(&cfg.common.horizon_url)?;
    let keypair = Keypair::from_secret(&cfg.common.agent_secret)?;

    info!(address = %keypair.public_key, "Loaded wallet");

    // Run the main scan loop — never returns unless a fatal error occurs.
    strategy::scan_loop(&cfg, &horizon, &keypair).await
}
