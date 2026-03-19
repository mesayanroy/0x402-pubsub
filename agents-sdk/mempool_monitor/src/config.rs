//! Mempool Monitor configuration.

use anyhow::Result;
use common::config::CommonConfig;

/// A single alert rule applied to every observed transaction.
#[derive(Debug, Clone)]
pub enum AlertRule {
    /// Alert when transaction fee (stroops) exceeds threshold.
    HighFee { threshold_stroops: u64 },
    /// Alert when a payment to/from a watched address is seen.
    WatchedAddress { address: String },
    /// Alert when operation count in a single tx exceeds threshold.
    HighOperationCount { threshold: u32 },
    /// Alert on any offer operation (ManageSellOffer / ManageBuyOffer).
    OfferActivity,
    /// Alert on any PathPayment (possible arbitrage).
    PathPayment,
    /// Alert when the fee per operation exceeds a multiple of the base fee.
    FeeSurge { multiple: f64 },
}

#[derive(Debug, Clone)]
pub struct MonitorConfig {
    pub common:        CommonConfig,
    pub alert_rules:   Vec<AlertRule>,
    /// SSE cursor to start from (`"now"` for live-only, a paging token for replay).
    pub stream_cursor: String,
    /// Webhook URL to POST alert payloads to (optional).
    pub webhook_url:   Option<String>,
    /// If true, print a one-line summary for every transaction (not just alerts).
    pub verbose:       bool,
}

impl MonitorConfig {
    pub fn from_env() -> Result<Self> {
        let common = CommonConfig::from_env()?;
        let stream_cursor = std::env::var("STREAM_CURSOR").unwrap_or_else(|_| "now".to_string());
        let webhook_url = std::env::var("ALERT_WEBHOOK_URL").ok();
        let verbose = std::env::var("VERBOSE").map(|v| v == "true" || v == "1").unwrap_or(false);

        let mut alert_rules = Vec::new();

        // High-fee rule
        if let Ok(t) = std::env::var("ALERT_HIGH_FEE_STROOPS") {
            if let Ok(threshold) = t.parse::<u64>() {
                alert_rules.push(AlertRule::HighFee { threshold_stroops: threshold });
            }
        }

        // Watched addresses (semicolon-separated)
        if let Ok(addrs) = std::env::var("WATCH_ADDRESSES") {
            for addr in addrs.split(';').filter(|s| !s.is_empty()) {
                alert_rules.push(AlertRule::WatchedAddress { address: addr.trim().to_string() });
            }
        }

        // High operation count
        if let Ok(t) = std::env::var("ALERT_HIGH_OP_COUNT") {
            if let Ok(threshold) = t.parse::<u32>() {
                alert_rules.push(AlertRule::HighOperationCount { threshold });
            }
        }

        // Offer activity toggle
        if std::env::var("ALERT_OFFER_ACTIVITY").map(|v| v == "true" || v == "1").unwrap_or(false) {
            alert_rules.push(AlertRule::OfferActivity);
        }

        // Path payment toggle
        if std::env::var("ALERT_PATH_PAYMENT").map(|v| v == "true" || v == "1").unwrap_or(false) {
            alert_rules.push(AlertRule::PathPayment);
        }

        // Fee surge multiple
        if let Ok(m) = std::env::var("ALERT_FEE_SURGE_MULTIPLE") {
            if let Ok(multiple) = m.parse::<f64>() {
                alert_rules.push(AlertRule::FeeSurge { multiple });
            }
        }

        // Always have at least a basic high-fee default rule
        if alert_rules.is_empty() {
            alert_rules.push(AlertRule::HighFee { threshold_stroops: 10_000 });
        }

        Ok(Self { common, alert_rules, stream_cursor, webhook_url, verbose })
    }
}
