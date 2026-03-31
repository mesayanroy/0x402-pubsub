//! QStash pub-sub client for agent event publishing.
//!
//! Agents publish structured events to the AgentForge QStash backbone so that:
//! - The platform dashboard can display real-time activity
//! - Other agents can subscribe and react (A2A coordination)
//! - Billing and analytics consumers can process earnings
//!
//! This implementation talks to Upstash QStash via HTTP push, which requires
//! no native broker socket and works in constrained regions.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tracing::{debug, warn};

// ── Topic constants ───────────────────────────────────────────────────────────
//
// Keep in sync with `lib/qstash.ts` in the Next.js platform.

pub const TOPIC_PAYMENT_PENDING:    &str = "agentforge.payment.pending";
pub const TOPIC_PAYMENT_CONFIRMED:  &str = "agentforge.payment.confirmed";
pub const TOPIC_AGENT_COMPLETED:    &str = "agentforge.agent.completed";
pub const TOPIC_BILLING_UPDATED:    &str = "agentforge.billing.updated";
pub const TOPIC_MARKETPLACE_ACTIVITY: &str = "agentforge.marketplace.activity";
pub const TOPIC_CHAIN_SYNCED:       &str = "agentforge.chain.synced";
pub const TOPIC_A2A_REQUEST:        &str = "agentforge.a2a.request";
pub const TOPIC_A2A_RESPONSE:       &str = "agentforge.a2a.response";

// ── Event payload types ───────────────────────────────────────────────────────

/// Published by every agent whenever it executes a trade / action.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentActionEvent {
    pub agent_type:    String,  // "mev_bot" | "arbitrage_tracker" | etc.
    pub agent_wallet:  String,
    pub action:        String,
    pub asset_pair:    Option<String>,
    pub tx_hash:       Option<String>,
    pub profit_xlm:    Option<f64>,
    pub latency_ms:    Option<u64>,
    pub created_at:    String,
}

/// Published when a payment was received for a service call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentReceivedEvent {
    pub payer_wallet:    String,
    pub receiver_wallet: String,
    pub amount_xlm:      f64,
    pub tx_hash:         String,
    pub memo:            String,
    pub service:         String,
    pub created_at:      String,
}

/// Published on chain events (new offer, trade fill, contract call).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChainEvent {
    pub event_type:  String,
    pub tx_hash:     String,
    pub ledger:      u64,
    pub account:     String,
    pub details:     serde_json::Value,
    pub created_at:  String,
}

// ── Client ────────────────────────────────────────────────────────────────────

/// Upstash QStash REST producer client.
///
/// Instantiate once and pass a shared reference to all agent modules.
/// All methods are cheap-to-clone thanks to the inner `Arc<Client>`.
#[derive(Clone)]
pub struct QStashPublisher {
    http:          Client,
    qstash_url:    String,
    qstash_token:  String,
    platform_url:  String,
    enabled:       bool,
}

impl QStashPublisher {
    /// Create from environment variables.
    ///
    /// If QStash variables are not set, the publisher is created in
    /// **disabled** mode — `publish` calls become silent no-ops.
    pub fn from_env() -> Self {
        let qstash_url = std::env::var("QSTASH_URL")
            .unwrap_or_else(|_| "https://qstash.upstash.io".to_string());
        let qstash_token = std::env::var("QSTASH_TOKEN").unwrap_or_default();
        let platform_url = std::env::var("PLATFORM_API_URL")
            .unwrap_or_else(|_| "http://localhost:3000".to_string())
            .trim_end_matches('/')
            .to_string();

        let enabled = !qstash_token.is_empty();

        if !enabled {
            warn!("QStash not configured (QSTASH_TOKEN missing) — pub-sub disabled");
        }

        let http = Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("QStash HTTP client init failed");

        Self {
            http,
            qstash_url,
            qstash_token,
            platform_url,
            enabled,
        }
    }

    fn topic_to_slug(topic: &str) -> String {
        topic.replace('.', "-")
    }

    /// Publish a JSON-serialisable payload to a topic.
    ///
    /// Fire-and-forget: errors are logged as warnings but do **not** propagate
    /// to the caller — a publish failure must never abort a trade.
    pub async fn publish<T: Serialize>(&self, topic: &str, payload: &T) {
        if !self.enabled { return; }

        let slug = Self::topic_to_slug(topic);
        let destination = format!("{}/api/consumers/{}", self.platform_url, slug);
        let qstash_url = format!(
            "{}/v2/publish/{}",
            self.qstash_url.trim_end_matches('/'),
            destination
        );

        match self
            .http
            .post(&qstash_url)
            .bearer_auth(&self.qstash_token)
            .json(payload)
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                debug!("Published to QStash topic {topic}");
            }
            Ok(resp) => {
                warn!("QStash publish non-success {} for topic {topic}", resp.status());
            }
            Err(e) => {
                warn!("QStash publish error for topic {topic}: {e}");
            }
        }
    }

    /// Convenience: publish an [`AgentActionEvent`].
    pub async fn publish_action(&self, evt: &AgentActionEvent) {
        self.publish(TOPIC_AGENT_COMPLETED, evt).await;
        self.publish(TOPIC_MARKETPLACE_ACTIVITY, evt).await;
    }

    /// Convenience: publish a [`PaymentReceivedEvent`].
    pub async fn publish_payment(&self, evt: &PaymentReceivedEvent) {
        self.publish(TOPIC_PAYMENT_CONFIRMED, evt).await;
        self.publish(TOPIC_BILLING_UPDATED, evt).await;
    }

    /// Convenience: publish a [`ChainEvent`].
    pub async fn publish_chain_event(&self, evt: &ChainEvent) {
        self.publish(TOPIC_CHAIN_SYNCED, evt).await;
    }
}

/// Backward-compat alias for older modules that still import `KafkaPublisher`.
pub type KafkaPublisher = QStashPublisher;

// ── Timestamp helper ──────────────────────────────────────────────────────────

/// Returns the current UTC time in ISO-8601 format.
pub fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}
