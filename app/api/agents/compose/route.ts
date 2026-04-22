/**
 * POST /api/agents/compose
 *
 * Runs two agents in sequence (A2A pattern): agent1 processes the input,
 * then its output becomes the input for agent2.
 * Each step checks for 0x402 payment via the wallet in the header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import Ably from 'ably';
import type { MarketplaceActivityEvent } from '@/types/events';
import { publish, TOPICS } from '@/lib/qstash';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function pushToAbly(activity: MarketplaceActivityEvent) {
  const key = process.env.ABLY_API_KEY;
  if (!key) return;
  try {
    const ably = new Ably.Rest({ key });
    await ably.channels.get('marketplace').publish(activity.eventType, activity);
  } catch { /* ignore */ }
  try {
    await publish(TOPICS.MARKETPLACE_ACTIVITY, activity);
  } catch { /* ignore */ }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    agent1Id?: string;
    agent2Id?: string;
    input?: string;
    txHash1?: string;
    txHash2?: string;
    walletAddress?: string;
  };

  const { agent1Id, agent2Id, input, txHash1, txHash2, walletAddress } = body;

  if (!agent1Id || !agent2Id || !input) {
    return NextResponse.json(
      { error: 'agent1Id, agent2Id and input are required' },
      { status: 400 }
    );
  }

  const correlationId = uuidv4();
  const results: Array<{ agentId: string; output: string; latencyMs: number }> = [];

  // Step 1: Run agent 1
  const headers1: Record<string, string> = { 'Content-Type': 'application/json' };
  if (walletAddress) headers1['X-Payment-Wallet'] = walletAddress;
  if (txHash1) headers1['X-Payment-Tx-Hash'] = txHash1;

  const start1 = Date.now();
  const res1 = await fetch(`${APP_URL}/api/agents/${agent1Id}/run`, {
    method: 'POST',
    headers: headers1,
    body: JSON.stringify({ input }),
  });

  const data1 = await res1.json() as { output?: string; error?: string; payment_details?: unknown };
  if (!res1.ok || data1.error) {
    return NextResponse.json(
      { error: `Agent 1 failed: ${data1.error || 'unknown'}`, payment_details: data1.payment_details },
      { status: res1.status }
    );
  }

  const latency1 = Date.now() - start1;
  results.push({ agentId: agent1Id, output: data1.output || '', latencyMs: latency1 });

  // Step 2: Run agent 2 with agent 1's output as input
  const headers2: Record<string, string> = { 'Content-Type': 'application/json' };
  if (walletAddress) headers2['X-Payment-Wallet'] = walletAddress;
  if (txHash2) headers2['X-Payment-Tx-Hash'] = txHash2;

  const composedInput = `[Agent 1 Output]: ${data1.output}\n\n[Original Task]: ${input}`;
  const start2 = Date.now();
  const res2 = await fetch(`${APP_URL}/api/agents/${agent2Id}/run`, {
    method: 'POST',
    headers: headers2,
    body: JSON.stringify({ input: composedInput }),
  });

  const data2 = await res2.json() as { output?: string; error?: string; payment_details?: unknown };
  if (!res2.ok || data2.error) {
    return NextResponse.json(
      { error: `Agent 2 failed: ${data2.error || 'unknown'}`, payment_details: data2.payment_details, partial: results },
      { status: res2.status }
    );
  }

  const latency2 = Date.now() - start2;
  results.push({ agentId: agent2Id, output: data2.output || '', latencyMs: latency2 });

  // Publish A2A activity to Ably
  await pushToAbly({
    eventType: 'agent_run',
    agentId: `${agent1Id}→${agent2Id}`,
    agentName: `Compose: ${agent1Id} → ${agent2Id}`,
    ownerWallet: '',
    callerWallet: walletAddress,
    priceXlm: 0,
    timestamp: new Date().toISOString(),
  });

  return NextResponse.json({
    correlationId,
    steps: results,
    finalOutput: data2.output || '',
    totalLatencyMs: latency1 + latency2,
  });
}
