'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AgentCard from '@/components/AgentCard';
import { Agent } from '@/types';

const MOCK_AGENTS: Agent[] = [
  {
    id: '1',
    owner_wallet: 'GABC...XYZ1',
    name: 'DeFi Analyst',
    description: 'Analyzes DeFi protocols, yields, and on-chain metrics in real time.',
    tags: ['web3', 'finance', 'defi'],
    model: 'openai-gpt4o-mini',
    system_prompt: 'You are a DeFi analyst...',
    tools: ['on_chain_data', 'web_search'],
    price_xlm: 0.05,
    visibility: 'public',
    total_requests: 1420,
    total_earned_xlm: 71.0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    owner_wallet: 'GDEF...XYZ2',
    name: 'Code Review Bot',
    description: 'Reviews pull requests, suggests improvements, and detects security issues.',
    tags: ['dev', 'automation', 'code'],
    model: 'anthropic-claude-haiku',
    system_prompt: 'You are a senior code reviewer...',
    tools: ['code_execution'],
    price_xlm: 0.1,
    visibility: 'public',
    total_requests: 892,
    total_earned_xlm: 89.2,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '3',
    owner_wallet: 'GHIJ...XYZ3',
    name: 'Smart Contract Auditor',
    description: 'Audits Soroban smart contracts for vulnerabilities and best practices.',
    tags: ['web3', 'security', 'soroban'],
    model: 'anthropic-claude-haiku',
    system_prompt: 'You are a smart contract security auditor...',
    tools: ['code_execution', 'on_chain_data'],
    price_xlm: 0.25,
    visibility: 'public',
    total_requests: 234,
    total_earned_xlm: 58.5,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAgents = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/agents/list');
        if (res.ok) {
          const data = await res.json();
          if (data.agents?.length) setAgents(data.agents);
        }
      } catch {
        // use mock data
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, []);

  const filtered = agents.filter((a) => {
    const matchSearch =
      !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.description?.toLowerCase().includes(search.toLowerCase()) ||
      a.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    const matchModel = modelFilter === 'all' || a.model === modelFilter;
    return matchSearch && matchModel;
  });

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="font-syne text-4xl font-bold text-white mb-2">Agent Marketplace</h1>
          <p className="text-gray-400 font-mono text-sm mb-8">
            Browse and use deployed AI agents. Pay per request with XLM.
          </p>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-8">
            <input
              type="text"
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-4 py-2.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-[rgba(0,255,229,0.4)]"
            />
            <div className="flex gap-2">
              {['all', 'openai-gpt4o-mini', 'anthropic-claude-haiku'].map((m) => (
                <button
                  key={m}
                  onClick={() => setModelFilter(m)}
                  className={`px-3 py-2 text-xs font-mono rounded-lg border transition-all ${
                    modelFilter === m
                      ? 'border-[#00FFE5] text-[#00FFE5] bg-[rgba(0,255,229,0.08)]'
                      : 'border-[rgba(255,255,255,0.08)] text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {m === 'all' ? 'All Models' : m === 'openai-gpt4o-mini' ? 'GPT-4o Mini' : 'Claude Haiku'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-20 text-gray-500 font-mono">Loading agents...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-500 font-mono">No agents found.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
