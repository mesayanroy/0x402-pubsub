'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [strategyFile, setStrategyFile] = useState<File | null>(null);
  const [strategyNotes, setStrategyNotes] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const safeOwner = agent.owner_wallet || 'Unknown';
  const totalRequests = Number(agent.total_requests ?? 0);
  const priceXlm = Number(agent.price_xlm ?? 0);

  const handleSaveStrategy = () => {
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      setShowStrategyModal(false);
      setStrategyFile(null);
      setStrategyNotes('');
    }, 1500);
  };

  return (
    <>
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
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-gradient-to-br from-[#00FFE5] to-[#FFB800] flex items-center justify-center text-[8px] text-black font-bold shrink-0">
            {safeOwner.slice(1, 2)}
          </span>
          <a
            href={`/dashboard?wallet=${safeOwner}`}
            title={`Owner: ${safeOwner}`}
            className="hover:text-[#00FFE5] transition-colors truncate max-w-[90px]"
            onClick={(e) => e.stopPropagation()}
          >
            {truncateAddress(safeOwner)}
          </a>
        </div>
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
        <button
          onClick={(e) => { e.stopPropagation(); setShowStrategyModal(true); }}
          className="flex-1 py-1.5 text-xs font-mono border border-[rgba(0,255,229,0.2)] text-[#00FFE5] rounded hover:bg-[rgba(0,255,229,0.1)] transition-all"
        >
          Strategy
        </button>
      </div>
    </motion.div>

    <AnimatePresence>
      {showStrategyModal && (
        <motion.div
          key="strategy-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          onClick={() => setShowStrategyModal(false)}
        >
          <motion.div
            key="strategy-modal"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md rounded-xl border border-[rgba(0,255,229,0.25)] bg-[#0d1117] p-6 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-syne font-bold text-[#00FFE5] text-lg">Upload Strategy</h2>
              <button
                onClick={() => setShowStrategyModal(false)}
                className="text-gray-500 hover:text-white text-lg leading-none transition-colors"
              >
                ✕
              </button>
            </div>

            <div
              role="button"
              tabIndex={0}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[rgba(0,255,229,0.25)] bg-[rgba(0,255,229,0.03)] py-8 px-4 cursor-pointer hover:border-[rgba(0,255,229,0.5)] transition-all"
              onClick={() => document.getElementById(`strategy-file-${agent.id}`)?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') document.getElementById(`strategy-file-${agent.id}`)?.click(); }}
            >
              <span className="text-2xl">📄</span>
              <p className="text-xs font-mono text-gray-400 text-center">
                {strategyFile ? strategyFile.name : 'Drag & drop or click to upload'}
              </p>
              <p className="text-[10px] font-mono text-gray-600">.json, .txt, .md, .yaml</p>
              <input
                id={`strategy-file-${agent.id}`}
                type="file"
                accept=".json,.txt,.md,.yaml,.yml"
                className="hidden"
                onChange={(e) => setStrategyFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5">Strategy Notes / Prompt Customization</label>
              <textarea
                value={strategyNotes}
                onChange={(e) => setStrategyNotes(e.target.value)}
                placeholder="Add custom instructions or strategy notes for this agent..."
                rows={4}
                className="w-full px-3 py-2.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-[rgba(0,255,229,0.4)] resize-none"
              />
            </div>

            {saveSuccess && (
              <p className="text-xs font-mono text-[#00FFE5] text-center">✓ Strategy saved successfully!</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowStrategyModal(false)}
                className="flex-1 py-2.5 text-xs font-mono border border-[rgba(255,255,255,0.1)] text-gray-400 rounded-lg hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStrategy}
                className="flex-1 py-2.5 text-xs font-mono bg-[#00FFE5] text-black rounded-lg font-bold hover:bg-[#00e6ce] transition-colors"
              >
                Save Strategy
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
