//! Arbitrage bot configuration.

use anyhow::{Context, Result};
use common::{config::CommonConfig, Asset};

/// Three assets forming a triangular arbitrage cycle: A → B → C → A.
#[derive(Debug, Clone)]
pub struct ArbTriangle {
    pub asset_a: Asset,
    pub asset_b: Asset,
    pub asset_c: Asset,
}

#[derive(Debug, Clone)]
pub struct ArbConfig {
    pub common:              CommonConfig,
    /// Triangular cycles to evaluate.
    pub triangles:           Vec<ArbTriangle>,
    /// Minimum profit ratio above 1.0 to execute (e.g. 0.003 = 0.3% profit).
    pub min_profit_ratio:    f64,
    /// Maximum trade size in XLM per cycle.
    pub max_trade_xlm:       f64,
    /// Milliseconds between scan cycles.
    pub scan_interval_ms:    u64,
    /// Whether to execute trades (false = log only, useful for monitoring).
    pub dry_run:             bool,
    /// Transaction time-bound in seconds.
    pub tx_expiry_secs:      u64,
}

impl ArbConfig {
    pub fn from_env() -> Result<Self> {
        let common = CommonConfig::from_env()?;

        // Default triangle: XLM → USDC → yXLM → XLM
        let triangles = parse_triangles(
            &std::env::var("ARB_TRIANGLES").unwrap_or_else(|_| {
                "native:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5:\
                 yXLM:GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55"
                    .to_string()
            }),
        )
        .context("ARB_TRIANGLES parse error")?;

        let min_profit_ratio = std::env::var("MIN_PROFIT_RATIO")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(0.003_f64);

        let max_trade_xlm = std::env::var("MAX_TRADE_XLM")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(500.0_f64);

        let scan_interval_ms = std::env::var("SCAN_INTERVAL_MS")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(300_u64);

        let dry_run = std::env::var("DRY_RUN")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        let tx_expiry_secs = std::env::var("TX_EXPIRY_SECS")
            .ok().and_then(|v| v.parse().ok()).unwrap_or(30_u64);

        Ok(Self {
            common,
            triangles,
            min_profit_ratio,
            max_trade_xlm,
            scan_interval_ms,
            dry_run,
            tx_expiry_secs,
        })
    }
}

/// Parse triangles from the format:
/// `codeA:issuerA:codeB:issuerB:codeC:issuerC`
/// Use `native` in place of code+issuer for XLM.
fn parse_triangles(raw: &str) -> Result<Vec<ArbTriangle>> {
    raw.split(';')
       .filter(|s| !s.is_empty())
       .map(|t| {
           let parts: Vec<&str> = t.trim().split(':').collect();
           // Minimum: native:codeB:issuerB:codeC:issuerC  (5 parts)
           if parts.len() < 3 {
               anyhow::bail!("Invalid triangle: {t}");
           }
           let (a, rest) = consume_asset(&parts, 0)?;
           let (b, rest) = consume_asset(rest, 0)?;
           let (c, _)    = consume_asset(rest, 0)?;
           Ok(ArbTriangle { asset_a: a, asset_b: b, asset_c: c })
       })
       .collect()
}

fn consume_asset<'a>(parts: &'a [&'a str], _offset: usize) -> Result<(Asset, &'a [&'a str])> {
    if parts.is_empty() { anyhow::bail!("Missing asset parts"); }
    if parts[0].eq_ignore_ascii_case("native") || parts[0].eq_ignore_ascii_case("xlm") {
        Ok((Asset::native(), &parts[1..]))
    } else if parts.len() >= 2 {
        Ok((Asset::credit(parts[0], parts[1]), &parts[2..]))
    } else {
        anyhow::bail!("Non-native asset needs issuer; got: {}", parts[0])
    }
}
