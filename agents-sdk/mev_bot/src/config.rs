//! MEV Bot configuration loaded from environment variables.

use anyhow::{Context, Result};
use common::{config::CommonConfig, Asset};

/// A single trading pair watched by the MEV bot.
#[derive(Debug, Clone)]
pub struct TradingPair {
    pub sell_asset: Asset,
    pub buy_asset:  Asset,
}

/// Full MEV bot configuration.
#[derive(Debug, Clone)]
pub struct MevBotConfig {
    pub common:                   CommonConfig,
    /// Asset pairs to watch (at least one required).
    pub pairs:                    Vec<TradingPair>,
    /// Minimum order-book imbalance ratio to trigger a front-run (e.g. 3.0 = 3×).
    pub imbalance_threshold:      f64,
    /// Minimum expected profit in XLM before executing.
    pub min_profit_xlm:           f64,
    /// Maximum position size per trade in XLM.
    pub max_position_xlm:         f64,
    /// Milliseconds between order-book polls.
    pub poll_interval_ms:         u64,
    /// Number of order-book levels to consider for depth analysis.
    pub depth_levels:             usize,
    /// Seconds to expire a transaction after construction (time-bound).
    pub tx_expiry_secs:           u64,
    /// Extra fee offered above base fee (in stroops) for faster inclusion.
    pub fee_bump_stroops:         u32,
}

impl MevBotConfig {
    pub fn from_env() -> Result<Self> {
        let common = CommonConfig::from_env()?;

        // Parse trading pairs from env: TRADING_PAIRS=XLM:native,USDC:GBBD...
        let pairs_env = std::env::var("TRADING_PAIRS")
            .unwrap_or_else(|_| "native:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5".to_string());

        let pairs = parse_pairs(&pairs_env)
            .context("TRADING_PAIRS format: 'native:USDC:ISSUER;ASSET_CODE:ISSUER:native'")?;

        let imbalance_threshold = std::env::var("IMBALANCE_THRESHOLD")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(3.0_f64);

        let min_profit_xlm = std::env::var("MIN_PROFIT_XLM")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(0.1_f64);

        let max_position_xlm = std::env::var("MAX_POSITION_XLM")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(100.0_f64);

        let poll_interval_ms = std::env::var("POLL_INTERVAL_MS")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(500_u64);

        let depth_levels = std::env::var("DEPTH_LEVELS")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(10_usize);

        let tx_expiry_secs = std::env::var("TX_EXPIRY_SECS")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(30_u64);

        let fee_bump_stroops = std::env::var("FEE_BUMP_STROOPS")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(500_u32);

        Ok(Self {
            common,
            pairs,
            imbalance_threshold,
            min_profit_xlm,
            max_position_xlm,
            poll_interval_ms,
            depth_levels,
            tx_expiry_secs,
            fee_bump_stroops,
        })
    }
}

/// Parse trading pairs from a semicolon-separated string.
///
/// Format per pair: `sell_code:sell_issuer:buy_code:buy_issuer`
/// Use `native` in place of code+issuer for XLM.
///
/// Example: `native:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
fn parse_pairs(raw: &str) -> Result<Vec<TradingPair>> {
    raw.split(';')
       .filter(|s| !s.is_empty())
       .map(|pair_str| {
           let parts: Vec<&str> = pair_str.trim().split(':').collect();
           if parts.len() < 2 {
               anyhow::bail!("Invalid pair: {pair_str}");
           }
           let sell_asset = parse_asset(parts[0], parts.get(1).copied())?;
           let buy_asset  = parse_asset(
               parts.get(2).copied().unwrap_or("native"),
               parts.get(3).copied(),
           )?;
           Ok(TradingPair { sell_asset, buy_asset })
       })
       .collect()
}

fn parse_asset(code: &str, issuer: Option<&str>) -> Result<Asset> {
    if code.eq_ignore_ascii_case("native") || code.eq_ignore_ascii_case("xlm") {
        Ok(Asset::native())
    } else {
        let issuer = issuer.context("Non-native asset requires an issuer address")?;
        Ok(Asset::credit(code, issuer))
    }
}
