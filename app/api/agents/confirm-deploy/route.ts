import { NextRequest, NextResponse } from 'next/server';
import * as StellarSdk from 'stellar-sdk';
import crypto from 'node:crypto';

const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;

/**
 * POST /api/agents/confirm-deploy
 *
 * Final step of the on-chain deployment flow:
 *  1. Submit the signed validate_wallet + request_deploy transaction to Horizon.
 *  2. Build a second transaction for AgentValidator.confirm_deploy (with the
 *     SHA-256 of the signed validation message as the signature_hash).
 *  3. Return the XDR of the confirm_deploy transaction for the client to sign
 *     and submit.
 *
 * After the confirm_deploy transaction lands on-chain, AgentValidator makes an
 * inter-contract call to AgentRegistry.register_agent — completing the
 * fully on-chain deployment flow.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      signed_tx_xdr: string;
      deployer_wallet: string;
      agent_id: string;
      validation_message: string;
    };

    const { signed_tx_xdr, deployer_wallet, agent_id, validation_message } = body;

    if (!signed_tx_xdr || !deployer_wallet || !agent_id || !validation_message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const validatorContractId = process.env.NEXT_PUBLIC_SOROBAN_VALIDATOR_ID;

    // ── Submit the validate + request_deploy transaction ──────────────────────
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);

    if (validatorContractId) {
      try {
        const tx = StellarSdk.TransactionBuilder.fromXDR(signed_tx_xdr, NETWORK_PASSPHRASE);
        await server.submitTransaction(tx as StellarSdk.Transaction);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          { error: 'Failed to submit validation transaction to Horizon', details: detail },
          { status: 400 }
        );
      }
    }

    // ── Compute signature_hash ────────────────────────────────────────────────
    // SHA-256 of the validation message, stored on-chain as proof of consent.
    const sigHashBytes = crypto
      .createHash('sha256')
      .update(validation_message, 'utf8')
      .digest();
    const sigHashHex = sigHashBytes.toString('hex');

    if (!validatorContractId) {
      // Dev mode: skip on-chain confirm_deploy
      return NextResponse.json({
        status: 'confirmed_dev_mode',
        signature_hash: sigHashHex,
        message:
          'NEXT_PUBLIC_SOROBAN_VALIDATOR_ID not set — on-chain confirmation skipped in dev mode.',
      });
    }

    // ── Build confirm_deploy transaction ──────────────────────────────────────
    let account: StellarSdk.Horizon.AccountResponse;
    try {
      account = await server.loadAccount(deployer_wallet);
    } catch {
      return NextResponse.json(
        { error: `Deployer account ${deployer_wallet} not found on Horizon` },
        { status: 400 }
      );
    }

    const agentIdSym = StellarSdk.xdr.ScVal.scvSymbol(Buffer.from(agent_id.slice(0, 32)));
    const deployerSc = new StellarSdk.Address(deployer_wallet).toScVal();

    // BytesN<32> — encode as scvBytes
    const sigHashSc = StellarSdk.xdr.ScVal.scvBytes(sigHashBytes);

    const confirmOp = StellarSdk.Operation.invokeContractFunction({
      contract: validatorContractId,
      function: 'confirm_deploy',
      args: [deployerSc, agentIdSym, sigHashSc],
    });

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(confirmOp)
      .setTimeout(300)
      .build();

    const confirmTxXdr = tx.toXDR();

    return NextResponse.json({
      status: 'pending_confirm_signature',
      confirm_tx_xdr: confirmTxXdr,
      network_passphrase: NETWORK_PASSPHRASE,
      signature_hash: sigHashHex,
      message:
        'Sign the confirm_deploy transaction to register your agent on-chain via inter-contract call.',
    });
  } catch (err) {
    console.error('[confirm-deploy] Error:', err);
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 });
  }
}
