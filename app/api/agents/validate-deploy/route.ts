import { NextRequest, NextResponse } from 'next/server';
import {
  buildValidationTransaction,
  logDeploymentEvent,
  validateWalletAddress,
  validateAgentId,
} from '@/lib/soroban-deployment';

const VALIDATOR_CONTRACT_ID = process.env.NEXT_PUBLIC_SOROBAN_VALIDATOR_ID || '';

/**
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║            POST /api/agents/validate-deploy                               ║
 * ║                                                                            ║
 * ║  STEP 1 of secure agent deployment:                                       ║
 * ║    - Authenticate wallet (Freighter signature)                            ║
 * ║    - Check for duplicate agent_id in AgentRegistry                        ║
 * ║    - Return unsigned transaction for user to sign                         ║
 * ║                                                                            ║
 * ║  This endpoint builds a Soroban transaction that calls:                   ║
 * ║    1. AgentValidator.validate_wallet() — verify deployer auth             ║
 * ║    2. AgentValidator.request_deploy()  — record pending deployment        ║
 * ║                                                                            ║
 * ║  The transaction is returned as XDR for the user's Freighter wallet      ║
 * ║  to sign, proving on-chain intent.                                        ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
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

    // ─ Input validation ───────────────────────────────────────────────────
    if (!deployer_wallet || !agent_id || !metadata_hash || price_xlm === undefined) {
      return NextResponse.json(
        {
          error: 'Missing required fields: deployer_wallet, agent_id, metadata_hash, price_xlm',
        },
        { status: 400 }
      );
    }

    if (!validateWalletAddress(deployer_wallet)) {
      return NextResponse.json({ error: 'Invalid Stellar wallet address' }, { status: 400 });
    }

    if (!validateAgentId(agent_id)) {
      return NextResponse.json(
        { error: 'Invalid agent_id (must be alphanumeric + underscore, max 32 chars)' },
        { status: 400 }
      );
    }

    if (price_xlm < 0 || !Number.isFinite(price_xlm)) {
      return NextResponse.json({ error: 'Price must be a non-negative number' }, { status: 400 });
    }

    // ─ Log deployment request ─────────────────────────────────────────────
    await logDeploymentEvent('validate_deploy_requested', agent_id, deployer_wallet, {
      price_xlm,
      metadata_hash,
    });

    // ─ Dev mode: skip on-chain validation ────────────────────────────────
    if (!VALIDATOR_CONTRACT_ID) {
      console.warn(
        '[validate-deploy] NEXT_PUBLIC_SOROBAN_VALIDATOR_ID not set — running in dev mode'
      );

      await logDeploymentEvent('validate_deploy_dev_mode', agent_id, deployer_wallet, {
        message: 'On-chain validation skipped in dev mode',
      });

      const confirmationMessage = `
Confirm Agent Deployment
========================

Agent ID: ${agent_id}
Owner Wallet: ${deployer_wallet}
Price: ${price_xlm} XLM per request
Metadata Hash: ${metadata_hash}

Validation Fee: 5 XLM
Network: Stellar Testnet

By signing, you authorize:
1. Agent registration on AgentValidator
2. Fee collection (5 XLM) for validation
3. Permanent agent entry in AgentRegistry
4. Public marketplace listing
      `.trim();

      return NextResponse.json({
        status: 'dev_mode',
        message: 'Dev mode: On-chain validation skipped',
        confirmation_message: confirmationMessage,
        validation_fee_xlm: 5,
        network: 'testnet',
      });
    }

    // ─ Build Soroban transaction for on-chain validation ─────────────────
    console.log(`[validate-deploy] Building validation TX for agent: ${agent_id}`);

    // Convert XLM to stroops (1 XLM = 10,000,000 stroops)
    const priceStroops = Math.floor(price_xlm * 10_000_000);

    try {
      const { xdr, validationFee, networkPassphrase } = await buildValidationTransaction(
        deployer_wallet,
        agent_id,
        metadata_hash,
        priceStroops
      );

      // Prepare confirmation message for user
      const confirmationMessage = `
Confirm Agent Deployment on Stellar Soroban
=============================================

Agent ID:        ${agent_id}
Owner Wallet:    ${deployer_wallet}
Price per Request: ${price_xlm} XLM
Metadata Hash:   ${metadata_hash}

Validation Fee:  5 XLM (0.00000000 in stroops)
Total Cost:      5 XLM upfront

Network:         Stellar Testnet
Smart Contracts:
  - AgentValidator: ${VALIDATOR_CONTRACT_ID}

By signing this transaction, you authorize:
  ✓ Verification of your Stellar wallet ownership
  ✓ Duplicate agent ID check in AgentRegistry
  ✓ Reservation of this agent_id on-chain
  ✓ Fee commitment (5 XLM non-refundable)
  ✓ Progression to agent registration step

This is Step 1 of 2. After signing, you will
confirm final deployment with your signature.
      `.trim();

      await logDeploymentEvent('validate_deploy_tx_built', agent_id, deployer_wallet, {
        tx_xdr_preview: xdr.substring(0, 100) + '...',
      });

      return NextResponse.json({
        status: 'pending_validation_signature',
        validation_tx_xdr: xdr,
        network_passphrase: networkPassphrase,
        validation_fee_xlm: validationFee / 10_000_000, // Convert back to XLM for display
        validation_fee_stroops: validationFee,
        agent_id,
        deployer_wallet,
        confirmation_message: confirmationMessage,
        instructions: [
          'Step 1 of 3: Sign this validation transaction in your Freighter wallet',
          'Step 2: After signing, submit it to /api/agents/confirm-deploy',
          'Step 3: Sign and submit the final confirmation transaction',
          'Result: Agent deployed on-chain and registered in marketplace',
        ],
        next_step: 'Sign the validation_tx_xdr in Freighter, then POST the signed XDR to /api/agents/confirm-deploy',
      });
    } catch (txErr) {
      const errMsg = txErr instanceof Error ? txErr.message : String(txErr);
      console.error('[validate-deploy] Transaction building error:', errMsg);

      await logDeploymentEvent('validate_deploy_error', agent_id, deployer_wallet, {
        error: errMsg,
        phase: 'transaction_building',
      });

      return NextResponse.json(
        {
          error: 'Failed to build validation transaction',
          details: errMsg,
          hint: 'Ensure NEXT_PUBLIC_SOROBAN_VALIDATOR_ID is set and deployer wallet is funded',
        },
        { status: 500 }
      );
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[validate-deploy] Unexpected error:', errMsg);

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: errMsg,
      },
      { status: 500 }
    );
  }
}
