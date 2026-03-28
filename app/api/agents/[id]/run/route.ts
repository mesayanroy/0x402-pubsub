import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import Ably from 'ably';
import { getDemoAgentById, incrementDemoAgentStats } from '@/lib/demo-agents';
import { publish, TOPICS } from '@/lib/qstash';
import type { MarketplaceActivityEvent } from '@/types/events';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function isMissingAgentsTableError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return message.includes("could not find the table 'public.agents'")
    || message.includes('relation "public.agents" does not exist')
    || error.code === 'PGRST205';
}

const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';

function explorerUrl(txHash: string): string {
  return `https://stellar.expert/explorer/${network}/tx/${txHash}`;
}

async function getAgent(agentId: string) {
  if (!supabaseUrl || !supabaseServiceKey) {
    return getDemoAgentById(agentId);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (error && isMissingAgentsTableError(error)) {
    return getDemoAgentById(agentId);
  }

  return data;
}

async function runAgentModel(model: string, systemPrompt: string, userInput: string): Promise<string> {
  if (model === 'openai-gpt4o-mini') {
    const { runOpenAIAgent } = await import('@/lib/openai');
    return runOpenAIAgent(systemPrompt, userInput);
  }
  if (model === 'anthropic-claude-haiku') {
    const { runAnthropicAgent } = await import('@/lib/anthropic');
    return runAnthropicAgent(systemPrompt, userInput);
  }
  return 'Unknown model';
}

async function verifyPayment(
  txHash: string,
  ownerWallet: string,
  priceXlm: number,
  agentId: string,
  callerWallet?: string
): Promise<boolean> {
  try {
    const { verifyPaymentTransaction } = await import('@/lib/stellar');
    const expectedMemoPrefix = `agent:${agentId}`.slice(0, 28);
    const result = await verifyPaymentTransaction(
      txHash,
      ownerWallet,
      priceXlm,
      expectedMemoPrefix,
      callerWallet
    );
    return result.valid;
  } catch {
    return false;
  }
}

async function publishMarketplaceActivity(activity: MarketplaceActivityEvent): Promise<void> {
  const key = process.env.ABLY_API_KEY;
  if (!key) return;

  try {
    const ably = new Ably.Rest({ key });
    await ably.channels.get('marketplace').publish(activity.eventType, activity);
  } catch (err) {
    console.warn('[run] Unable to publish realtime activity:', err);
  }

  try {
    await publish(TOPICS.MARKETPLACE_ACTIVITY, activity);
  } catch (err) {
    console.warn('[run] Unable to publish QStash marketplace event:', err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const startTime = Date.now();

  try {
    const agent = await getAgent(agentId);
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }
    if (!agent.is_active) {
      return NextResponse.json({ error: 'Agent is not active' }, { status: 403 });
    }

    const body = await req.json();
    const { input } = body;

    if (!input || typeof input !== 'string') {
      return NextResponse.json({ error: 'Missing input field' }, { status: 400 });
    }

    // Check for existing payment
    const paymentTxHash = req.headers.get('X-Payment-Tx-Hash');
    const callerWallet = req.headers.get('X-Payment-Wallet') || '';

    if (agent.price_xlm > 0 && !paymentTxHash) {
      // Issue 402 payment challenge
      const requestNonce = Math.random().toString(36).slice(2, 10);
      // Memo is capped at 28 bytes to match Stellar's limit (same cap applied in PaymentModal)
      const memo = `agent:${agentId}:req:${requestNonce}`.slice(0, 28);

      return NextResponse.json(
        {
          error: 'Payment required',
          payment_details: {
            amount_xlm: agent.price_xlm,
            address: agent.owner_wallet,
            network: 'stellar',
            memo,
          },
        },
        {
          status: 402,
          headers: {
            'X-Payment-Required': 'xlm',
            'X-Payment-Amount': String(agent.price_xlm),
            'X-Payment-Address': agent.owner_wallet,
            'X-Payment-Network': 'stellar',
            'X-Payment-Memo': memo,
          },
        }
      );
    }

    const requestId = uuidv4();

    if (paymentTxHash && agent.price_xlm > 0) {
      if (!callerWallet) {
        return NextResponse.json(
          { error: 'Missing X-Payment-Wallet header for paid request' },
          { status: 400 }
        );
      }

      // Verify paid request inline so API callers get immediate completion even
      // when background consumers are not running.
      const paymentVerified = await verifyPayment(
        paymentTxHash,
        agent.owner_wallet,
        agent.price_xlm,
        agentId,
        callerWallet
      );
      if (!paymentVerified) {
        return NextResponse.json({ error: 'Payment verification failed' }, { status: 402 });
      }
    }

    // Free agent (price_xlm === 0) or synchronous fallback path
    const output = await runAgentModel(agent.model, agent.system_prompt, input);
    const latencyMs = Date.now() - startTime;

    // Log to database
    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const insertRes = await supabase.from('agent_requests').insert({
        id: requestId,
        agent_id: agentId,
        caller_wallet: callerWallet || null,
        caller_ip: req.headers.get('x-forwarded-for') || null,
        input_payload: { input },
        output_response: { output },
        payment_tx_hash: paymentTxHash,
        tx_explorer_url: paymentTxHash ? explorerUrl(paymentTxHash) : null,
        payment_amount_xlm: paymentTxHash ? agent.price_xlm : 0,
        protocol: '0x402',
        status: 'success',
        latency_ms: latencyMs,
      });

      if (insertRes.error && !isMissingAgentsTableError(insertRes.error)) {
        console.warn('[run] DB insert error:', insertRes.error);
      }

      if (!insertRes.error && paymentTxHash) {
        const txExplorerUrl = explorerUrl(paymentTxHash);
        await supabase.from('invoices').upsert(
          {
            request_id: requestId,
            agent_id: agentId,
            owner_wallet: agent.owner_wallet,
            caller_wallet: callerWallet || null,
            amount_xlm: agent.price_xlm,
            tx_hash: paymentTxHash,
            tx_explorer_url: txExplorerUrl,
            status: 'paid',
          },
          { onConflict: 'tx_hash' }
        );
      }

      if (!insertRes.error) {
        await supabase
          .from('agents')
          .update({
            total_requests: agent.total_requests ? agent.total_requests + 1 : 1,
            total_earned_xlm: paymentTxHash
              ? (agent.total_earned_xlm || 0) + agent.price_xlm
              : agent.total_earned_xlm || 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', agentId);
      } else {
        incrementDemoAgentStats(agentId, {
          paid: Boolean(paymentTxHash),
          amountXlm: agent.price_xlm,
        });
      }
    } else {
      incrementDemoAgentStats(agentId, {
        paid: Boolean(paymentTxHash),
        amountXlm: agent.price_xlm,
      });
    }

    const activity: MarketplaceActivityEvent = {
      eventType: 'agent_run',
      agentId,
      agentName: agent.name,
      callerWallet: callerWallet || undefined,
      ownerWallet: agent.owner_wallet,
      priceXlm: paymentTxHash ? agent.price_xlm : 0,
      txHash: paymentTxHash || undefined,
      txExplorerUrl: paymentTxHash ? explorerUrl(paymentTxHash) : undefined,
      timestamp: new Date().toISOString(),
    };

    await publishMarketplaceActivity(activity);

    return NextResponse.json({
      output,
      request_id: requestId,
      latency_ms: latencyMs,
      tx_hash: paymentTxHash || null,
      tx_explorer_url: paymentTxHash ? explorerUrl(paymentTxHash) : null,
    });
  } catch (err) {
    console.error('Agent run error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
