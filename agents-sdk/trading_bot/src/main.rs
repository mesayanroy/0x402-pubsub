//! Trading Bot — entry point.
//!
//! Implements three strategies on the Stellar DEX:
//! - **Buy**   — market/limit buy using ManageBuyOffer
//! - **Sell**  — market/limit sell using ManageSellOffer
//! - **Short** — synthetic short via borrow-equivalent: sell an asset you
//!               hold for XLM, wait for price drop, repurchase cheaper.
//!
//! ## Usage
//! ```
//! cp .env.template .env
//! # Set STRATEGY=buy|sell|short, ASSET, AMOUNT, etc.
//! cargo run --release --bin trading_bot
//! ```

mod config;
mod orders;
mod strategy;

use anyhow::Result;
use common::{HorizonClient, Keypair};
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    let cfg = config::TradingBotConfig::from_env()?;

    tracing_subscriber::fmt()
        .with_env_filter(&cfg.common.log_level)
        .with_target(false)
        .compact()
        .init();

    info!(
        strategy   = ?cfg.active_strategy,
        horizon    = %cfg.common.horizon_url,
        "Trading Bot starting"
    );

    let horizon = HorizonClient::new(&cfg.common.horizon_url)?;
    let keypair = Keypair::from_secret(&cfg.common.agent_secret)?;

    info!(address = %keypair.public_key, "Wallet loaded");

    strategy::run(&cfg, &horizon, &keypair).await
}
