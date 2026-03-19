//! Mempool Monitor — entry point.
//!
//! Subscribes to the Horizon transaction SSE stream and routes each
//! event through configurable alert rules (high-fee spike, large payment,
//! watched address activity, offer creation, etc.).
//!
//! ## Usage
//! ```
//! cp .env.template .env
//! cargo run --release --bin mempool_monitor
//! ```

mod alerts;
mod config;
mod monitor;

use anyhow::Result;
use common::HorizonClient;
use tracing::info;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    let cfg = config::MonitorConfig::from_env()?;

    tracing_subscriber::fmt()
        .with_env_filter(&cfg.common.log_level)
        .with_target(false)
        .compact()
        .init();

    info!(
        horizon    = %cfg.common.horizon_url,
        rules      = cfg.alert_rules.len(),
        "Mempool Monitor starting"
    );

    let horizon = HorizonClient::new(&cfg.common.horizon_url)?;
    monitor::run(&cfg, &horizon).await
}
