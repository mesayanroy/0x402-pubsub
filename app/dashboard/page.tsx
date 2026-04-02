'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Agent } from '@/types';
import { useMarketplaceFeed } from '@/hooks/useMarketplaceFeed';
import { truncateAddress } from '@/lib/stellar';

type AnalyticsResponse = {
  byModel: Array<{ model: string; requests: number; paidRequests: number; earnedXlm: number; avgLatencyMs: number }>;
  requestRate: Array<{ ts: string; total: number; models: Record<string, number> }>;
  earnings: Array<{ date: string; amount: number }>;
  invoices: Array<{
    invoiceId: string;
    requestId: string;
    txHash: string;
    txExplorerUrl: string;
    amountXlm: number;
    model: string;
    agentName: string;
    callerWallet: string | null;
    createdAt: string;
  }>;
  totals: {
    requests: number;
    paidRequests: number;
    totalEarnedXlm: number;
    avgLatencyMs: number;
  };
  generatedAt: string;
};

const EMPTY_ANALYTICS: AnalyticsResponse = {
  byModel: [],
  requestRate: [],
  earnings: [],
  invoices: [],
  totals: { requests: 0, paidRequests: 0, totalEarnedXlm: 0, avgLatencyMs: 0 },
  generatedAt: new Date().toISOString(),
};

function shortHash(hash: string): string {
  if (!hash) return '';
  return `${hash.slice(0, 10)}...${hash.slice(-10)}`;
}

function shortWallet(wallet: string | null): string {
  if (!wallet) return 'anonymous';
  return `${wallet.slice(0, 6)}...${wallet.slice(-6)}`;
}

function modelName(model: string): string {
  if (model === 'openai-gpt4o-mini') return 'GPT-4o Mini';
  if (model === 'anthropic-claude-haiku') return 'Claude Haiku';
  return model;
}

const PIE_COLORS = ['#00FFE5', '#FFB800', '#4ade80', '#f87171', '#a78bfa'];

type DashboardRequestRow = {
  id: string;
  agent_id: string;
  status: 'success' | 'failed' | 'pending' | string;
  latency_ms: number | null;
  created_at: string;
};

type LocalTradingRow = {
  pnl: number;
  pair: string;
  ts: string;
  type: string;
  closePrice: number;
};

type LocalRuntimeRow = {
  requestId: string;
  agentId: string;
  latencyMs: number;
  createdAt: string;
};

export default function DashboardPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [myAgents, setMyAgents] = useState<Agent[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [requestRows, setRequestRows] = useState<DashboardRequestRow[]>([]);
  const [localTrades, setLocalTrades] = useState<LocalTradingRow[]>([]);
  const [localRuntimeRows, setLocalRuntimeRows] = useState<LocalRuntimeRow[]>([]);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [xlmPrice, setXlmPrice] = useState<number | null>(null);

  // Real-time live feed of 0x402 activity for MY agents
  const { events: liveEvents, isConnected: feedConnected } = useMarketplaceFeed({ maxEvents: 20 });
  const myAgentIds = new Set(myAgents.map((a) => a.id));
  const myLiveEvents = liveEvents.filter((e) => myAgentIds.has(e.agentId));

  const hydrateLocalTrading = () => {
    try {
      const rows = JSON.parse(localStorage.getItem('trading_pnl_history') || '[]') as LocalTradingRow[];
      setLocalTrades(Array.isArray(rows) ? rows.slice(0, 100) : []);
    } catch {
      setLocalTrades([]);
    }
  };

  const hydrateLocalRuns = () => {
    try {
      const rows = JSON.parse(localStorage.getItem('agent_runtime_history') || '[]') as LocalRuntimeRow[];
      setLocalRuntimeRows(Array.isArray(rows) ? rows.slice(0, 100) : []);
    } catch {
      setLocalRuntimeRows([]);
    }
  };

  const fetchAll = useCallback(async (owner: string) => {
    setLoading(true);
    try {
      const [agentsRes, analyticsRes, requestsRes] = await Promise.all([
        fetch(`/api/agents/list?owner=${encodeURIComponent(owner)}`),
        fetch(`/api/dashboard/analytics?owner=${encodeURIComponent(owner)}&hours=24`),
        fetch(`/api/dashboard/requests?owner=${encodeURIComponent(owner)}&limit=100`),
      ]);
      const agentsData = agentsRes.ok ? await agentsRes.json() : { agents: [] };
      const analyticsData = analyticsRes.ok ? await analyticsRes.json() : EMPTY_ANALYTICS;
      const requestsData = requestsRes.ok ? await requestsRes.json() : { requests: [] };
      setMyAgents((agentsData as { agents: Agent[] }).agents || []);
      setAnalytics({
        ...EMPTY_ANALYTICS,
        ...(analyticsData || {}),
        totals: { ...EMPTY_ANALYTICS.totals, ...((analyticsData as AnalyticsResponse)?.totals || {}) },
      });
      setRequestRows(((requestsData as { requests?: DashboardRequestRow[] }).requests || []).slice(0, 100));
    } catch {
      setMyAgents([]);
      setAnalytics(EMPTY_ANALYTICS);
      setRequestRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const addr = localStorage.getItem('wallet_address');
    if (!addr) return;
    setWalletAddress(addr);

    // Fetch XLM price for USD conversion
    const fetchXlmPrice = async () => {
      try {
        const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd');
        if (r.ok) {
          const d = await r.json() as { stellar: { usd: number } };
          setXlmPrice(d.stellar?.usd ?? null);
        }
      } catch { /* ignore */ }
    };

    void fetchAll(addr);
    void fetchXlmPrice();
    hydrateLocalTrading();
    hydrateLocalRuns();

    const onTradingPnl = () => hydrateLocalTrading();
    const onAgentRun = () => {
      hydrateLocalRuns();
      void fetchAll(addr);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'trading_pnl_history') hydrateLocalTrading();
      if (event.key === 'agent_runtime_history') hydrateLocalRuns();
    };

    window.addEventListener('trading_pnl_update', onTradingPnl as EventListener);
    window.addEventListener('agent_run_success', onAgentRun as EventListener);
    window.addEventListener('storage', onStorage);

    const interval = setInterval(() => void fetchAll(addr), 10_000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('trading_pnl_update', onTradingPnl as EventListener);
      window.removeEventListener('agent_run_success', onAgentRun as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [fetchAll]);

  const removeAgent = async (agent: Agent) => {
    if (!walletAddress || deletingAgentId) return;
    if (walletAddress !== agent.owner_wallet) return;

    const ok = window.confirm(`Remove agent \"${agent.name}\" from active listings?`);
    if (!ok) return;

    setDeletingAgentId(agent.id);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || 'Failed to remove agent');
      }
      setMyAgents((prev) => prev.filter((a) => a.id !== agent.id));
    } catch (err) {
      console.error('[dashboard] remove agent error:', err);
    } finally {
      setDeletingAgentId(null);
    }
  };

  if (!walletAddress) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-syne text-2xl font-bold text-white mb-3">Connect Your Wallet</h2>
          <p className="text-gray-400 font-mono text-sm">Please connect your Freighter wallet to view your dashboard.</p>
        </div>
      </div>
    );
  }

  if (loading && !analytics) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-sm text-gray-400 animate-pulse">Loading real-time dashboard...</p>
      </div>
    );
  }

  const totalEarned = analytics?.totals?.totalEarnedXlm ?? 0;
  const totalEarnedUsd = xlmPrice ? totalEarned * xlmPrice : null;

  const tradingPnlTotal = localTrades.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  const winningTrades = localTrades.filter((row) => Number(row.pnl || 0) > 0).length;
  const losingTrades = localTrades.filter((row) => Number(row.pnl || 0) < 0).length;
  const totalClosedTrades = winningTrades + losingTrades;
  const winRate = totalClosedTrades > 0 ? (winningTrades / totalClosedTrades) * 100 : 0;
  const traderScore = Math.max(0, Math.round(50 + (winRate * 0.5) + (tradingPnlTotal * 8)));

  const runtimeRows = requestRows
    .filter((row) => typeof row.latency_ms === 'number')
    .map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      latencyMs: Number(row.latency_ms || 0),
      createdAt: row.created_at,
      source: 'remote' as const,
    }));

  const localTimingRows = localRuntimeRows.map((row) => ({
    id: row.requestId,
    agentId: row.agentId,
    latencyMs: Number(row.latencyMs || 0),
    createdAt: row.createdAt,
    source: 'local' as const,
  }));

  const requestTimeBreakdown = [...runtimeRows, ...localTimingRows]
    .filter((row, index, arr) => arr.findIndex((x) => x.id === row.id) === index)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);

  const timingDistribution = [
    { label: '< 1s', value: requestTimeBreakdown.filter((r) => r.latencyMs < 1000).length },
    { label: '1-3s', value: requestTimeBreakdown.filter((r) => r.latencyMs >= 1000 && r.latencyMs < 3000).length },
    { label: '3-10s', value: requestTimeBreakdown.filter((r) => r.latencyMs >= 3000 && r.latencyMs < 10000).length },
    { label: '> 10s', value: requestTimeBreakdown.filter((r) => r.latencyMs >= 10000).length },
  ];

  const freeRequests = (analytics?.totals?.requests ?? 0) - (analytics?.totals?.paidRequests ?? 0);
  const paidRequests = analytics?.totals?.paidRequests ?? 0;

  const tradeTypeData = [
    { name: 'Paid Requests', value: paidRequests },
    { name: 'Free Requests', value: freeRequests },
  ].filter((d) => d.value > 0);

  // Compute cumulative PnL from both agent earnings and local trading outcomes.
  const dailyPnlMap = new Map<string, number>();
  for (const row of analytics?.earnings ?? []) {
    dailyPnlMap.set(row.date, (dailyPnlMap.get(row.date) || 0) + Number(row.amount || 0));
  }
  for (const trade of localTrades) {
    const day = new Date(trade.ts).toISOString().slice(0, 10);
    dailyPnlMap.set(day, (dailyPnlMap.get(day) || 0) + Number(trade.pnl || 0));
  }
  let cumulative = 0;
  const pnlData = Array.from(dailyPnlMap.entries())
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => {
      cumulative += row.amount;
      return { date: row.date, daily: row.amount, cumulative };
    });

  const statCards = [
    { label: 'My Agents', value: String(myAgents.length), unit: '', color: 'text-[#00FFE5]' },
    {
      label: 'Total Earned',
      value: totalEarned.toFixed(2),
      unit: 'XLM',
      sub: totalEarnedUsd ? `≈ $${totalEarnedUsd.toFixed(2)}` : undefined,
      color: 'text-[#FFB800]',
    },
    { label: 'Total Requests', value: (analytics?.totals?.requests ?? 0).toLocaleString(), unit: '', color: 'text-[#4ade80]' },
    { label: 'Avg Latency', value: String(analytics?.totals?.avgLatencyMs ?? 0), unit: 'ms', color: 'text-purple-400' },
    { label: 'Trader Score', value: String(traderScore), unit: '', color: 'text-[#00FFE5]' },
  ];

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">

          <div>
            <h1 className="font-syne text-4xl font-bold text-white mb-1">Dashboard</h1>
            <p className="font-mono text-xs text-gray-500">{walletAddress}</p>
            <p className="font-mono text-[10px] text-gray-600 mt-0.5">Auto-refresh every 10s · Last: {analytics ? new Date(analytics.generatedAt).toLocaleTimeString([], { hour12: false }) : '—'}</p>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {statCards.map((stat) => (
              <div key={stat.label} className="p-5 rounded-xl border border-[rgba(0,255,229,0.1)] bg-[rgba(255,255,255,0.02)]">
                <div className={`font-syne text-2xl font-bold ${stat.color}`}>
                  {stat.value}{stat.unit ? ` ${stat.unit}` : ''}
                </div>
                {stat.sub && <div className="font-mono text-xs text-gray-500 mt-0.5">{stat.sub}</div>}
                <div className="font-mono text-xs text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Charts Row 1: Request Rate + Billing by Model */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="p-5 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-syne text-lg font-bold text-white">Request Rate by Minute</h3>
                <span className="font-mono text-[10px] text-gray-500">auto-refresh 10s</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics?.requestRate || []}>
                    <defs>
                      <linearGradient id="reqFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00FFE5" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#00FFE5" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <XAxis dataKey="ts" tick={{ fill: '#8a8a93', fontSize: 10 }}
                      tickFormatter={(value: string) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })} />
                    <YAxis tick={{ fill: '#8a8a93', fontSize: 10 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#0a0a10', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff' }} />
                    <Area type="monotone" dataKey="total" stroke="#00FFE5" fill="url(#reqFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-syne text-lg font-bold text-white">Billing by Model</h3>
                <span className="font-mono text-[10px] text-gray-500">live from Supabase</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics?.byModel || []}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                    <XAxis dataKey="model" tick={{ fill: '#8a8a93', fontSize: 10 }} tickFormatter={(value: string) => modelName(value)} />
                    <YAxis tick={{ fill: '#8a8a93', fontSize: 10 }} />
                    <Tooltip
                      formatter={(value: unknown) => {
                        const n = typeof value === 'number' ? value : Number(value || 0);
                        return `${n.toFixed(2)} XLM`;
                      }}
                      contentStyle={{ background: '#0a0a10', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff' }} />
                    <Bar dataKey="earnedXlm" fill="#FFB800" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Charts Row 2: PnL + Request Type Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Cumulative PnL */}
            <div className="p-5 rounded-2xl border border-[rgba(74,222,128,0.1)] bg-[rgba(74,222,128,0.02)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-syne text-lg font-bold text-white">Cumulative PnL (XLM)</h3>
                <span className="font-mono text-[10px] text-gray-500">agents + trading outcomes</span>
              </div>
              <div className="h-64">
                {pnlData.length === 0 ? (
                  <div className="h-full flex items-center justify-center font-mono text-sm text-white/30">
                    No paid activity yet — run a paid agent to see PnL
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={pnlData}>
                      <defs>
                        <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4ade80" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#4ade80" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: '#8a8a93', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#8a8a93', fontSize: 10 }} />
                      <Tooltip
                        formatter={(value: unknown, name: unknown) => {
                          const raw = Array.isArray(value) ? value[0] : value;
                          const n = typeof raw === 'number' ? raw : Number(raw || 0);
                          return [`${n.toFixed(4)} XLM`, name === 'cumulative' ? 'Total PnL' : 'Daily Earned'];
                        }}
                        contentStyle={{ background: '#0a0a10', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff' }} />
                      <Area type="monotone" dataKey="cumulative" stroke="#4ade80" fill="url(#pnlFill)" strokeWidth={2} name="cumulative" />
                      <Bar dataKey="daily" fill="rgba(74,222,128,0.4)" radius={[3, 3, 0, 0]} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Request Type Breakdown */}
            <div className="p-5 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-syne text-lg font-bold text-white">Request Type Breakdown</h3>
                <span className="font-mono text-[10px] text-gray-500">paid vs free</span>
              </div>
              <div className="h-64 flex items-center">
                {tradeTypeData.length === 0 ? (
                  <div className="w-full text-center font-mono text-sm text-white/30">No requests yet</div>
                ) : (
                  <div className="flex w-full items-center gap-6">
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={tradeTypeData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={4}>
                            {tradeTypeData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: unknown) => [`${value} requests`, '']}
                            contentStyle={{ background: '#0a0a10', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2 shrink-0">
                      {tradeTypeData.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-2 font-mono text-xs">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-gray-400">{d.name}</span>
                          <span className="text-white font-bold">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-syne text-lg font-bold text-white">Request Time Breakdown</h3>
              <span className="font-mono text-[10px] text-gray-500">successful agent runs</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {timingDistribution.map((bucket) => (
                <div key={bucket.label} className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-center">
                  <div className="font-syne text-xl text-[#00FFE5]">{bucket.value}</div>
                  <div className="font-mono text-[10px] text-gray-500 mt-0.5">{bucket.label}</div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['Request', 'Agent', 'Latency', 'Source', 'Time'].map((h) => (
                      <th key={h} className="py-2 pr-4 text-left font-mono text-[10px] text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {requestTimeBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center font-mono text-xs text-white/30">
                        No successful runs yet.
                      </td>
                    </tr>
                  )}
                  {requestTimeBreakdown.map((row) => (
                    <tr key={`${row.source}-${row.id}`} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 pr-4 font-mono text-xs text-gray-400">{row.id.slice(0, 12)}...</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-white">{row.agentId.slice(0, 8)}...</td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-[#4ade80]">{Math.round(row.latencyMs)} ms</td>
                      <td className="py-2.5 pr-4 font-mono text-[10px] text-[#FFB800]">{row.source}</td>
                      <td className="py-2.5 pr-4 font-mono text-[10px] text-white/40">
                        {new Date(row.createdAt).toLocaleTimeString([], { hour12: false })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Traders Portfolio */}
          <div className="p-5 rounded-2xl border border-[rgba(0,255,229,0.1)] bg-[rgba(0,255,229,0.02)]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-syne text-lg font-bold text-white">Traders Portfolio</h3>
                <p className="font-mono text-[10px] text-gray-500 mt-0.5">Real-time P&amp;L per transaction · agent strategy tracking</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${feedConnected ? 'bg-[#00FFE5] animate-pulse' : 'bg-amber-400'}`} />
                <span className="font-mono text-[10px] text-gray-500">{feedConnected ? 'live' : 'offline'}</span>
              </div>
            </div>

            {/* Portfolio summary row */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-xl border border-[rgba(74,222,128,0.2)] bg-[rgba(74,222,128,0.04)] p-3 text-center">
                <div className={`font-syne text-xl font-bold ${tradingPnlTotal >= 0 ? 'text-[#4ade80]' : 'text-red-400'}`}>
                  {tradingPnlTotal >= 0 ? '+' : ''}{tradingPnlTotal.toFixed(4)}
                </div>
                <div className="font-mono text-[10px] text-gray-500 mt-0.5">Trading PnL (XLM)</div>
              </div>
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-3 text-center">
                <div className="font-syne text-xl font-bold text-[#FFB800]">{totalClosedTrades}</div>
                <div className="font-mono text-[10px] text-gray-500 mt-0.5">Closed Trades</div>
              </div>
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-3 text-center">
                <div className="font-syne text-xl font-bold text-purple-400">{traderScore}</div>
                <div className="font-mono text-[10px] text-gray-500 mt-0.5">Trader Score</div>
              </div>
            </div>

            {/* Trade rows */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    {['#', 'Agent / Strategy', 'Model', 'P&L (XLM)', 'Tx', 'Time'].map((h) => (
                      <th key={h} className="py-2 pr-4 text-left font-mono text-[10px] text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.invoices || []).length === 0 && localTrades.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center font-mono text-xs text-white/30">
                        No trades yet — close a position in Trading to populate this table.
                      </td>
                    </tr>
                  )}
                  {(analytics?.invoices || []).map((row, idx) => (
                    <tr key={row.invoiceId} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 pr-4 font-mono text-[10px] text-gray-600">{idx + 1}</td>
                      <td className="py-2.5 pr-4">
                        <div className="font-mono text-xs text-white">{row.agentName}</div>
                        <div className="font-mono text-[9px] text-gray-600 mt-0.5">via 0x402 protocol</div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                          row.model === 'openai-gpt4o-mini'
                            ? 'border-[rgba(0,255,229,0.3)] text-[#00FFE5] bg-[rgba(0,255,229,0.06)]'
                            : 'border-purple-800 text-purple-400 bg-purple-900/20'
                        }`}>
                          {modelName(row.model)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="font-mono text-xs text-[#4ade80] font-bold">+{row.amountXlm.toFixed(4)}</span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <a
                          href={row.txExplorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[10px] text-[#FFB800] hover:underline"
                        >
                          {row.txHash ? `${row.txHash.slice(0, 8)}…` : '—'}
                        </a>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[10px] text-white/40">
                        {new Date(row.createdAt).toLocaleTimeString([], { hour12: false })}
                      </td>
                    </tr>
                  ))}
                  {localTrades.map((row, idx) => (
                    <tr key={`trade-${row.ts}-${idx}`} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 pr-4 font-mono text-[10px] text-gray-600">T{idx + 1}</td>
                      <td className="py-2.5 pr-4">
                        <div className="font-mono text-xs text-white">{row.pair.toUpperCase()}</div>
                        <div className="font-mono text-[9px] text-gray-600 mt-0.5">{row.type.toUpperCase()} close</div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono border border-[rgba(0,255,229,0.3)] text-[#00FFE5] bg-[rgba(0,255,229,0.06)]">
                          Trading
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`font-mono text-xs font-bold ${row.pnl >= 0 ? 'text-[#4ade80]' : 'text-red-400'}`}>
                          {row.pnl >= 0 ? '+' : ''}{row.pnl.toFixed(4)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-[10px] text-[#FFB800]">@ {row.closePrice.toFixed(4)}</td>
                      <td className="py-2.5 pr-4 font-mono text-[10px] text-white/40">
                        {new Date(row.ts).toLocaleTimeString([], { hour12: false })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Live new trades from Ably */}
            {(() => {
              const liveTrades = myLiveEvents.filter((e) => (e.priceXlm ?? 0) > 0).slice(0, 5);
              if (liveTrades.length === 0) return null;
              return (
                <div className="mt-4 pt-4 border-t border-white/[0.06]">
                  <p className="font-mono text-[10px] text-gray-500 mb-2 uppercase tracking-widest">New (live)</p>
                  {liveTrades.map((ev, idx) => (
                    <div key={`live-${idx}`} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00FFE5] animate-pulse shrink-0" />
                        <span className="font-mono text-xs text-white/70">{ev.agentName}</span>
                      </div>
                      <span className="font-mono text-xs text-[#4ade80]">+{(ev.priceXlm ?? 0).toFixed(4)} XLM</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Invoice Stream */}
          <div className="p-5 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-syne text-lg font-bold text-white">Invoice Stream (0x402)</h3>
              <span className="font-mono text-xs text-gray-500">avg latency: {analytics?.totals?.avgLatencyMs ?? 0} ms</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="text-left border-b border-white/[0.08]">
                    {['Invoice', 'Agent', 'Model', 'Amount', 'Signature', 'Caller', 'Time'].map((h) => (
                      <th key={h} className="py-2 pr-3 font-mono text-[11px] text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.invoices || []).map((row) => (
                    <tr key={row.invoiceId} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <td className="py-2 pr-3 font-mono text-xs text-white/80">{row.invoiceId}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-white/80">{row.agentName}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-[#00FFE5]">{modelName(row.model)}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-[#4ade80]">{row.amountXlm.toFixed(4)} XLM</td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        <a href={row.txExplorerUrl} target="_blank" rel="noreferrer" className="text-[#FFB800] hover:underline">
                          {shortHash(row.txHash)}
                        </a>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-white/60">{shortWallet(row.callerWallet)}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-white/50">
                        {new Date(row.createdAt).toLocaleTimeString([], { hour12: false })}
                      </td>
                    </tr>
                  ))}
                  {(analytics?.invoices || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center font-mono text-xs text-white/40">
                        No paid requests yet. Sign and run a paid agent call to populate invoices.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Real-time 0x402 Live Activity */}
          <div className="rounded-2xl border border-white/[0.06] bg-[rgba(5,5,8,0.85)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${feedConnected ? 'bg-[#00FFE5] animate-pulse' : 'bg-amber-400'}`} />
                <span className="font-mono text-xs text-white/70">Live 0x402 Activity</span>
              </div>
              <span className="font-mono text-[10px] text-white/30">{feedConnected ? 'connected · Ably' : 'reconnecting...'}</span>
            </div>
            <div className="divide-y divide-white/[0.03]">
              {myLiveEvents.length === 0 ? (
                <div className="px-5 py-4 font-mono text-xs text-white/40">
                  No live activity yet. Real-time events will appear here when your agents are called.
                </div>
              ) : (
                myLiveEvents.slice(0, 10).map((ev, idx) => (
                  <div key={`${ev.timestamp}-${idx}`} className="flex items-center justify-between px-5 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono border uppercase tracking-wide bg-[rgba(0,255,229,0.1)] border-[rgba(0,255,229,0.3)] text-[#00FFE5]">
                        {ev.eventType.replace(/_/g, '\u00A0')}
                      </span>
                      <span className="font-mono text-xs text-white/80 truncate max-w-[140px]">{ev.agentName}</span>
                      <span className="font-mono text-xs text-white/40">
                        {ev.callerWallet ? truncateAddress(ev.callerWallet) : 'anonymous'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {typeof ev.priceXlm === 'number' && ev.priceXlm > 0 && (
                        <span className="font-mono text-xs text-[#4ade80]">+{ev.priceXlm.toFixed(4)} XLM</span>
                      )}
                      {ev.txHash && (
                        <a href={ev.txExplorerUrl} target="_blank" rel="noreferrer" className="font-mono text-[9px] text-[#FFB800] hover:underline">
                          {ev.txHash.slice(0, 8)}…
                        </a>
                      )}
                      <span className="font-mono text-[10px] text-white/30">
                        {new Date(ev.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* My Agents */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-syne text-xl font-bold text-white">My Agents</h2>
              <Link href="/build" className="px-4 py-1.5 text-xs font-mono border border-[#00FFE5] text-[#00FFE5] rounded hover:bg-[#00FFE5] hover:text-black transition-all">
                + Deploy New
              </Link>
            </div>
            <div className="space-y-3">
              {myAgents.length === 0 && (
                <p className="font-mono text-sm text-gray-500">No agents deployed yet. <Link href="/build" className="text-[#00FFE5] underline">Build your first agent →</Link></p>
              )}
              {myAgents.map((agent) => (
                <div key={agent.id} className="flex items-center justify-between p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(0,255,229,0.15)] transition-all group">
                  <div>
                    <Link href={`/agents/${agent.id}`} className="flex items-center gap-2">
                      <div className="font-syne font-bold text-white group-hover:text-[#00FFE5] transition-colors">{agent.name}</div>
                      {agent.forked_from && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-purple-800 bg-purple-900/20 text-purple-400">forked</span>
                      )}
                      {agent.visibility === 'public' && !agent.forked_from && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-[rgba(0,255,229,0.3)] bg-[rgba(0,255,229,0.06)] text-[#00FFE5]">marketplace</span>
                      )}
                    </Link>
                    <div className="font-mono text-xs text-gray-500 mt-0.5">
                      {agent.model === 'openai-gpt4o-mini' ? 'GPT-4o Mini' : 'Claude Haiku'} · {agent.price_xlm} XLM/req · {agent.visibility}
                    </div>
                    {agent.forked_from && (
                      <div className="font-mono text-[10px] text-purple-400 mt-0.5">Forked · ID: {agent.forked_from.slice(0, 8)}…</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm text-[#FFB800]">{(agent.total_earned_xlm ?? 0).toFixed(4)} XLM</div>
                    {xlmPrice && <div className="font-mono text-xs text-gray-500">≈ ${((agent.total_earned_xlm ?? 0) * xlmPrice).toFixed(2)}</div>}
                    <div className="font-mono text-xs text-gray-500">{(agent.total_requests ?? 0).toLocaleString()} requests</div>
                    <button
                      onClick={() => removeAgent(agent)}
                      disabled={deletingAgentId === agent.id}
                      className="mt-2 px-2.5 py-1 text-[10px] font-mono rounded border border-red-700/70 text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {deletingAgentId === agent.id ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
