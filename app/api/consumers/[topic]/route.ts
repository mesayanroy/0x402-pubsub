/**
 * app/api/consumers/[topic]/route.ts
 *
 * Single QStash webhook endpoint that receives messages for all topics.
 *
 * QStash delivers HTTP POST requests here with the topic encoded in the
 * URL path and the JSON payload as the request body.
 *
 * Signature verification is done against QSTASH_CURRENT_SIGNING_KEY and
 * QSTASH_NEXT_SIGNING_KEY to prevent spoofed requests.
 *
 * Topic-to-handler mapping:
 *   agentforge-payment-pending    → payment verifier
 *   agentforge-payment-confirmed  → agent executor
 *   agentforge-agent-completed    → billing aggregator + marketplace feed
 *   agentforge-billing-updated    → marketplace feed
 *   agentforge-chain-synced       → chain syncer handler
 *   agentforge-a2a-request        → a2a router
 */

import { NextRequest, NextResponse } from 'next/server';
import { createQStashReceiver, publish, TOPICS } from '@/lib/qstash';
import type {
  PaymentPendingEvent,
  PaymentConfirmedEvent,
  AgentCompletedEvent,
  BillingUpdatedEvent,
  ChainSyncedEvent,
  A2ARequestEvent,
  A2AResponseEvent,
  MarketplaceActivityEvent,
} from '@/types/events';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function getSupabase() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js');
  return createClient(supabaseUrl, supabaseServiceKey);
}

// ─── Payment verifier ─────────────────────────────────────────────────────────

async function handlePaymentPending(event: PaymentPendingEvent): Promise<void> {
  const { requestId, agentId, txHash, callerWallet, ownerWallet, priceXlm, input, memo } = event;
  console.log(`[PaymentVerifier] Verifying tx ${txHash} for request ${requestId}`);

  try {
    const { waitForTransaction } = await import('@/lib/stellar');
    const tx = await waitForTransaction(txHash, 120_000);

    const memoPrefix = memo.includes(':') ? memo.split(':').slice(0, 2).join(':') : memo;
    if (memo && tx.memo && !tx.memo.startsWith(memoPrefix)) {
      console.warn(`[PaymentVerifier] Memo mismatch for ${requestId}`);
      return;
    }

    const confirmed: PaymentConfirmedEvent = {
      requestId,
      agentId,
      txHash,
      callerWallet,
      ownerWallet,
      priceXlm,
      input,
      confirmedAt: new Date().toISOString(),
    };

    await publish(TOPICS.PAYMENT_CONFIRMED, confirmed);
    console.log(`[PaymentVerifier] Confirmed tx for request ${requestId}`);
  } catch (err) {
    console.error(`[PaymentVerifier] Failed to verify tx ${txHash}:`, err);
  }
}

// ─── Agent executor ───────────────────────────────────────────────────────────

async function handlePaymentConfirmed(event: PaymentConfirmedEvent): Promise<void> {
  const { requestId, agentId, txHash, callerWallet, ownerWallet, priceXlm, input, confirmedAt } =
    event;
  console.log(`[AgentExecutor] Executing agent ${agentId} for request ${requestId}`);

  const sb = getSupabase();
  const { data: agent, error } = await sb.from('agents').select('*').eq('id', agentId).single();
  if (error || !agent) {
    console.error(`[AgentExecutor] Cannot fetch agent ${agentId}:`, error);
    return;
  }

  const startTime = Date.now();
  let output = '';

  try {
    if (agent.model === 'openai-gpt4o-mini') {
      const { runOpenAIAgent } = await import('@/lib/openai');
      output = await runOpenAIAgent(agent.system_prompt, input);
    } else if (agent.model === 'anthropic-claude-haiku') {
      const { runAnthropicAgent } = await import('@/lib/anthropic');
      output = await runAnthropicAgent(agent.system_prompt, input);
    }
  } catch (err) {
    console.error(`[AgentExecutor] Model error for request ${requestId}:`, err);
    return;
  }

  const latencyMs = Date.now() - startTime;

  await sb.from('agent_requests').upsert({
    id: requestId,
    agent_id: agentId,
    caller_wallet: callerWallet || null,
    input_payload: { input },
    output_response: { output },
    payment_tx_hash: txHash,
    payment_amount_xlm: priceXlm,
    tx_explorer_url: `https://stellar.expert/explorer/testnet/tx/${txHash}`,
    protocol: '0x402',
    status: 'success',
    latency_ms: latencyMs,
    created_at: confirmedAt,
  });

  const completed: AgentCompletedEvent = {
    requestId,
    agentId,
    model: agent.model,
    callerWallet,
    ownerWallet,
    priceXlm,
    input,
    output,
    latencyMs,
    txHash,
    completedAt: new Date().toISOString(),
  };

  await publish(TOPICS.AGENT_COMPLETED, completed);
  console.log(`[AgentExecutor] Completed request ${requestId} (${latencyMs}ms)`);
}

// ─── Billing aggregator ───────────────────────────────────────────────────────

async function handleAgentCompleted(event: AgentCompletedEvent): Promise<void> {
  const { agentId, ownerWallet, priceXlm } = event;
  console.log(`[BillingAggregator] Updating earnings for agent ${agentId}`);

  const sb = getSupabase();
  const { data: agent, error } = await sb
    .from('agents')
    .select('total_requests, total_earned_xlm')
    .eq('id', agentId)
    .single();

  if (error || !agent) {
    console.error(`[BillingAggregator] Cannot fetch agent ${agentId}:`, error);
    return;
  }

  const newRequests = (agent.total_requests ?? 0) + 1;
  const newEarned = (agent.total_earned_xlm ?? 0) + priceXlm;

  await sb
    .from('agents')
    .update({
      total_requests: newRequests,
      total_earned_xlm: newEarned,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agentId);

  const billing: BillingUpdatedEvent = {
    agentId,
    ownerWallet,
    earnedXlm: priceXlm,
    totalEarnedXlm: newEarned,
    totalRequests: newRequests,
    updatedAt: new Date().toISOString(),
  };

  await publish(TOPICS.BILLING_UPDATED, billing);

  // Push agent_run activity to Ably + marketplace topic
  const activity: MarketplaceActivityEvent = {
    eventType: 'agent_run',
    agentId,
    agentName: agentId,
    ownerWallet,
    priceXlm,
    timestamp: new Date().toISOString(),
  };
  await pushToAbly(activity);
  await publish(TOPICS.MARKETPLACE_ACTIVITY, activity);
}

// ─── Marketplace feed ─────────────────────────────────────────────────────────

async function pushToAbly(activity: MarketplaceActivityEvent): Promise<void> {
  const key = process.env.ABLY_API_KEY;
  if (!key) return;
  try {
    const Ably = (await import('ably')).default;
    const ably = new Ably.Rest({ key });
    await ably.channels.get('marketplace').publish(activity.eventType, activity);
  } catch (err) {
    console.warn('[MarketplaceFeed] Ably error:', err);
  }
}

async function handleBillingUpdated(event: BillingUpdatedEvent): Promise<void> {
  const activity: MarketplaceActivityEvent = {
    eventType: 'payment_received',
    agentId: event.agentId,
    agentName: event.agentId,
    ownerWallet: event.ownerWallet,
    priceXlm: event.earnedXlm,
    totalEarnedXlm: event.totalEarnedXlm,
    totalRequests: event.totalRequests,
    timestamp: event.updatedAt,
  };
  await pushToAbly(activity);
  await publish(TOPICS.MARKETPLACE_ACTIVITY, activity);
}

// ─── Chain syncer ─────────────────────────────────────────────────────────────

async function handleChainSynced(event: ChainSyncedEvent): Promise<void> {
  console.log(
    `[ChainSyncer] chain.synced: contract=${event.contractId} ledger=${event.ledgerSequence}`
  );
}

// ─── A2A router ───────────────────────────────────────────────────────────────

async function handleA2ARequest(event: A2ARequestEvent): Promise<void> {
  const { correlationId, fromAgentId, toAgentId, input, callerWallet, paymentTxHash } = event;
  console.log(`[A2ARouter] ${fromAgentId} → ${toAgentId} (${correlationId})`);

  const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Payment-Wallet': callerWallet,
  };
  if (paymentTxHash) headers['X-Payment-Tx-Hash'] = paymentTxHash;

  const startTime = Date.now();
  let response: A2AResponseEvent;

  try {
    const res = await fetch(`${API_BASE}/api/agents/${toAgentId}/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input }),
    });
    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      response = {
        correlationId,
        fromAgentId,
        toAgentId,
        output: '',
        latencyMs,
        success: false,
        error: (body.error as string) || `HTTP ${res.status}`,
        completedAt: new Date().toISOString(),
      };
    } else {
      const body = (await res.json()) as { output?: string };
      response = {
        correlationId,
        fromAgentId,
        toAgentId,
        output: body.output ?? '',
        latencyMs,
        success: true,
        completedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    response = {
      correlationId,
      fromAgentId,
      toAgentId,
      output: '',
      latencyMs: Date.now() - startTime,
      success: false,
      error: String(err),
      completedAt: new Date().toISOString(),
    };
  }

  await publish(TOPICS.A2A_RESPONSE, response);
  console.log(
    `[A2ARouter] Response for ${correlationId}: success=${response.success}`
  );
}

// ─── Topic handler registry ───────────────────────────────────────────────────

const TOPIC_HANDLERS: Record<string, (payload: unknown) => Promise<void>> = {
  'agentforge-payment-pending': (p) => handlePaymentPending(p as PaymentPendingEvent),
  'agentforge-payment-confirmed': (p) => handlePaymentConfirmed(p as PaymentConfirmedEvent),
  'agentforge-agent-completed': (p) => handleAgentCompleted(p as AgentCompletedEvent),
  'agentforge-billing-updated': (p) => handleBillingUpdated(p as BillingUpdatedEvent),
  'agentforge-chain-synced': (p) => handleChainSynced(p as ChainSyncedEvent),
  'agentforge-a2a-request': (p) => handleA2ARequest(p as A2ARequestEvent),
  'agentforge-a2a-response': async () => {},
  'agentforge-marketplace-activity': async () => {},
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topic: string }> }
) {
  const { topic } = await params;

  const handler = TOPIC_HANDLERS[topic];
  if (!handler) {
    return NextResponse.json({ error: `Unknown topic: ${topic}` }, { status: 400 });
  }

  // ── Verify QStash signature ─────────────────────────────────────────────
  const signingKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  if (signingKey) {
    try {
      const receiver = createQStashReceiver();
      const bodyText = await req.text();
      const signature = req.headers.get('upstash-signature') ?? '';
      const isValid = await receiver.verify({ signature, body: bodyText, url: req.url });
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 });
      }
      const payload = JSON.parse(bodyText) as unknown;
      await handler(payload);
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error(`[consumers/${topic}] Error:`, err);
      return NextResponse.json({ error: 'Consumer error' }, { status: 500 });
    }
  }

  // ── Development: skip signature verification ────────────────────────────
  try {
    const payload = await req.json();
    await handler(payload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[consumers/${topic}] Error:`, err);
    return NextResponse.json({ error: 'Consumer error' }, { status: 500 });
  }
}
