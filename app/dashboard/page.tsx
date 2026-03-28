'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Agent } from '@/types';

const MOCK_MY_AGENTS: Agent[] = [
  {
    id: '1',
    owner_wallet: 'GABC1234',
    name: 'DeFi Analyst',
    description: 'Analyzes DeFi protocols',
    tags: ['web3', 'finance'],
    model: 'openai-gpt4o-mini',
    system_prompt: '',
    tools: [],
    price_xlm: 0.05,
    visibility: 'public',
    total_requests: 1420,
    total_earned_xlm: 71.0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export default function DashboardPage() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [myAgents, setMyAgents] = useState<Agent[]>(MOCK_MY_AGENTS);
  const [totalEarned, setTotalEarned] = useState(71.0);

  useEffect(() => {
    const addr = localStorage.getItem('wallet_address');
    setWalletAddress(addr);
    if (addr) {
      fetch(`/api/agents/list?owner=${addr}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.agents?.length) {
            setMyAgents(d.agents);
            setTotalEarned(d.agents.reduce((sum: number, a: Agent) => sum + a.total_earned_xlm, 0));
          }
        })
        .catch(() => {});
    }
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

  const statCards = [
    { label: 'My Agents', value: myAgents.length, unit: '' },
    { label: 'Total Earned', value: totalEarned.toFixed(2), unit: 'XLM' },
    { label: 'Total Requests', value: myAgents.reduce((s, a) => s + a.total_requests, 0).toLocaleString(), unit: '' },
    { label: 'Active Agents', value: myAgents.filter((a) => a.is_active).length, unit: '' },
  ];

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          <div>
            <h1 className="font-syne text-4xl font-bold text-white mb-1">Dashboard</h1>
            <p className="font-mono text-xs text-gray-500">{walletAddress}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map((stat) => (
              <div
                key={stat.label}
                className="p-5 rounded-xl border border-[rgba(0,255,229,0.1)] bg-[rgba(255,255,255,0.02)]"
              >
                <div className="font-syne text-2xl font-bold text-[#00FFE5]">
                  {stat.value}{stat.unit ? ` ${stat.unit}` : ''}
                </div>
                <div className="font-mono text-xs text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

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
              {myAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(0,255,229,0.15)] transition-all"
                >
                  <div>
                    <div className="font-syne font-bold text-white">{agent.name}</div>
                    <div className="font-mono text-xs text-gray-500 mt-0.5">
                      {agent.model === 'openai-gpt4o-mini' ? 'GPT-4o Mini' : 'Claude Haiku'} ·{' '}
                      {agent.price_xlm} XLM/req · {agent.visibility}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm text-[#FFB800]">{agent.total_earned_xlm} XLM</div>
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
