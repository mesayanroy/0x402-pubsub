'use client';

import { motion } from 'framer-motion';
import AgentCard from '@/components/AgentCard';
import { Agent } from '@/types';

const FEATURED: Agent[] = [
  {
    id: '1',
    owner_wallet: 'GABC...XYZ1',
    name: 'DeFi Analyst',
    description: 'Top-ranked DeFi analysis agent with real-time protocol insights.',
    tags: ['web3', 'finance', 'defi'],
    model: 'openai-gpt4o-mini',
    system_prompt: '',
    tools: ['on_chain_data', 'web_search'],
    price_xlm: 0.05,
    visibility: 'public',
    total_requests: 14200,
    total_earned_xlm: 710.0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    owner_wallet: 'GDEF...XYZ2',
    name: 'Code Review Bot',
    description: 'Elite code review agent used by 200+ developers daily.',
    tags: ['dev', 'automation'],
    model: 'anthropic-claude-haiku',
    system_prompt: '',
    tools: ['code_execution'],
    price_xlm: 0.1,
    visibility: 'public',
    total_requests: 8920,
    total_earned_xlm: 892.0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const TRENDING: Agent[] = [
  {
    id: '3',
    owner_wallet: 'GHIJ...XYZ3',
    name: 'Smart Contract Auditor',
    description: 'Trending: Soroban contract vulnerability scanner.',
    tags: ['web3', 'security'],
    model: 'anthropic-claude-haiku',
    system_prompt: '',
    tools: ['code_execution', 'on_chain_data'],
    price_xlm: 0.25,
    visibility: 'public',
    total_requests: 2340,
    total_earned_xlm: 585.0,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

export default function MarketplacePage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-10 space-y-14">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-syne text-4xl font-bold text-white mb-2">Marketplace</h1>
          <p className="text-gray-400 font-mono text-sm">Featured and trending agents on AgentForge.</p>
        </motion.div>

        <section>
          <h2 className="font-syne text-2xl font-bold text-white mb-6">
            ⭐ Featured Agents
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURED.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-syne text-2xl font-bold text-white mb-6">
            🔥 Trending Now
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {TRENDING.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
