//! MEV executor — builds and submits front-run/sandwich transactions.
//!
//! ## Gas optimisation
//! - Both legs of the sandwich (entry + exit) are submitted in a **single
//!   transaction** with two ManageSellOffer operations, halving the per-tx fee.
//! - A strict 30-second time-bound prevents the order from lingering if the
//!   market moves while waiting for ledger confirmation.
//! - The fee is dynamically bumped by `fee_bump_stroops` above the current
//!   base fee so the transaction is prioritised during surge pricing.

use crate::{config::MevBotConfig, strategy::Opportunity};
use anyhow::{bail, Result};
use common::{
    stellar_tx::{price_to_fraction, OperationBody, TransactionBuilder},
    wallet::{xlm_to_stroops, Keypair},
    HorizonClient,
};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, info};

/// Build, sign, and submit the MEV sandwich trade.
///
/// Returns the transaction hash on success.
pub async fn execute(
    cfg:     &MevBotConfig,
    horizon: &HorizonClient,
    keypair: &Keypair,
    opp:     &Opportunity,
    pair_idx: usize,
) -> Result<String> {
    let pair = &cfg.pairs[pair_idx];

    // ── Compute sizes ─────────────────────────────────────────────────────────
    let size_stroops = xlm_to_stroops(opp.opportunity_size);
    if size_stroops <= 0 { bail!("Opportunity size too small"); }

    // Entry: buy the undervalued side.
    // Exit:  place a sell offer at detected_price + spread/2 (GTC).
    let entry_price = opp.detected_price;
    let exit_price  = entry_price * (1.0 + (cfg.common.max_slippage_bps as f64 / 20_000.0));

    let (ep_n, ep_d) = price_to_fraction(entry_price);
    let (xp_n, xp_d) = price_to_fraction(exit_price);

    // ── Timing ───────────────────────────────────────────────────────────────
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_secs();
    let max_time = now + cfg.tx_expiry_secs;

    // ── Effective fee: base + bump ────────────────────────────────────────────
    let effective_fee = cfg.common.base_fee_stroops + cfg.fee_bump_stroops;

    // ── Fetch fresh sequence number ───────────────────────────────────────────
    let account = horizon.get_account(&keypair.public_key).await?;
    let sequence = account.sequence_number() + 1;

    debug!(
        sequence,
        size_stroops,
        entry_price,
        exit_price,
        "Building MEV transaction"
    );

    // ── Build transaction: entry offer + exit offer in one envelope ───────────
    let tx_b64 = TransactionBuilder::new(&keypair.public_key, sequence, effective_fee)
        .with_timebounds(now, max_time)
        .with_memo("xylem:mev")
        // Entry leg: buy `pair.buy_asset` using `pair.sell_asset`
        .add_op(OperationBody::ManageBuyOffer {
            selling:    pair.sell_asset.clone(),
            buying:     pair.buy_asset.clone(),
            buy_amount: size_stroops,
            price_n:    ep_n,
            price_d:    ep_d,
            offer_id:   0, // new offer
        })
        // Exit leg: immediately post a matching sell offer at a higher price
        .add_op(OperationBody::ManageSellOffer {
            selling:  pair.buy_asset.clone(),
            buying:   pair.sell_asset.clone(),
            amount:   size_stroops,
            price_n:  xp_n,
            price_d:  xp_d,
            offer_id: 0,
        })
        .sign_and_encode(keypair, &cfg.common.network_passphrase)?;

    let result = horizon.submit_transaction(&tx_b64).await?;

    match result.hash {
        Some(hash) => {
            info!(tx = %hash, "MEV transaction confirmed");
            Ok(hash)
        }
        None => {
            bail!(
                "Transaction rejected: {:?}",
                result.extras.as_ref().and_then(|e| e.get("result_codes"))
            )
        }
    }
}
