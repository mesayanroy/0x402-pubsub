'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { Agent } from '@/types';
import TerminalOutput from '@/components/TerminalOutput';
import PaymentModal from '@/components/PaymentModal';
import { truncateAddress } from '@/lib/stellar';

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
  const [agent, setAgent] = useState<Agent>(MOCK_AGENT);
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

  useEffect(() => {
    const fetchAgent = async () => {
      try {
        const res = await fetch(`/api/agents/${id}`);
        if (res.ok) {
          const data = await res.json();
          setAgent(data);
        }
      } catch {
        // use mock
      }
    };
    fetchAgent();
  }, [id]);

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
      const res = await fetch(`/api/agents/${id}/run`, {
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
            amountXlm: Number(data.payment_details.amount_xlm ?? agent.price_xlm),
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

  const apiDocsContent = `## Agent API Docs

Endpoint: POST ${agent.api_endpoint || `https://agentforge.dev/api/agents/${id}/run`}
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
