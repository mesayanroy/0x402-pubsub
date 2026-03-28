'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Agent } from '@/types';
import { truncateAddress } from '@/lib/stellar';

interface AgentCardProps {
  agent: Agent;
  onFork?: (agent: Agent) => void;
}

const modelBadgeColor: Record<string, string> = {
  'openai-gpt4o-mini': 'bg-[rgba(0,200,100,0.12)] text-green-400 border-green-900',
  'anthropic-claude-haiku': 'bg-[rgba(255,184,0,0.12)] text-[#FFB800] border-yellow-900',
};

const modelLabel: Record<string, string> = {
  'openai-gpt4o-mini': 'GPT-4o Mini',
  'anthropic-claude-haiku': 'Claude Haiku',
};

export default function AgentCard({ agent, onFork }: AgentCardProps) {
  const safeOwner = agent.owner_wallet || 'Unknown';
  const totalRequests = Number(agent.total_requests ?? 0);
  const priceXlm = Number(agent.price_xlm ?? 0);

  return (
    <motion.div
      whileHover={{ y: -4, boxShadow: '0 0 24px rgba(0,255,229,0.08)' }}
      className="rounded-xl border border-[rgba(0,255,229,0.12)] bg-[rgba(255,255,255,0.03)] p-5 flex flex-col gap-3 cursor-pointer transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-syne font-bold text-white text-lg leading-tight">{agent.name}</h3>
          <p className="text-gray-400 text-sm mt-1 line-clamp-2">{agent.description || 'No description'}</p>
        </div>
        <span
          className={`shrink-0 text-xs font-mono px-2 py-0.5 rounded border ${modelBadgeColor[agent.model] || 'bg-gray-800 text-gray-400 border-gray-700'}`}
        >
          {modelLabel[agent.model] || agent.model}
        </span>
      </div>

      {agent.tags && agent.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs font-mono px-1.5 py-0.5 rounded bg-[rgba(0,255,229,0.06)] text-[#00FFE5] border border-[rgba(0,255,229,0.15)]"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs font-mono text-gray-500 border-t border-[rgba(255,255,255,0.05)] pt-3">
        <span title={safeOwner}>{truncateAddress(safeOwner)}</span>
        <div className="flex items-center gap-3">
          <span>{totalRequests.toLocaleString()} reqs</span>
          <span className="text-[#FFB800]">{priceXlm} XLM/req</span>
        </div>
      </div>

      <div className="flex gap-2 mt-1">
        <Link
          href={`/agents/${agent.id}`}
          className="flex-1 text-center py-1.5 text-xs font-mono border border-[#00FFE5] text-[#00FFE5] rounded hover:bg-[#00FFE5] hover:text-black transition-all"
        >
          Use API
        </Link>
        <button
          onClick={() => onFork?.(agent)}
          className="flex-1 py-1.5 text-xs font-mono border border-[rgba(255,255,255,0.15)] text-gray-400 rounded hover:border-[#FFB800] hover:text-[#FFB800] transition-all"
        >
          Fork
        </button>
      </div>
    </motion.div>
  );
}
