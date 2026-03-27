'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useMarketplaceFeed } from '@/hooks/useMarketplaceFeed';
import { truncateAddress } from '@/lib/stellar';
import type { MarketplaceActivityEvent } from '@/types/events';

const TYPE_STYLES: Record<MarketplaceActivityEvent['eventType'], string> = {
  agent_run: 'text-[#00FFE5]',
  payment_received: 'text-[#4ade80]',
  new_agent: 'text-[#f59e0b]',
};

const TYPE_BADGES: Record<MarketplaceActivityEvent['eventType'], string> = {
  agent_run: 'bg-[rgba(0,255,229,0.1)] border-[rgba(0,255,229,0.3)] text-[#00FFE5]',
  payment_received: 'bg-[rgba(74,222,128,0.1)] border-[rgba(74,222,128,0.3)] text-[#4ade80]',
  new_agent: 'bg-[rgba(245,158,11,0.1)] border-[rgba(245,158,11,0.3)] text-[#f59e0b]',
};

function formatEventLabel(ev: MarketplaceActivityEvent): string {
  if (ev.eventType === 'new_agent') return 'new_agent';
  if (ev.eventType === 'payment_received') return 'payment_received';
  return 'agent_run';
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.valueOf())) return '--:--:--';
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export default function LiveFeed() {
  const { events, isConnected } = useMarketplaceFeed({ maxEvents: 12 });

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-[rgba(5,5,8,0.85)] backdrop-blur-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#00FFE5] animate-pulse' : 'bg-amber-400'}`} />
          <span className="font-mono text-xs text-white/70">Live Activity</span>
          <span className="font-mono text-[10px] text-white/30 ml-1">ably://marketplace</span>
        </div>
        <span className="font-mono text-[10px] text-white/30">{isConnected ? 'connected' : 'connecting'} · 0x402 · Stellar</span>
      </div>

      {/* Feed rows */}
      <div className="divide-y divide-white/[0.03]">
        {events.length === 0 && (
          <div className="px-5 py-4 font-mono text-xs text-white/40">No activity yet. Run an agent request to see realtime events.</div>
        )}
        <AnimatePresence initial={false}>
          {events.map((ev, idx) => (
            <motion.div
              key={`${ev.timestamp}-${ev.agentId}-${idx}`}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1,  y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors"
            >
              {/* Badge */}
              <span className={`mt-0.5 shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono border uppercase tracking-wide ${TYPE_BADGES[ev.eventType]}`}>
                {ev.eventType.replace('_', '\u00A0')}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`font-mono text-xs font-semibold ${TYPE_STYLES[ev.eventType]}`}>
                    {formatEventLabel(ev)}
                  </span>
                  {typeof ev.priceXlm === 'number' && ev.priceXlm > 0 && (
                    <span className="font-mono text-[10px] text-[#4ade80]">
                      +{ev.priceXlm.toFixed(2)} XLM
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-[10px] text-white/20">
                    {ev.agentName} ({ev.agentId.slice(0, 8)}...)
                  </span>
                  <span className="text-white/10">·</span>
                  <span className="font-mono text-[10px] text-white/20">
                    wallet:{truncateAddress(ev.callerWallet || ev.ownerWallet, 5)}
                  </span>
                  <span className="text-white/10">·</span>
                  <span className="font-mono text-[10px] text-white/20">{formatTime(ev.timestamp)}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
