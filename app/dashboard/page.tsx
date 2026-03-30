'use client';

import { useState, useEffect } from 'react';
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

export default function DashboardPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [myAgents, setMyAgents] = useState<Agent[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [xlmPrice, setXlmPrice] = useState<number | null>(null);

  useEffect(() => {
    const addr = localStorage.getItem('wallet_address');
    if (!addr) return;
    setWalletAddress(addr);

    const fetchAll = async () => {
      setLoading(true);
      try {
        const [agentsRes, analyticsRes] = await Promise.all([
          fetch(`/api/agents/list?owner=${encodeURIComponent(addr)}`),
          fetch(`/api/dashboard/analytics?owner=${encodeURIComponent(addr)}&hours=24`),
        ]);
        const agentsData = agentsRes.ok ? await agentsRes.json() : { agents: [] };
        const analyticsData = analyticsRes.ok ? await analyticsRes.json() : EMPTY_ANALYTICS;
        setMyAgents((agentsData as { agents: Agent[] }).agents || []);
        setAnalytics({
          ...EMPTY_ANALYTICS,
          ...(analyticsData || {}),
          totals: { ...EMPTY_ANALYTICS.totals, ...((analyticsData as AnalyticsResponse)?.totals || {}) },
        });
      } catch {
        setMyAgents([]);
        setAnalytics(EMPTY_ANALYTICS);
      } finally {
        setLoading(false);
      }
    };

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

    void fetchAll();
    void fetchXlmPrice();
    const interval = setInterval(fetchAll, 10_000);
    return () => clearInterval(interval);
  }, []);

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

  const freeRequests = (analytics?.totals?.requests ?? 0) - (analytics?.totals?.paidRequests ?? 0);
  const paidRequests = analytics?.totals?.paidRequests ?? 0;

  const tradeTypeData = [
    { name: 'Paid Requests', value: paidRequests },
    { name: 'Free Requests', value: freeRequests },
  ].filter((d) => d.value > 0);

  // Compute cumulative PnL from earnings data
  let cumulative = 0;
  const pnlData = (analytics?.earnings ?? []).map((e) => {
    cumulative += e.amount;
    return { date: e.date, daily: e.amount, cumulative };
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                <span className="font-mono text-[10px] text-gray-500">daily earnings</span>
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
                <p className="font-mono text-sm text-gray-500">No agents deployed yet.</p>
              )}
              {myAgents.map((agent) => (
                <div key={agent.id} className="flex items-center justify-between p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(0,255,229,0.15)] transition-all">
                  <div>
                    <div className="font-syne font-bold text-white">{agent.name}</div>
                    <div className="font-mono text-xs text-gray-500 mt-0.5">
                      {agent.model === 'openai-gpt4o-mini' ? 'GPT-4o Mini' : 'Claude Haiku'} · {agent.price_xlm} XLM/req · {agent.visibility}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm text-[#FFB800]">{agent.total_earned_xlm} XLM</div>
                    {xlmPrice && <div className="font-mono text-xs text-gray-500">≈ ${(agent.total_earned_xlm * xlmPrice).toFixed(2)}</div>}
                    <div className="font-mono text-xs text-gray-500">{agent.total_requests.toLocaleString()} requests</div>
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
