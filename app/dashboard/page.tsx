'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Agent } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentRequest {
  id: string;
  agent_id: string;
  caller_wallet: string | null;
  payment_tx_hash: string | null;
  payment_amount_xlm: number;
  tx_explorer_url: string | null;
  protocol: string;
  status: string;
  latency_ms: number;
  created_at: string;
}

interface HourlyMetric {
  hour: string;
  requests: number;
  earned_xlm: number;
}

interface ModelMetric {
  model: string;
  requests: number;
  earned_xlm: number;
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0A0A0F] border border-[rgba(0,255,229,0.2)] rounded-lg p-3 text-xs font-mono">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, unit, delta }: { label: string; value: string | number; unit?: string; delta?: number }) {
  return (
    <div className="p-5 rounded-xl border border-[rgba(0,255,229,0.1)] bg-[rgba(255,255,255,0.02)]">
      <div className="font-syne text-2xl font-bold text-[#00FFE5]">
        {value}{unit ? ` ${unit}` : ''}
      </div>
      <div className="font-mono text-xs text-gray-500 mt-1">{label}</div>
      {delta !== undefined && (
        <div className={`font-mono text-xs mt-1 ${delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% (24h)
        </div>
      )}
    </div>
  );
}

// ─── Transaction row ──────────────────────────────────────────────────────────

function TxRow({ req }: { req: AgentRequest }) {
  const explorerUrl =
    req.tx_explorer_url ||
    (req.payment_tx_hash
      ? `https://stellar.expert/explorer/testnet/tx/${req.payment_tx_hash}`
      : null);

  return (
    <div className="flex items-center justify-between py-3 border-b border-[rgba(255,255,255,0.04)] last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`w-1.5 h-1.5 rounded-full ${req.status === 'success' ? 'bg-green-400' : 'bg-red-400'}`}
          />
          <span className="font-mono text-xs text-white truncate">
            {req.id.slice(0, 12)}…
          </span>
        </div>
        <div className="font-mono text-[10px] text-gray-500 mt-0.5">
          {new Date(req.created_at).toLocaleString()} · {req.latency_ms}ms
        </div>
      </div>

      <div className="flex items-center gap-4 ml-4">
        {req.payment_amount_xlm > 0 ? (
          <span className="font-mono text-xs text-[#FFB800]">
            {req.payment_amount_xlm} XLM
          </span>
        ) : (
          <span className="font-mono text-xs text-gray-600">FREE</span>
        )}

        {explorerUrl ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[10px] text-[#00FFE5] hover:underline flex items-center gap-1"
            title="View on Stellar Expert"
          >
            {req.payment_tx_hash ? `${req.payment_tx_hash.slice(0, 8)}…` : '—'}
            <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : (
          <span className="font-mono text-[10px] text-gray-600">—</span>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [myAgents, setMyAgents] = useState<Agent[]>([]);
  const [recentRequests, setRecentRequests] = useState<AgentRequest[]>([]);
  const [hourlyMetrics, setHourlyMetrics] = useState<HourlyMetric[]>([]);
  const [modelMetrics, setModelMetrics] = useState<ModelMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (addr: string) => {
    try {
      // Fetch my agents
      const agentsRes = await fetch(`/api/agents/list?owner=${addr}`);
      const agentsData = (await agentsRes.json()) as { agents?: Agent[] };
      const agents = agentsData.agents ?? [];
      setMyAgents(agents);

      // Fetch recent requests via server-side API route (uses service-role key)
      const reqRes = await fetch(`/api/dashboard/requests?owner=${addr}&limit=50`);
      if (reqRes.ok) {
        const reqData = (await reqRes.json()) as { requests?: AgentRequest[] };
        const requests = reqData.requests ?? [];
        setRecentRequests(requests);

          // Build hourly metrics (last 24h)
          const now = Date.now();
          const buckets: Record<string, { requests: number; earned_xlm: number }> = {};
          for (let h = 23; h >= 0; h--) {
            const d = new Date(now - h * 3_600_000);
            const key = `${d.getHours().toString().padStart(2, '0')}:00`;
            buckets[key] = { requests: 0, earned_xlm: 0 };
          }
          for (const r of requests) {
            const d = new Date(r.created_at);
            if (now - d.getTime() < 24 * 3_600_000) {
              const key = `${d.getHours().toString().padStart(2, '0')}:00`;
              if (buckets[key]) {
                buckets[key].requests++;
                buckets[key].earned_xlm += r.payment_amount_xlm ?? 0;
              }
            }
          }
          setHourlyMetrics(
            Object.entries(buckets).map(([hour, v]) => ({
              hour,
              requests: v.requests,
              earned_xlm: parseFloat(v.earned_xlm.toFixed(4)),
            }))
          );

          // Build per-model metrics
          const modelMap: Record<string, { requests: number; earned_xlm: number }> = {};
          for (const agent of agents) {
            const model = agent.model === 'openai-gpt4o-mini' ? 'GPT-4o Mini' : 'Claude Haiku';
            if (!modelMap[model]) modelMap[model] = { requests: 0, earned_xlm: 0 };
            modelMap[model].requests += agent.total_requests ?? 0;
            modelMap[model].earned_xlm += agent.total_earned_xlm ?? 0;
          }
          setModelMetrics(
            Object.entries(modelMap).map(([model, v]) => ({
              model,
              requests: v.requests,
              earned_xlm: parseFloat(v.earned_xlm.toFixed(4)),
            }))
          );
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const addr = localStorage.getItem('wallet_address');
    setWalletAddress(addr);
    if (addr) {
      void fetchData(addr);
    } else {
      setLoading(false);
    }
  }, [fetchData]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!walletAddress) return;
    const interval = setInterval(() => void fetchData(walletAddress), 30_000);
    return () => clearInterval(interval);
  }, [walletAddress, fetchData]);

  if (!walletAddress) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-syne text-2xl font-bold text-white mb-3">Connect Your Wallet</h2>
          <p className="text-gray-400 font-mono text-sm">
            Please connect your Freighter wallet to view your dashboard.
          </p>
        </div>
      </div>
    );
  }

  const totalEarned = myAgents.reduce((s, a) => s + (a.total_earned_xlm ?? 0), 0);
  const totalRequests = myAgents.reduce((s, a) => s + (a.total_requests ?? 0), 0);
  const activeAgents = myAgents.filter((a) => a.is_active).length;
  const paidRequests = recentRequests.filter((r) => r.payment_tx_hash).length;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-syne text-4xl font-bold text-white mb-1">Dashboard</h1>
              <p className="font-mono text-xs text-gray-500">{walletAddress}</p>
            </div>
            <button
              onClick={() => void fetchData(walletAddress)}
              className="px-4 py-1.5 text-xs font-mono border border-[rgba(0,255,229,0.2)] text-[#00FFE5] rounded hover:bg-[rgba(0,255,229,0.05)] transition-all"
            >
              ↻ Refresh
            </button>
          </div>

          {loading ? (
            <div className="text-center py-20 font-mono text-sm text-gray-500">Loading…</div>
          ) : (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="My Agents" value={myAgents.length} />
                <StatCard label="Total Earned" value={totalEarned.toFixed(4)} unit="XLM" />
                <StatCard label="Total Requests" value={totalRequests.toLocaleString()} />
                <StatCard label="Active Agents" value={activeAgents} />
              </div>

              {/* Charts row */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Requests over time */}
                <div className="p-5 rounded-xl border border-[rgba(0,255,229,0.08)] bg-[rgba(255,255,255,0.02)]">
                  <h3 className="font-syne text-sm font-bold text-white mb-4">
                    Requests per Hour <span className="text-gray-500 font-normal font-mono text-xs">(last 24h)</span>
                  </h3>
                  {hourlyMetrics.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={hourlyMetrics}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'monospace' }} interval={3} />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'monospace' }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Line
                          type="monotone"
                          dataKey="requests"
                          stroke="#00FFE5"
                          strokeWidth={2}
                          dot={false}
                          name="requests"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[180px] flex items-center justify-center font-mono text-xs text-gray-600">
                      No request data yet
                    </div>
                  )}
                </div>

                {/* Revenue over time */}
                <div className="p-5 rounded-xl border border-[rgba(0,255,229,0.08)] bg-[rgba(255,255,255,0.02)]">
                  <h3 className="font-syne text-sm font-bold text-white mb-4">
                    Revenue per Hour <span className="text-gray-500 font-normal font-mono text-xs">XLM (last 24h)</span>
                  </h3>
                  {hourlyMetrics.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={hourlyMetrics}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'monospace' }} interval={3} />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'monospace' }} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="earned_xlm" fill="#FFB800" name="XLM earned" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[180px] flex items-center justify-center font-mono text-xs text-gray-600">
                      No billing data yet
                    </div>
                  )}
                </div>
              </div>

              {/* Model breakdown */}
              {modelMetrics.length > 0 && (
                <div className="p-5 rounded-xl border border-[rgba(0,255,229,0.08)] bg-[rgba(255,255,255,0.02)]">
                  <h3 className="font-syne text-sm font-bold text-white mb-4">Requests by Model</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={modelMetrics} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'monospace' }} />
                      <YAxis type="category" dataKey="model" tick={{ fill: '#9ca3af', fontSize: 11, fontFamily: 'monospace' }} width={90} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'monospace', color: '#9ca3af' }} />
                      <Bar dataKey="requests" fill="#00FFE5" name="requests" radius={[0, 2, 2, 0]} />
                      <Bar dataKey="earned_xlm" fill="#FFB800" name="XLM earned" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Two-column: Agents + Transactions */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* My Agents */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-syne text-xl font-bold text-white">My Agents</h2>
                    <Link
                      href="/build"
                      className="px-4 py-1.5 text-xs font-mono border border-[#00FFE5] text-[#00FFE5] rounded hover:bg-[#00FFE5] hover:text-black transition-all"
                    >
                      + Deploy New
                    </Link>
                  </div>
                  <div className="space-y-3">
                    {myAgents.length === 0 && (
                      <p className="font-mono text-xs text-gray-600">No agents deployed yet.</p>
                    )}
                    {myAgents.map((agent) => (
                      <div
                        key={agent.id}
                        className="flex items-center justify-between p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(0,255,229,0.15)] transition-all"
                      >
                        <div>
                          <div className="font-syne font-bold text-white">{agent.name}</div>
                          <div className="font-mono text-xs text-gray-500 mt-0.5">
                            {agent.model === 'openai-gpt4o-mini' ? 'GPT-4o Mini' : 'Claude Haiku'} ·{' '}
                            {agent.price_xlm} XLM/req
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm text-[#FFB800]">
                            {(agent.total_earned_xlm ?? 0).toFixed(4)} XLM
                          </div>
                          <div className="font-mono text-xs text-gray-500">
                            {(agent.total_requests ?? 0).toLocaleString()} req
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Transaction Activity */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-syne text-xl font-bold text-white">Transaction Activity</h2>
                    <span className="font-mono text-xs text-gray-500">
                      {paidRequests} paid · {recentRequests.length - paidRequests} free
                    </span>
                  </div>
                  <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-4 max-h-[420px] overflow-y-auto">
                    {recentRequests.length === 0 ? (
                      <p className="font-mono text-xs text-gray-600 text-center py-8">
                        No transactions yet.
                      </p>
                    ) : (
                      recentRequests.map((req) => <TxRow key={req.id} req={req} />)
                    )}
                  </div>
                </div>
              </div>

              {/* Invoice / Billing Summary */}
              <div>
                <h2 className="font-syne text-xl font-bold text-white mb-4">Billing Invoices</h2>
                <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] overflow-hidden">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[rgba(255,255,255,0.06)]">
                        <th className="text-left text-gray-500 px-4 py-3 font-normal">Request ID</th>
                        <th className="text-left text-gray-500 px-4 py-3 font-normal">Date</th>
                        <th className="text-left text-gray-500 px-4 py-3 font-normal">Amount</th>
                        <th className="text-left text-gray-500 px-4 py-3 font-normal">Status</th>
                        <th className="text-left text-gray-500 px-4 py-3 font-normal">Tx Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRequests.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center text-gray-600 py-8">
                            No invoices yet
                          </td>
                        </tr>
                      ) : (
                        recentRequests.slice(0, 20).map((req) => {
                          const explorerUrl =
                            req.tx_explorer_url ||
                            (req.payment_tx_hash
                              ? `https://stellar.expert/explorer/testnet/tx/${req.payment_tx_hash}`
                              : null);
                          return (
                            <tr
                              key={req.id}
                              className="border-b border-[rgba(255,255,255,0.04)] last:border-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                            >
                              <td className="px-4 py-3 text-white">{req.id.slice(0, 12)}…</td>
                              <td className="px-4 py-3 text-gray-400">
                                {new Date(req.created_at).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3">
                                {req.payment_amount_xlm > 0 ? (
                                  <span className="text-[#FFB800]">{req.payment_amount_xlm} XLM</span>
                                ) : (
                                  <span className="text-gray-600">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] ${
                                    req.status === 'success'
                                      ? 'bg-green-900/40 text-green-400'
                                      : 'bg-red-900/40 text-red-400'
                                  }`}
                                >
                                  {req.status}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {explorerUrl && req.payment_tx_hash ? (
                                  <a
                                    href={explorerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#00FFE5] hover:underline flex items-center gap-1"
                                  >
                                    {req.payment_tx_hash.slice(0, 10)}…
                                    <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                  </a>
                                ) : (
                                  <span className="text-gray-600">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
