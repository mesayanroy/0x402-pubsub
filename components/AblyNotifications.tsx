'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MarketplaceActivityEvent } from '@/types/events';

interface Notification {
  id: string;
  type: 'agent_run' | 'payment_received' | 'new_agent' | 'a2a' | 'chain';
  title: string;
  body: string;
  timestamp: string;
  txHash?: string;
  amountXlm?: number;
}

const TYPE_COLORS: Record<Notification['type'], string> = {
  agent_run: 'border-l-[#00FFE5] bg-[rgba(0,255,229,0.05)]',
  payment_received: 'border-l-[#4ade80] bg-[rgba(74,222,128,0.05)]',
  new_agent: 'border-l-[#f59e0b] bg-[rgba(245,158,11,0.05)]',
  a2a: 'border-l-[#7b61ff] bg-[rgba(123,97,255,0.05)]',
  chain: 'border-l-[#f87171] bg-[rgba(248,113,113,0.05)]',
};

const TYPE_ICONS: Record<Notification['type'], string> = {
  agent_run: '🤖',
  payment_received: '💰',
  new_agent: '⚡',
  a2a: '🔀',
  chain: '⛓️',
};

export default function AblyNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    let closed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let realtimeRef: any = null;

    async function connect() {
      try {
        const probe = await fetch('/api/ably/token', { method: 'GET' });
        if (!probe.ok) return;
      } catch {
        return;
      }

      const Ably = (await import('ably')).default;
      if (closed) return;

      const realtime = new Ably.Realtime({ authUrl: '/api/ably/token', autoConnect: true });
      realtimeRef = realtime;

      const channel = realtime.channels.get('marketplace');
      channel.subscribe((msg: import('ably').InboundMessage) => {
        const ev = msg.data as MarketplaceActivityEvent;
        const notification: Notification = {
          id: `${Date.now()}-${Math.random()}`,
          type: ev.eventType as Notification['type'],
          title:
            ev.eventType === 'agent_run'
              ? `Agent Executed: ${ev.agentName || ev.agentId}`
              : ev.eventType === 'payment_received'
              ? `Payment Received`
              : `New Agent Deployed`,
          body:
            ev.eventType === 'payment_received'
              ? `+${(ev.priceXlm || 0).toFixed(4)} XLM · ${ev.agentName || ev.agentId}`
              : ev.eventType === 'agent_run'
              ? `Request completed${ev.priceXlm ? ` · ${ev.priceXlm} XLM` : ' · free'}`
              : `${ev.agentName || ev.agentId} is now live`,
          timestamp: ev.timestamp,
          txHash: ev.txHash,
          amountXlm: ev.priceXlm,
        };

        setNotifications((prev) => [notification, ...prev].slice(0, 5));

        // Auto-dismiss after 6 seconds
        setTimeout(() => dismiss(notification.id), 6000);
      });
    }

    void connect();

    return () => {
      closed = true;
      if (realtimeRef && typeof realtimeRef.close === 'function') {
        try { realtimeRef.close(); } catch { /* ignore */ }
      }
    };
  }, [dismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            transition={{ duration: 0.25 }}
            className={`pointer-events-auto w-80 rounded-xl border border-white/[0.08] border-l-4 ${TYPE_COLORS[n.type]} backdrop-blur-xl shadow-2xl p-4 cursor-pointer`}
            onClick={() => dismiss(n.id)}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0">{TYPE_ICONS[n.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-white truncate">{n.title}</p>
                <p className="text-xs text-white/60 mt-0.5 truncate">{n.body}</p>
                {n.txHash && (
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${n.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[#00FFE5] underline mt-1 block"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View on explorer →
                  </a>
                )}
              </div>
              <button
                onClick={() => dismiss(n.id)}
                className="text-white/30 hover:text-white/70 text-xs ml-1"
              >
                ✕
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
