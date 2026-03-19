//! Xylem AgentForge — shared SDK utilities
//!
//! Provides three primary building blocks used by every agent:
//!
//! - [`wallet`]   — Stellar keypair management, Strkey decode/encode, ed25519 signing
//! - [`horizon`]  — Async Horizon REST + SSE client (order-books, accounts, offers, paths …)
//! - [`stellar_tx`] — Transaction envelope builder & fee-bump helpers
//! - [`config`]   — Common environment-variable configuration

pub mod config;
pub mod horizon;
pub mod stellar_tx;
pub mod wallet;

// Re-export the most commonly used types at crate root for ergonomic imports.
pub use config::CommonConfig;
pub use horizon::{Asset, HorizonClient, OrderBook, OrderBookLevel};
pub use stellar_tx::{OperationBody, TransactionBuilder};
pub use wallet::{Keypair, WalletError};
