'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import AgentCard from '@/components/AgentCard';
import { Agent } from '@/types';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [removingAgentId, setRemovingAgentId] = useState<string | null>(null);

  useEffect(() => {
    setWalletAddress(localStorage.getItem('wallet_address') || '');
  }, []);

  useEffect(() => {
    const fetchAgents = async () => {
      setLoading(true);
      setApiError(null);
      try {
        const res = await fetch('/api/agents/list');
        const data = await res.json();
        if (res.ok) {
          setAgents(Array.isArray(data.agents) ? data.agents : []);
        } else {
          setAgents([]);
          setApiError(data.error || 'Failed to load agents');
        }
      } catch {
        setAgents([]);
        setApiError('Unable to reach agents API');
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

  const removeAgent = async (agent: Agent) => {
    if (!walletAddress || walletAddress !== agent.owner_wallet || removingAgentId) return;
    const ok = window.confirm(`Remove agent \"${agent.name}\" from active listings?`);
    if (!ok) return;

    setRemovingAgentId(agent.id);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove agent');
      }
      setAgents((prev) => prev.filter((a) => a.id !== agent.id));
    } catch (err) {
      setApiError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingAgentId(null);
    }
  };

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
          ) : apiError ? (
            <div className="text-center py-20 font-mono">
              <p className="text-red-400">{apiError}</p>
              <p className="text-gray-500 text-sm mt-2">Check Supabase environment variables and database connectivity.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-gray-500 font-mono">No agents found.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((agent) => (
                <div key={agent.id} className="space-y-2">
                  <AgentCard agent={agent} />
                  {walletAddress && walletAddress === agent.owner_wallet && (
                    <button
                      onClick={() => removeAgent(agent)}
                      disabled={removingAgentId === agent.id}
                      className="w-full py-1.5 text-xs font-mono border border-red-700/70 text-red-300 rounded hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {removingAgentId === agent.id ? 'Removing...' : 'Remove Agent'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
