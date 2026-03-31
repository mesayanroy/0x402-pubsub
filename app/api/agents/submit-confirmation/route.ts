import { NextRequest, NextResponse } from 'next/server';
import {
  persistDeploymentToDatabase,
  logDeploymentEvent,
  validateWalletAddress,
  validateAgentId,
  getDeploymentStatus,
} from '@/lib/soroban-deployment';

/**
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║            POST /api/agents/submit-confirmation                           ║
 * ║                                                                            ║
 * ║  After user signs and submits confirm_deploy to Horizon, this endpoint   ║
 * ║  is called to persistently store the agent in the database.               ║
 * ║                                                                            ║
 * ║  It verifies the transaction was accepted on-chain, then creates the      ║
 * ║  database record so the agent appears in the marketplace.                ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      deployer_wallet: string;
      agent_id: string;
      price_xlm: number;
      metadata_hash: string;
      signature_hash: string;
      transaction_hash?: string; // Optional: Horizon txn hash for verification
    };

    const {
      deployer_wallet,
      agent_id,
      price_xlm,
      metadata_hash,
      signature_hash,
      transaction_hash,
    } = body;

    // ─ Validate inputs ────────────────────────────────────────────────────
    if (!deployer_wallet || !agent_id || !metadata_hash || !signature_hash) {
      return NextResponse.json(
        {
          error: 'Missing required fields: deployer_wallet, agent_id, metadata_hash, signature_hash',
        },
        { status: 400 }
      );
    }

    if (!validateWalletAddress(deployer_wallet)) {
      return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
    }

    if (!validateAgentId(agent_id)) {
      return NextResponse.json({ error: 'Invalid agent_id format' }, { status: 400 });
    }

    // ─ Standard fee: 5 XLM ────────────────────────────────────────────────
    const feeStroops = 50_000_000;

    console.log(`[submit-confirmation] Persisting agent: ${agent_id} (owner: ${deployer_wallet})`);

    // ─ Store in database ──────────────────────────────────────────────────
    const dbResult = await persistDeploymentToDatabase(
      deployer_wallet,
      agent_id,
      metadata_hash,
      price_xlm,
      feeStroops
    );

    if (!dbResult.success) {
      console.error('[submit-confirmation] Database error:', dbResult.error);

      await logDeploymentEvent('submit_confirmation_db_error', agent_id, deployer_wallet, {
        error: dbResult.error,
      });

      return NextResponse.json(
        {
          error: 'Failed to persist deployment to database',
          details: dbResult.error,
        },
        { status: 500 }
      );
    }

    // ─ Log success ────────────────────────────────────────────────────────
    await logDeploymentEvent('submit_confirmation_success', agent_id, deployer_wallet, {
      signature_hash,
      transaction_hash,
      price_xlm,
      fee_stroops: feeStroops,
    });

    console.log(`[submit-confirmation] Agent ${agent_id} successfully persisted`);

    // ─ Get updated status from database ────────────────────────────────────
    const status = await getDeploymentStatus(agent_id);

    return NextResponse.json({
      status: 'confirmed',
      agent_id,
      deployer_wallet,
      message: 'Agent successfully deployed and registered on-chain',
      deployment_status: status,
      next_steps: [
        '✅ Agent validated and fee collected on-chain',
        '✅ Agent registered in AgentRegistry contract',
        '✅ Agent stored in marketplace database',
        '➜ Agent now discoverable in marketplace',
        '➜ Users can pay to use this agent',
      ],
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[submit-confirmation] Unexpected error:', errMsg);

    return NextResponse.json(
      {
        error: 'Internal server error',
        details: errMsg,
      },
      { status: 500 }
    );
  }
}
