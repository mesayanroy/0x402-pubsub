'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { Agent } from '@/types';
import TerminalOutput from '@/components/TerminalOutput';
import PaymentModal from '@/components/PaymentModal';
import { truncateAddress } from '@/lib/stellar';
import { useMarketplaceFeed } from '@/hooks/useMarketplaceFeed';

const MOCK_AGENT: Agent = {
  id: '1',
  owner_wallet: 'GABC1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234XYZ1',
  name: 'DeFi Analyst',
  description: 'Analyzes DeFi protocols, yields, and on-chain metrics in real time using live blockchain data.',
  tags: ['web3', 'finance', 'defi'],
  model: 'openai-gpt4o-mini',
  system_prompt: 'You are a DeFi analyst...',
  tools: ['on_chain_data', 'web_search'],
  price_xlm: 0.05,
  visibility: 'public',
  api_endpoint: 'https://agentforge.dev/api/agents/1/run',
  total_requests: 1420,
  total_earned_xlm: 71.0,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export default function AgentDetailPage() {
  const { id } = useParams();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [paymentModal, setPaymentModal] = useState(false);
  const [paymentChallenge, setPaymentChallenge] = useState<{
    memo: string;
    address: string;
    amountXlm: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const agentId = Array.isArray(id) ? id[0] : id ?? '';

  // Real-time feed filtered to this agent's activity
  const { events: realtimeEvents, isConnected } = useMarketplaceFeed({ maxEvents: 5 });
  const agentEvents = realtimeEvents.filter((e) => e.agentId === agentId);

  useEffect(() => {
    const fetchAgent = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/agents/${agentId}`);
        if (res.ok) {
          const data = await res.json();
          setAgent(data);
        } else if (res.status === 404) {
          setNotFound(true);
          setAgent(MOCK_AGENT);
        } else {
          setAgent(MOCK_AGENT);
        }
      } catch {
        setAgent(MOCK_AGENT);
      } finally {
        setLoading(false);
      }
    };
    if (agentId) fetchAgent();
  }, [agentId]);

  const runAgent = async (txHash?: string) => {
    setRunning(true);
    setError(null);
    try {
      const walletAddress = localStorage.getItem('wallet_address');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (txHash) {
        headers['X-Payment-Tx-Hash'] = txHash;
        if (walletAddress) headers['X-Payment-Wallet'] = walletAddress;
      }
      const res = await fetch(`/api/agents/${agentId}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (res.status === 402) {
        if (data?.payment_details?.memo && data?.payment_details?.address) {
          setPaymentChallenge({
            memo: data.payment_details.memo,
            address: data.payment_details.address,
            amountXlm: Number(data.payment_details.amount_xlm ?? agent?.price_xlm ?? 0),
          });
        }
        setPaymentModal(true);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setOutput(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500 font-mono text-sm">Loading agent...</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="font-syne text-2xl font-bold text-white mb-3">Agent Not Found</h2>
          <p className="text-gray-400 font-mono text-sm">
            The agent with ID <span className="text-[#00FFE5]">{agentId}</span> does not exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  if (!agent) return null;

  const apiDocsContent = `## Agent API Docs

Endpoint: POST ${agent.api_endpoint || `https://agentforge.dev/api/agents/${agentId}/run`}
Auth: Bearer {your_api_key}
Payment: 0x402 — ${agent.price_xlm} XLM per request

### Request Body
{ "input": "your message to the agent" }

### 0x402 Payment Headers (after 402 response)
X-Payment-Tx-Hash: {stellar_tx_hash}
X-Payment-Wallet: {your_G_address}

### Response
{ 
  "output": "agent response", 
  "request_id": "...", 
  "latency_ms": 230 
}`;

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-syne text-4xl font-bold text-white mb-2">{agent.name}</h1>
              <p className="text-gray-400 max-w-2xl">{agent.description}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {agent.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-mono px-2 py-0.5 rounded bg-[rgba(0,255,229,0.06)] text-[#00FFE5] border border-[rgba(0,255,229,0.15)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-syne font-bold text-[#FFB800]">{agent.price_xlm} XLM</div>
              <div className="text-xs text-gray-500 font-mono">per request</div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Requests', value: agent.total_requests.toLocaleString() },
              { label: 'Total Earned', value: `${agent.total_earned_xlm} XLM` },
              { label: 'Owner', value: truncateAddress(agent.owner_wallet) },
            ].map((stat) => (
              <div
                key={stat.label}
                className="p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] text-center"
              >
                <div className="font-mono text-lg text-[#00FFE5]">{stat.value}</div>
                <div className="font-mono text-xs text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Try it */}
          <div className="p-6 rounded-2xl border border-[rgba(0,255,229,0.12)] bg-[rgba(255,255,255,0.02)]">
            <h2 className="font-syne text-xl font-bold text-white mb-4">Try This Agent</h2>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Enter your message..."
              rows={4}
              className="w-full px-3 py-2.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-[rgba(0,255,229,0.4)] resize-none mb-3"
            />
            {error && (
              <div className="mb-3 p-3 rounded bg-[rgba(255,69,69,0.1)] border border-red-900 text-red-400 text-xs font-mono">
                {error}
              </div>
            )}
            <button
              onClick={() => runAgent()}
              disabled={running || !input}
              className="px-6 py-2.5 font-mono text-sm bg-[#00FFE5] text-black rounded-lg font-bold hover:bg-[#00e6ce] transition-colors disabled:opacity-40"
            >
              {running ? 'Running...' : `Run Agent (${agent.price_xlm} XLM)`}
            </button>
          </div>

          {output && (
            <TerminalOutput content={output} title="response" language="json" />
          )}

          {/* Real-time activity feed for this agent */}
          <div className="rounded-2xl border border-white/[0.06] bg-[rgba(5,5,8,0.85)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#00FFE5] animate-pulse' : 'bg-amber-400'}`} />
                <span className="font-mono text-xs text-white/70">Live Transactions</span>
              </div>
              <span className="font-mono text-[10px] text-white/30">{isConnected ? 'connected' : 'connecting'} · Stellar</span>
            </div>
            <div className="divide-y divide-white/[0.03]">
              {agentEvents.length === 0 ? (
                <div className="px-5 py-4 font-mono text-xs text-white/40">
                  No activity yet for this agent. Run a request to see real-time events.
                </div>
              ) : (
                agentEvents.map((ev, idx) => (
                  <div key={`${ev.timestamp}-${idx}`} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono border uppercase tracking-wide bg-[rgba(0,255,229,0.1)] border-[rgba(0,255,229,0.3)] text-[#00FFE5]">
                        {ev.eventType.replace(/_/g, '\u00A0')}
                      </span>
                      <span className="font-mono text-xs text-white/50">
                        {ev.callerWallet ? truncateAddress(ev.callerWallet) : 'anonymous'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {typeof ev.priceXlm === 'number' && ev.priceXlm > 0 && (
                        <span className="font-mono text-xs text-[#4ade80]">+{ev.priceXlm.toFixed(2)} XLM</span>
                      )}
                      <span className="font-mono text-[10px] text-white/30">
                        {new Date(ev.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* API Docs */}
          <div>
            <h2 className="font-syne text-xl font-bold text-white mb-4">API Documentation</h2>
            <TerminalOutput content={apiDocsContent} title="api-docs" language="md" />
          </div>
        </motion.div>
      </div>

      <PaymentModal
        isOpen={paymentModal}
        onClose={() => setPaymentModal(false)}
        agentId={agent.id}
        agentName={agent.name}
        priceXlm={paymentChallenge?.amountXlm ?? agent.price_xlm}
        ownerAddress={paymentChallenge?.address ?? agent.owner_wallet}
        paymentMemo={paymentChallenge?.memo ?? `agent:${agent.id}`}
        onPaymentSuccess={(txHash) => {
          setPaymentModal(false);
          runAgent(txHash);
        }}
      />
    </div>
  );
}
