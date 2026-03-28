/**
 * app/api/dashboard/requests/route.ts
 *
 * Returns recent agent_requests for the authenticated owner wallet.
 * Uses the service-role key (server-side only) to bypass RLS and filter
 * by the agent_ids that belong to the requested owner_wallet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ownerWallet = searchParams.get('owner');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

  if (!ownerWallet) {
    return NextResponse.json({ error: 'owner query param required' }, { status: 400 });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ requests: [] });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // First, get the agent IDs owned by this wallet
  const { data: agents, error: agentError } = await supabase
    .from('agents')
    .select('id')
    .eq('owner_wallet', ownerWallet);

  if (agentError) {
    console.error('[dashboard/requests] Agent fetch error:', agentError);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }

  if (!agents?.length) {
    return NextResponse.json({ requests: [] });
  }

  const agentIds = agents.map((a: { id: string }) => a.id);

  const { data: requests, error: reqError } = await supabase
    .from('agent_requests')
    .select(
      'id, agent_id, caller_wallet, payment_tx_hash, payment_amount_xlm, tx_explorer_url, protocol, status, latency_ms, created_at'
    )
    .in('agent_id', agentIds)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (reqError) {
    console.error('[dashboard/requests] Request fetch error:', reqError);
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
  }

  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
  const withExplorer = (requests || []).map((row: {
    payment_tx_hash?: string | null;
    tx_explorer_url?: string | null;
    [key: string]: unknown;
  }) => ({
    ...row,
    tx_explorer_url:
      row.tx_explorer_url ||
      (row.payment_tx_hash
        ? `https://stellar.expert/explorer/${network}/tx/${row.payment_tx_hash}`
        : null),
  }));

  return NextResponse.json({ requests: withExplorer });
}
