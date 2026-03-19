//! Trading Bot configuration.

use anyhow::{Context, Result};
use common::{config::CommonConfig, Asset};

/// Which trading strategy the bot should run.
#[derive(Debug, Clone, PartialEq)]
pub enum Strategy {
    /// Place a limit/market buy order.
    Buy,
    /// Place a limit/market sell order.
    Sell,
    /// Synthetic short: sell now, repurchase when price drops.
    Short,
    /// Grid trading: place buy and sell offers at regular intervals.
    Grid,
    /// Dollar-cost averaging: buy a fixed amount on each interval.
    Dca,
}

impl std::str::FromStr for Strategy {
    type Err = anyhow::Error;
    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "buy"   => Ok(Strategy::Buy),
            "sell"  => Ok(Strategy::Sell),
            "short" => Ok(Strategy::Short),
            "grid"  => Ok(Strategy::Grid),
            "dca"   => Ok(Strategy::Dca),
            _       => anyhow::bail!("Unknown strategy: {s}. Expected buy|sell|short|grid|dca"),
        }
    }
}

/// Price trigger condition for stop-loss / take-profit.
#[derive(Debug, Clone)]
pub struct PriceTrigger {
    /// Fire when price drops below this level (stop-loss).
    pub stop_loss:    Option<f64>,
    /// Fire when price rises above this level (take-profit).
    pub take_profit:  Option<f64>,
}

#[derive(Debug, Clone)]
pub struct TradingBotConfig {
    pub common:              CommonConfig,
    pub active_strategy:     Strategy,
    /// Asset to trade (the quote asset is always XLM native unless overridden).
    pub trade_asset:         Asset,
    /// Total trade amount in XLM.
    pub amount_xlm:          f64,
    /// Limit price (None = market order via best ask/bid).
    pub limit_price:         Option<f64>,
    /// Stop-loss / take-profit triggers.
    pub trigger:             PriceTrigger,
    /// For DCA: interval between buys in seconds.
    pub dca_interval_secs:   u64,
    /// For grid: number of grid levels above and below mid-price.
    pub grid_levels:         usize,
    /// For grid: spacing between levels as a fraction (e.g. 0.005 = 0.5%).
    pub grid_spacing:        f64,
    /// Max slippage in basis points (overrides common default for trading).
    pub max_slippage_bps:    u32,
    /// Poll price every N milliseconds.
    pub poll_interval_ms:    u64,
    /// If true, log actions without submitting.
    pub dry_run:             bool,
    /// Existing Stellar offer ID to update (0 = create new).
    pub existing_offer_id:   i64,
}

impl TradingBotConfig {
    pub fn from_env() -> Result<Self> {
        let common = CommonConfig::from_env()?;

        let active_strategy: Strategy = std::env::var("STRATEGY")
            .unwrap_or_else(|_| "buy".to_string())
            .parse()
            .context("STRATEGY")?;

        let asset_code   = std::env::var("TRADE_ASSET_CODE")
            .unwrap_or_else(|_| "USDC".to_string());
        let asset_issuer = std::env::var("TRADE_ASSET_ISSUER")
            .unwrap_or_else(|_| "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5".to_string());

        let trade_asset = if asset_code.eq_ignore_ascii_case("native") {
            Asset::native()
        } else {
            Asset::credit(&asset_code, &asset_issuer)
        };

        let amount_xlm: f64 = std::env::var("AMOUNT_XLM")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(10.0);

        let limit_price: Option<f64> = std::env::var("LIMIT_PRICE")
            .ok().and_then(|v| v.parse().ok());

        let stop_loss: Option<f64> = std::env::var("STOP_LOSS")
            .ok().and_then(|v| v.parse().ok());

        let take_profit: Option<f64> = std::env::var("TAKE_PROFIT")
            .ok().and_then(|v| v.parse().ok());

        let dca_interval_secs: u64 = std::env::var("DCA_INTERVAL_SECS")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(3600);

        let grid_levels: usize = std::env::var("GRID_LEVELS")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(5);

        let grid_spacing: f64 = std::env::var("GRID_SPACING")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(0.005);

        let max_slippage_bps: u32 = std::env::var("MAX_SLIPPAGE_BPS")
            .ok().and_then(|v| v.parse().ok())
            .unwrap_or(common.max_slippage_bps);

        let poll_interval_ms: u64 = std::env::var("POLL_INTERVAL_MS")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(1000);

        let dry_run = std::env::var("DRY_RUN")
            .map(|v| v == "true" || v == "1").unwrap_or(false);

        let existing_offer_id: i64 = std::env::var("EXISTING_OFFER_ID")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(0);

        Ok(Self {
            common,
            active_strategy,
            trade_asset,
            amount_xlm,
            limit_price,
            trigger: PriceTrigger { stop_loss, take_profit },
            dca_interval_secs,
            grid_levels,
            grid_spacing,
            max_slippage_bps,
            poll_interval_ms,
            dry_run,
            existing_offer_id,
        })
    }
}
