import { NextRequest, NextResponse } from 'next/server';
import * as StellarSdk from 'stellar-sdk';

const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
    ? StellarSdk.Networks.PUBLIC
    : StellarSdk.Networks.TESTNET;

/**
 * POST /api/agents/validate-deploy
 *
 * Step in the on-chain deployment flow:
 *  1. Build a Stellar transaction that calls AgentValidator.validate_wallet
 *     and AgentValidator.request_deploy via Soroban.
 *  2. Return the XDR of the unsigned transaction to the client.
 *  3. The client signs with their wallet and submits to Horizon.
 *
 * This is the real-time, non-mock version: it builds a live Soroban transaction
 * that calls the on-chain AgentValidator contract.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      deployer_wallet: string;
      agent_id: string;
      metadata_hash: string;
      price_xlm: number;
    };

    const { deployer_wallet, agent_id, metadata_hash, price_xlm } = body;

    if (!deployer_wallet || !agent_id || !metadata_hash || price_xlm === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const validatorContractId = process.env.NEXT_PUBLIC_SOROBAN_VALIDATOR_ID;
    if (!validatorContractId) {
      // Validator not configured — skip on-chain validation (dev mode)
      return NextResponse.json({
        status: 'skipped',
        message: 'NEXT_PUBLIC_SOROBAN_VALIDATOR_ID not set — on-chain validation skipped in dev mode.',
        validation_message: buildValidationMessage(deployer_wallet, agent_id, metadata_hash),
      });
    }

    // Load deployer account from Horizon for sequence number
    const server = new StellarSdk.Horizon.Server(HORIZON_URL);
    let account: StellarSdk.Horizon.AccountResponse;
    try {
      account = await server.loadAccount(deployer_wallet);
    } catch {
      return NextResponse.json(
        { error: `Deployer account ${deployer_wallet} not found on Horizon. Fund it via Friendbot first.` },
        { status: 400 }
      );
    }

    // Build the Soroban transaction for validate_wallet + request_deploy
    const priceStroops = Math.floor(price_xlm * 10_000_000);

    // Encode Soroban arguments
    const agentIdSym = StellarSdk.xdr.ScVal.scvSymbol(Buffer.from(agent_id.slice(0, 32)));
    const metaSym = StellarSdk.xdr.ScVal.scvSymbol(Buffer.from(metadata_hash.slice(0, 32)));
    const priceSc = StellarSdk.xdr.ScVal.scvI128(
      new StellarSdk.xdr.Int128Parts({
        hi: StellarSdk.xdr.Int64.fromString('0'),
        lo: StellarSdk.xdr.Uint64.fromString(String(priceStroops)),
      })
    );
    const deployerSc = new StellarSdk.Address(deployer_wallet).toScVal();

    // validate_wallet call
    const validateOp = StellarSdk.Operation.invokeContractFunction({
      contract: validatorContractId,
      function: 'validate_wallet',
      args: [deployerSc, agentIdSym],
    });

    // request_deploy call
    const requestOp = StellarSdk.Operation.invokeContractFunction({
      contract: validatorContractId,
      function: 'request_deploy',
      args: [deployerSc, agentIdSym, metaSym, priceSc],
    });

    const txBuilder = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(validateOp)
      .addOperation(requestOp)
      .setTimeout(300);

    const tx = txBuilder.build();
    const txXdr = tx.toXDR();

    const validationMessage = buildValidationMessage(deployer_wallet, agent_id, metadata_hash);

    return NextResponse.json({
      status: 'pending_signature',
      tx_xdr: txXdr,
      network_passphrase: NETWORK_PASSPHRASE,
      validation_message: validationMessage,
      message:
        'Sign this transaction in your wallet to validate and request on-chain agent deployment.',
    });
  } catch (err) {
    console.error('[validate-deploy] Error:', err);
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 });
  }
}

/**
 * Build the human-readable validation message that the user signs in their wallet.
 * This message is also hashed and stored on-chain in confirm_deploy.
 */
function buildValidationMessage(
  deployer: string,
  agentId: string,
  metadataHash: string
): string {
  return [
    'AgentForge Deployment Authorisation',
    '------------------------------------',
    `Deployer: ${deployer}`,
    `Agent ID: ${agentId}`,
    `Metadata Hash: ${metadataHash}`,
    `Timestamp: ${new Date().toISOString()}`,
    '',
    'By signing this message you confirm that you are the owner of the above',
    'Stellar account and you authorise the deployment of the specified AI agent',
    'on the AgentForge platform. No funds will be transferred by this signature.',
  ].join('\n');
}
