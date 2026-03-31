import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

type RequestRow = {
  id: string;
  agent_id: string;
  payment_tx_hash: string | null;
  payment_amount_xlm: number | null;
  latency_ms: number | null;
  created_at: string;
  caller_wallet: string | null;
  tx_explorer_url?: string | null;
};

type AgentRow = {
  id: string;
  name: string;
  model: string;
};

type InvoiceRow = {
  id: string;
  request_id: string | null;
  agent_id: string;
  tx_hash: string;
  tx_explorer_url: string | null;
  amount_xlm: number;
  caller_wallet: string | null;
  created_at: string;
};

function toMinuteBucket(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.valueOf())) return ts;
  date.setSeconds(0, 0);
  return date.toISOString();
}

function inferExplorerUrl(txHash: string | null, existing?: string | null): string | null {
  if (existing) return existing;
  if (!txHash) return null;
  const network = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${network}/tx/${txHash}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ownerWallet = searchParams.get('owner');
  const hours = Math.min(Math.max(parseInt(searchParams.get('hours') || '24', 10), 1), 168);

  if (!ownerWallet) {
    return NextResponse.json({ error: 'owner query param required' }, { status: 400 });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({
      byModel: [],
      requestRate: [],
      earnings: [],
      invoices: [],
      totals: {
        requests: 0,
        paidRequests: 0,
        totalEarnedXlm: 0,
        avgLatencyMs: 0,
      },
      generatedAt: new Date().toISOString(),
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data: agents, error: agentsError } = await supabase
    .from('agents')
    .select('id, name, model')
    .eq('owner_wallet', ownerWallet);

  if (agentsError) {
    console.error('[dashboard/analytics] Agent fetch error:', agentsError);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }

  if (!agents?.length) {
    return NextResponse.json({
      byModel: [],
      requestRate: [],
      earnings: [],
      invoices: [],
      totals: {
        requests: 0,
        paidRequests: 0,
        totalEarnedXlm: 0,
        avgLatencyMs: 0,
      },
      generatedAt: new Date().toISOString(),
    });
  }

  const agentRows = agents as AgentRow[];
  const agentIds = agentRows.map((a) => a.id);
  const agentById = new Map(agentRows.map((a) => [a.id, a]));

  const { data: requests, error: requestsError } = await supabase
    .from('agent_requests')
    .select(
      'id, agent_id, payment_tx_hash, payment_amount_xlm, latency_ms, created_at, caller_wallet, tx_explorer_url'
    )
    .in('agent_id', agentIds)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (requestsError) {
    console.error('[dashboard/analytics] Request fetch error:', requestsError);
    return NextResponse.json({ error: 'Failed to fetch request analytics' }, { status: 500 });
  }

  const rows = (requests || []) as RequestRow[];

  const byModelMap = new Map<
    string,
    { model: string; requests: number; paidRequests: number; earnedXlm: number; avgLatencyMs: number; latencySum: number }
  >();
  const requestRateMap = new Map<string, { ts: string; total: number; models: Record<string, number> }>();
  const earningsMap = new Map<string, number>();

  let latencySum = 0;
  let latencyCount = 0;
  let paidRequests = 0;
  let totalEarnedXlm = 0;

  for (const row of rows) {
    const agent = agentById.get(row.agent_id);
    if (!agent) continue;

    const modelAgg = byModelMap.get(agent.model) || {
      model: agent.model,
      requests: 0,
      paidRequests: 0,
      earnedXlm: 0,
      avgLatencyMs: 0,
      latencySum: 0,
    };

    modelAgg.requests += 1;
    if (typeof row.latency_ms === 'number') {
      modelAgg.latencySum += row.latency_ms;
      latencySum += row.latency_ms;
      latencyCount += 1;
    }

    const amount = Number(row.payment_amount_xlm || 0);
    if (amount > 0 && row.payment_tx_hash) {
      modelAgg.paidRequests += 1;
      modelAgg.earnedXlm += amount;
      paidRequests += 1;
      totalEarnedXlm += amount;

      const day = row.created_at.slice(0, 10);
      earningsMap.set(day, (earningsMap.get(day) || 0) + amount);
    }

    byModelMap.set(agent.model, modelAgg);

    const minuteBucket = toMinuteBucket(row.created_at);
    const bucket = requestRateMap.get(minuteBucket) || {
      ts: minuteBucket,
      total: 0,
      models: {},
    };
    bucket.total += 1;
    bucket.models[agent.model] = (bucket.models[agent.model] || 0) + 1;
    requestRateMap.set(minuteBucket, bucket);
  }

  const byModel = Array.from(byModelMap.values())
    .map((item) => ({
      model: item.model,
      requests: item.requests,
      paidRequests: item.paidRequests,
      earnedXlm: Number(item.earnedXlm.toFixed(4)),
      avgLatencyMs: item.requests > 0 ? Math.round(item.latencySum / item.requests) : 0,
    }))
    .sort((a, b) => b.requests - a.requests);

  const requestRate = Array.from(requestRateMap.values())
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-120);

  const earnings = Array.from(earningsMap.entries())
    .map(([date, amount]) => ({ date, amount: Number(amount.toFixed(4)) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select('id, request_id, agent_id, tx_hash, tx_explorer_url, amount_xlm, caller_wallet, created_at')
    .in('agent_id', agentIds)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100);

  const invoiceList = (invoiceRows || []) as InvoiceRow[];
  const invoices = invoiceList.length
    ? invoiceList.map((r) => {
        const agent = agentById.get(r.agent_id);
        return {
          invoiceId: `inv_${r.id.slice(0, 12)}`,
          requestId: r.request_id || '',
          txHash: r.tx_hash,
          txExplorerUrl: inferExplorerUrl(r.tx_hash, r.tx_explorer_url),
          amountXlm: Number(Number(r.amount_xlm || 0).toFixed(4)),
          model: agent?.model || 'unknown',
          agentName: agent?.name || r.agent_id,
          callerWallet: r.caller_wallet,
          createdAt: r.created_at,
        };
      })
    : rows
        .filter((r) => r.payment_tx_hash && Number(r.payment_amount_xlm || 0) > 0)
        .slice(0, 100)
        .map((r) => {
          const agent = agentById.get(r.agent_id);
          return {
            invoiceId: `inv_${r.id.slice(0, 12)}`,
            requestId: r.id,
            txHash: r.payment_tx_hash,
            txExplorerUrl: inferExplorerUrl(r.payment_tx_hash, r.tx_explorer_url),
            amountXlm: Number(Number(r.payment_amount_xlm || 0).toFixed(4)),
            model: agent?.model || 'unknown',
            agentName: agent?.name || r.agent_id,
            callerWallet: r.caller_wallet,
            createdAt: r.created_at,
          };
        });

  return NextResponse.json({
    byModel,
    requestRate,
    earnings,
    invoices,
    totals: {
      requests: rows.length,
      paidRequests,
      totalEarnedXlm: Number(totalEarnedXlm.toFixed(4)),
      avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0,
    },
    generatedAt: new Date().toISOString(),
  });
}
