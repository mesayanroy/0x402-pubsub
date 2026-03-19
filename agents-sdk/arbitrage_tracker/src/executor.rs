//! Arbitrage executor — submits the three-hop PathPaymentStrictSend transaction.
//!
//! ## Gas optimisation
//! All three hops are combined into **one** `PathPaymentStrictSend` operation,
//! meaning we pay exactly one base fee instead of three.  The `path` argument
//! threads the route through intermediate assets.

use crate::{config::{ArbConfig, ArbTriangle}, detector::ArbOpportunity};
use anyhow::{bail, Result};
use common::{
    stellar_tx::{OperationBody, TransactionBuilder},
    wallet::{xlm_to_stroops, Keypair},
    HorizonClient,
};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{debug, info};

/// Execute a triangular arbitrage by submitting a single PathPaymentStrictSend.
///
/// The path: `A → B → C → A`
/// - `send_asset`  = A  (we spend XLM)
/// - `dest_asset`  = A  (we receive XLM back)
/// - `path`        = [B, C]  (intermediate hops)
/// - `dest_min`    = send_amount + min_profit  (reject unless profitable)
pub async fn execute_triangle(
    cfg:     &ArbConfig,
    horizon: &HorizonClient,
    keypair: &Keypair,
    opp:     &ArbOpportunity,
    tri:     &ArbTriangle,
) -> Result<String> {
    let send_amount = xlm_to_stroops(opp.trade_size_xlm);
    if send_amount <= 0 { bail!("Trade size too small"); }

    // Minimum acceptable return = send_amount + estimated_profit − 10% buffer
    let min_return_xlm = opp.trade_size_xlm + opp.net_profit * 0.9;
    let dest_min = xlm_to_stroops(min_return_xlm).max(send_amount + 1);

    let now      = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let max_time = now + cfg.tx_expiry_secs;

    let account  = horizon.get_account(&keypair.public_key).await?;
    let fee      = horizon.get_base_fee_stroops().await?.max(cfg.common.base_fee_stroops);

    debug!(
        send_amount,
        dest_min,
        rate_ab = opp.rate_ab,
        rate_bc = opp.rate_bc,
        rate_ca = opp.rate_ca,
        "Submitting triangular arbitrage"
    );

    // Single PathPaymentStrictSend: all three hops in one operation.
    let tx_b64 = TransactionBuilder::new(
            &keypair.public_key,
            account.sequence_number() + 1,
            fee,
        )
        .with_timebounds(now, max_time)
        .with_memo("xylem:arb")
        .add_op(OperationBody::PathPaymentStrictSend {
            send_asset:  tri.asset_a.clone(),
            send_amount,
            destination: keypair.public_key.clone(), // self-payment cycle
            dest_asset:  tri.asset_a.clone(),
            dest_min,
            path: vec![tri.asset_b.clone(), tri.asset_c.clone()],
        })
        .sign_and_encode(keypair, &cfg.common.network_passphrase)?;

    let result = horizon.submit_transaction(&tx_b64).await?;

    match result.hash {
        Some(hash) => {
            info!(tx = %hash, profit = opp.net_profit, "Arbitrage confirmed");
            Ok(hash)
        }
        None => bail!(
            "Arbitrage rejected: {:?}",
            result.extras.as_ref().and_then(|e| e.get("result_codes"))
        ),
    }
}
