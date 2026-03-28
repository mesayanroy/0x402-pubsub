/**
 * lib/qstash.ts
 *
 * Upstash QStash message-queue backbone for AgentForge.
 * Replaces the Kafka backbone with a serverless-friendly HTTP-push model.
 *
 * Publishing: The caller POSTs a JSON payload to QStash which delivers it
 * to the target Next.js API route (webhook endpoint).
 *
 * Consuming: Each consumer is a Next.js API route at
 *   /api/consumers/{topic-slug}
 * QStash calls these routes and retries on failure.
 *
 * All topic names are defined here so every producer/consumer imports from
 * a single source of truth.
 */

import { Client, Receiver } from '@upstash/qstash';

// ─── QStash client singleton ─────────────────────────────────────────────────

let _client: Client | null = null;

function getQStashClient(): Client {
  if (!_client) {
    const token = process.env.QSTASH_TOKEN;
    if (!token) {
      throw new Error(
        'QStash is not configured. Set QSTASH_TOKEN in your environment.'
      );
    }
    _client = new Client({ token });
  }
  return _client;
}

// ─── Topic registry ───────────────────────────────────────────────────────────

export const TOPICS = {
  /** Emitted by the /run route once a tx hash has been supplied by the caller. */
  PAYMENT_PENDING: 'agentforge.payment.pending',

  /** Emitted by the Payment Verifier once Horizon confirms the tx. */
  PAYMENT_CONFIRMED: 'agentforge.payment.confirmed',

  /** Emitted by the Agent Executor once the AI model has returned a response. */
  AGENT_COMPLETED: 'agentforge.agent.completed',

  /** Emitted by the Billing Aggregator after updating Supabase earnings. */
  BILLING_UPDATED: 'agentforge.billing.updated',

  /** Emitted by the Marketplace Feed consumer before pushing to Ably. */
  MARKETPLACE_ACTIVITY: 'agentforge.marketplace.activity',

  /** Emitted by the Chain Syncer for any on-chain state change. */
  CHAIN_SYNCED: 'agentforge.chain.synced',

  /** Used by the A2A Router to forward requests between agents. */
  A2A_REQUEST: 'agentforge.a2a.request',

  /** Used by the A2A Router to deliver responses between agents. */
  A2A_RESPONSE: 'agentforge.a2a.response',
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

/** Convert a dotted topic name to a URL-safe slug: "a.b.c" → "a-b-c" */
function topicToSlug(topic: Topic): string {
  return topic.replace(/\./g, '-');
}

// ─── Publisher ────────────────────────────────────────────────────────────────

/**
 * Publish a single JSON message to a topic.
 * QStash will HTTP-POST the payload to /api/consumers/{topic-slug}.
 *
 * Safe to call from Next.js API routes (REST under the hood).
 */
export async function publish<T>(topic: Topic, payload: T): Promise<void> {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    'http://localhost:3000';

  const slug = topicToSlug(topic);
  const destination = `${appUrl}/api/consumers/${slug}`;

  try {
    const client = getQStashClient();
    await client.publishJSON({
      url: destination,
      body: payload as Record<string, unknown>,
      retries: 3,
    });
  } catch (err) {
    console.error(`[QStash] Failed to publish to topic "${topic}":`, err);
    throw err;
  }
}

// ─── Signature verifier ───────────────────────────────────────────────────────

/**
 * Create a QStash Receiver for verifying incoming webhook signatures.
 * Use this inside /api/consumers/* route handlers.
 */
export function createQStashReceiver(): Receiver {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) {
    throw new Error(
      'QStash signing keys not configured. ' +
        'Set QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY.'
    );
  }
  return new Receiver({ currentSigningKey, nextSigningKey });
}

// ─── Backward-compatible consumer factory (no-op) ────────────────────────────

export type MessageHandler<T = unknown> = (payload: T) => Promise<void>;

/**
 * Stub that keeps the consumers/index.ts orchestrator working.
 * Actual message handling happens in /api/consumers/* HTTP endpoints.
 */
export function createConsumer<T>(
  groupId: string,
  _topic: Topic,
  _handler: MessageHandler<T>,
  _options: { pollIntervalMs?: number } = {} // eslint-disable-line @typescript-eslint/no-unused-vars
): { start: () => void; stop: () => void } {
  return {
    start() {
      console.log(`[QStash] Consumer "${groupId}" is webhook-driven – no polling needed.`);
    },
    stop() {
      console.log(`[QStash] Consumer "${groupId}" stopped.`);
    },
  };
}
