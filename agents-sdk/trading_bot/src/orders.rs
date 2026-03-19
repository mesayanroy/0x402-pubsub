//! Order placement helpers: ManageBuyOffer / ManageSellOffer.
//!
//! ## Gas optimisation
//! - All offers include a 30-second time-bound to prevent ghost orders
//!   lingering on-chain when market conditions have changed.
//! - The effective fee incorporates real-time surge pricing queried from
//!   `/fee_stats`, ensuring priority inclusion without overpaying.
//! - Existing offers can be updated by setting `existing_offer_id`, which
//!   reuses the on-chain offer slot and saves one operation vs cancel + recreate.

use crate::config::TradingBotConfig;
use anyhow::{bail, Result};
use common::{
    stellar_tx::{price_to_fraction, OperationBody, TransactionBuilder},
    wallet::{xlm_to_stroops, Keypair},
    HorizonClient,
};
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::debug;

/// Place a limit buy order on the SDEX.
///
/// `price` is expressed as XLM per unit of the trade asset
/// (i.e. how many XLM you pay per 1 unit of the asset).
pub async fn place_buy_offer(
    cfg:     &TradingBotConfig,
    horizon: &HorizonClient,
    keypair: &Keypair,
    price:   f64,
) -> Result<String> {
    // Apply slippage tolerance: buy up to (price + slippage) to ensure fill.
    let effective_price = price * (1.0 + cfg.max_slippage_bps as f64 / 10_000.0);
    let buy_amount      = xlm_to_stroops(cfg.amount_xlm / price); // in asset units
    if buy_amount <= 0 { bail!("Buy amount is too small"); }

    let (pn, pd) = price_to_fraction(effective_price);
    submit_offer(cfg, horizon, keypair, true, buy_amount, pn, pd).await
}

/// Place a limit sell order on the SDEX.
///
/// `price` is XLM per unit of the trade asset.
pub async fn place_sell_offer(
    cfg:     &TradingBotConfig,
    horizon: &HorizonClient,
    keypair: &Keypair,
    price:   f64,
) -> Result<String> {
    let effective_price = price * (1.0 - cfg.max_slippage_bps as f64 / 10_000.0);
    let sell_amount     = xlm_to_stroops(cfg.amount_xlm);
    if sell_amount <= 0 { bail!("Sell amount is too small"); }

    let (pn, pd) = price_to_fraction(effective_price);
    submit_offer(cfg, horizon, keypair, false, sell_amount, pn, pd).await
}

/// Cancel an existing offer by setting its amount to 0.
pub async fn cancel_offer(
    cfg:      &TradingBotConfig,
    horizon:  &HorizonClient,
    keypair:  &Keypair,
    offer_id: i64,
    is_buy:   bool,
) -> Result<String> {
    // Amount 0 + same offer_id = cancel
    let (pn, pd) = price_to_fraction(1.0); // arbitrary; ignored when cancelling
    let mut cancel_cfg = cfg.clone();
    cancel_cfg.existing_offer_id = offer_id;
    cancel_cfg.amount_xlm = 0.0;
    submit_offer(&cancel_cfg, horizon, keypair, is_buy, 0, pn, pd).await
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async fn submit_offer(
    cfg:    &TradingBotConfig,
    horizon: &HorizonClient,
    keypair: &Keypair,
    is_buy:  bool,
    amount:  i64,
    price_n: i32,
    price_d: i32,
) -> Result<String> {
    let now       = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
    let max_time  = now + 30; // 30-second expiry

    let live_fee  = horizon.get_base_fee_stroops().await?.max(cfg.common.base_fee_stroops);
    let account   = horizon.get_account(&keypair.public_key).await?;
    let sequence  = account.sequence_number() + 1;

    debug!(
        is_buy, amount, price_n, price_d,
        offer_id = cfg.existing_offer_id,
        "Submitting offer"
    );

    let op = if is_buy {
        OperationBody::ManageBuyOffer {
            selling:    common::Asset::native(),
            buying:     cfg.trade_asset.clone(),
            buy_amount: amount,
            price_n,
            price_d,
            offer_id:   cfg.existing_offer_id,
        }
    } else {
        OperationBody::ManageSellOffer {
            selling:  cfg.trade_asset.clone(),
            buying:   common::Asset::native(),
            amount,
            price_n,
            price_d,
            offer_id: cfg.existing_offer_id,
        }
    };

    let tx_b64 = TransactionBuilder::new(&keypair.public_key, sequence, live_fee)
        .with_timebounds(now, max_time)
        .with_memo("xylem:trade")
        .add_op(op)
        .sign_and_encode(keypair, &cfg.common.network_passphrase)?;

    let result = horizon.submit_transaction(&tx_b64).await?;

    match result.hash {
        Some(h) => Ok(h),
        None    => bail!(
            "Offer rejected: {:?}",
            result.extras.as_ref().and_then(|e| e.get("result_codes"))
        ),
    }
}
