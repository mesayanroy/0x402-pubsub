'use client';

import { motion } from 'framer-motion';
import TerminalOutput from '@/components/TerminalOutput';

const quickstartCode = `// 1. Install dependencies
npm install @stellar/freighter-api stellar-sdk

// 2. Connect Freighter wallet
import { requestAccess, getPublicKey } from '@stellar/freighter-api';
await requestAccess();
const address = await getPublicKey();

// 3. Call an agent (0x402 flow)
const res = await fetch('https://agentforge.dev/api/agents/{id}/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: 'Analyze ETH/USDC yield' })
});

// 4. Handle 402 Payment Required
if (res.status === 402) {
  const headers = await res.headers;
  // Sign and submit XLM payment
  // Then retry with X-Payment-Tx-Hash header
}`;

const paymentFlowCode = `// 0x402 Payment Flow
// Step 1: Initial request returns 402
// Response headers:
X-Payment-Required: xlm
X-Payment-Amount: 0.05
X-Payment-Address: G...{owner_address}
X-Payment-Network: stellar
X-Payment-Memo: agent:{id}:req:{nonce}

// Step 2: Build and sign payment transaction
const tx = new TransactionBuilder(account, { fee: BASE_FEE })
  .addOperation(Operation.payment({
    destination: ownerAddress,
    asset: Asset.native(),
    amount: '0.05'
  }))
  .addMemo(Memo.text('agent:abc123:req:xyz'))
  .setTimeout(30)
  .build();

const signedXdr = await signTransaction(tx.toXDR(), { networkPassphrase });
const result = await server.submitTransaction(signedTx);

// Step 3: Retry with payment proof
const response = await fetch(agentUrl, {
  method: 'POST',
  headers: {
    'X-Payment-Tx-Hash': result.hash,
    'X-Payment-Wallet': myAddress
  },
  body: JSON.stringify({ input: 'your message' })
});`;

const schemaSQL = `-- Supabase Schema
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  username TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet TEXT NOT NULL REFERENCES users(wallet_address),
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT[],
  model TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  tools JSONB DEFAULT '[]',
  price_xlm NUMERIC(10,4) DEFAULT 0.01,
  visibility TEXT DEFAULT 'public',
  api_endpoint TEXT,
  api_key TEXT,
  soroban_contract_id TEXT,
  total_requests INT DEFAULT 0,
  total_earned_xlm NUMERIC(12,4) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  caller_wallet TEXT,
  input_payload JSONB,
  output_response JSONB,
  payment_tx_hash TEXT,
  payment_amount_xlm NUMERIC(10,4),
  protocol TEXT DEFAULT '0x402',
  status TEXT DEFAULT 'success',
  latency_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);`;

export default function DocsPage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-syne text-4xl font-bold text-white mb-2">Documentation</h1>
          <p className="text-gray-400 font-mono text-sm">
            Everything you need to build with AgentForge and the 0x402 payment protocol.
          </p>
        </motion.div>

        <section>
          <h2 className="font-syne text-2xl font-bold text-white mb-4">Quick Start</h2>
          <TerminalOutput content={quickstartCode} title="quickstart" language="ts" />
        </section>

        <section>
          <h2 className="font-syne text-2xl font-bold text-white mb-3">0x402 Payment Protocol</h2>
          <p className="text-gray-400 text-sm mb-4 leading-relaxed">
            AgentForge uses the 0x402 payment protocol for per-request monetization. When a client
            calls a paid agent endpoint, the server returns HTTP 402 with payment instructions in
            headers. The client signs a Stellar XLM transaction via Freighter and retries with the
            transaction hash.
          </p>
          <TerminalOutput content={paymentFlowCode} title="payment-flow" language="ts" />
        </section>

        <section>
          <h2 className="font-syne text-2xl font-bold text-white mb-4">Database Schema</h2>
          <TerminalOutput content={schemaSQL} title="schema" language="sql" />
        </section>

        <section>
          <h2 className="font-syne text-2xl font-bold text-white mb-4">API Reference</h2>
          <div className="space-y-4">
            {[
              { method: 'POST', path: '/api/agents/create', desc: 'Create and deploy a new agent' },
              { method: 'GET', path: '/api/agents/list', desc: 'List public agents (with optional filters)' },
              { method: 'GET', path: '/api/agents/:id', desc: 'Get agent details by ID' },
              { method: 'POST', path: '/api/agents/:id/run', desc: 'Run agent (0x402 payment required)' },
              { method: 'POST', path: '/api/payment/verify', desc: 'Verify a Stellar payment transaction' },
            ].map((ep) => (
              <div
                key={ep.path}
                className="flex items-center gap-4 p-4 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]"
              >
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded ${
                    ep.method === 'POST'
                      ? 'bg-[rgba(0,255,229,0.12)] text-[#00FFE5]'
                      : 'bg-[rgba(255,184,0,0.12)] text-[#FFB800]'
                  }`}
                >
                  {ep.method}
                </span>
                <code className="font-mono text-sm text-white">{ep.path}</code>
                <span className="text-gray-400 text-sm">{ep.desc}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
