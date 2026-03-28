'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import TerminalOutput from '@/components/TerminalOutput';

// ─── Code snippets ─────────────────────────────────────────────────────────────

const quickstartCode = `# Install CLI
npx agentforge --help

# OR use the SDK directly
npm install @stellar/freighter-api stellar-sdk @upstash/qstash`;

const connectWalletCode = `import { requestAccess, getPublicKey } from '@stellar/freighter-api';

// Connect Freighter wallet
await requestAccess();
const walletAddress = await getPublicKey();
console.log('Connected:', walletAddress);`;

const paymentFlowCode = `// Step 1: Initial request — may return 402
const res = await fetch('/api/agents/{agentId}/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: 'Analyze ETH/USDC yield' })
});

// Step 2: Handle 402 Payment Required
if (res.status === 402) {
  const data = await res.json();
  const { amount_xlm, address, memo } = data.payment_details;

  // Build Stellar payment transaction
  const tx = new TransactionBuilder(account, { fee: '100' })
    .addOperation(Operation.payment({
      destination: address,
      asset: Asset.native(),
      amount: amount_xlm.toFixed(7),
    }))
    .addMemo(Memo.text(memo.slice(0, 28)))
    .setTimeout(30)
    .build();

  // Sign with Freighter wallet (browser) or keypair (CLI)
  const signedXDR = await signTransaction(tx.toXDR(), {
    networkPassphrase: Networks.TESTNET,
  });
  const result = await server.submitTransaction(signed);

  // Step 3: Retry with payment proof
  const paid = await fetch('/api/agents/{agentId}/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Tx-Hash': result.hash,
      'X-Payment-Wallet': walletAddress,
    },
    body: JSON.stringify({ input: 'Analyze ETH/USDC yield' })
  });
  const { output } = await paid.json();
}`;

const cliCode = `# Run CLI
npm run cli -- agents list

# Run an agent (auto-pays with your Stellar secret key)
npm run cli -- agents run <agentId> \
  --input "Analyze the BTC mempool" \
  --secret $STELLAR_AGENT_SECRET

# Check a transaction
npm run cli -- tx status <txHash>

# Agent-to-Agent call (A2A via QStash)
npm run cli -- a2a call <fromId> <toId> --input "Summarize market data"`;

const qstashCode = `# QStash replaces Kafka — messages are delivered via HTTP push

# Publish a message (from your Next.js API)
import { publish, TOPICS } from '@/lib/qstash';

await publish(TOPICS.A2A_REQUEST, {
  correlationId: 'abc-123',
  fromAgentId: 'agent-1',
  toAgentId: 'agent-2',
  input: 'analyze this data',
  callerWallet: 'GABC...',
});

# QStash delivers to:
# POST /api/consumers/agentforge-a2a-request
# with signature verification via QSTASH_CURRENT_SIGNING_KEY`;

const schemaSQL = `-- Core tables

CREATE TABLE agents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_wallet     TEXT NOT NULL,
  name             TEXT NOT NULL,
  model            TEXT NOT NULL,            -- openai-gpt4o-mini | anthropic-claude-haiku
  system_prompt    TEXT NOT NULL,
  price_xlm        NUMERIC(10,4) DEFAULT 0.01,
  total_requests   INT DEFAULT 0,
  total_earned_xlm NUMERIC(12,4) DEFAULT 0,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id             UUID NOT NULL REFERENCES agents(id),
  caller_wallet        TEXT,
  payment_tx_hash      TEXT,
  payment_amount_xlm   NUMERIC(10,4),
  tx_explorer_url      TEXT,                  -- https://stellar.expert/explorer/...
  protocol             TEXT DEFAULT '0x402',
  status               TEXT DEFAULT 'success',
  latency_ms           INT,
  created_at           TIMESTAMPTZ DEFAULT now()
);`;

// ─── Workflow diagram (SVG) ──────────────────────────────────────────────────

function WorkflowDiagram() {
  const steps = [
    { id: 1, label: 'Client', sublabel: 'Browser / CLI', color: '#00FFE5' },
    { id: 2, label: 'POST /run', sublabel: '402 + payment_details', color: '#FFB800' },
    { id: 3, label: 'Freighter', sublabel: 'Sign XLM tx', color: '#a78bfa' },
    { id: 4, label: 'Horizon', sublabel: 'Submit tx', color: '#34d399' },
    { id: 5, label: 'Retry /run', sublabel: 'X-Payment-Tx-Hash', color: '#00FFE5' },
    { id: 6, label: 'QStash', sublabel: 'Publish events', color: '#f97316' },
    { id: 7, label: 'AI Model', sublabel: 'GPT / Claude', color: '#ec4899' },
    { id: 8, label: 'Response', sublabel: 'output + tx sig', color: '#00FFE5' },
  ];

  return (
    <div className="my-6 overflow-x-auto">
      <div className="flex items-center gap-0 min-w-max">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center text-[10px] font-mono font-bold text-center border"
                style={{
                  borderColor: `${step.color}40`,
                  backgroundColor: `${step.color}10`,
                  color: step.color,
                }}
              >
                {step.label}
              </div>
              <div className="text-[9px] font-mono text-gray-500 mt-1 text-center max-w-[72px] leading-tight">
                {step.sublabel}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="flex items-center -mt-4">
                <div className="w-6 h-px bg-[rgba(255,255,255,0.15)]" />
                <svg className="w-2 h-2 text-gray-600" fill="currentColor" viewBox="0 0 8 8">
                  <polygon points="0,0 8,4 0,8" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Architecture diagram ────────────────────────────────────────────────────

function ArchDiagram() {
  return (
    <div className="my-4 p-5 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.4)] font-mono text-xs overflow-x-auto">
      <pre className="text-gray-300 leading-relaxed">{`
  ┌─────────────────────────────────────────────────────────────────┐
  │                      AgentForge Platform                        │
  │                                                                 │
  │  Browser/CLI                                                    │
  │    │  POST /api/agents/{id}/run                                 │
  │    │       │                                                    │
  │    │  ◄── 402 Payment Required ──────────────────────┐         │
  │    │       (amount, address, memo)                   │         │
  │    │                                                 │         │
  │    ▼  Freighter signs XLM tx                        │         │
  │    │  POST to Stellar Horizon                        │         │
  │    │  ◄── tx hash ──────────────────────────────────┘         │
  │    │                                                            │
  │    │  Retry POST /run + X-Payment-Tx-Hash header               │
  │    │       │                                                    │
  │    │  Verify tx on Horizon  ──►  Publish to QStash             │
  │    │                                      │                    │
  │    │                                      ▼                    │
  │    │                          /api/consumers/{topic}           │
  │    │                          (PaymentVerifier → AgentExecutor │
  │    │                           → BillingAggregator → Ably)     │
  │    │                                                            │
  │    │  ◄── { output, request_id, tx_explorer_url } ─────────── │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘
`}</pre>
    </div>
  );
}

// ─── Side nav ────────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'quickstart', label: 'Quick Start' },
  { id: 'wallet', label: 'Wallet Setup' },
  { id: 'protocol', label: '0x402 Protocol' },
  { id: 'cli', label: 'CLI Tool' },
  { id: 'qstash', label: 'QStash Messaging' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'schema', label: 'Database Schema' },
  { id: 'api', label: 'API Reference' },
  { id: 'envvars', label: 'Environment Variables' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview');

  return (
    <div className="min-h-screen flex">
      {/* Side nav */}
      <aside className="hidden lg:block w-56 shrink-0 sticky top-0 h-screen overflow-y-auto py-10 pl-6 pr-4 border-r border-[rgba(255,255,255,0.06)]">
        <p className="font-mono text-[10px] text-gray-600 uppercase tracking-wider mb-4">Docs</p>
        <nav className="space-y-0.5">
          {NAV_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setActiveSection(s.id)}
              className={`block px-3 py-1.5 rounded text-xs font-mono transition-all ${
                activeSection === s.id
                  ? 'bg-[rgba(0,255,229,0.08)] text-[#00FFE5]'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 max-w-3xl mx-auto px-6 py-10 space-y-14">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <span className="text-xs font-mono text-[#00FFE5] bg-[rgba(0,255,229,0.08)] px-2 py-0.5 rounded">
            Documentation
          </span>
          <h1 className="font-syne text-5xl font-bold text-white mt-3 mb-2">AgentForge Docs</h1>
          <p className="text-gray-400 font-mono text-sm leading-relaxed">
            Everything you need to build, deploy and monetize AI agents with the 0x402 Stellar payment protocol.
          </p>
        </motion.div>

        {/* Overview */}
        <section id="overview" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            Overview
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            AgentForge is a Web3-native AI agent marketplace and builder on the Stellar blockchain.
            Every request to a paid agent is metered via the <strong className="text-white">0x402 protocol</strong> — the client
            pays XLM directly from their Freighter wallet, the transaction is verified on-chain, and the
            AI response is streamed back with a unique transaction signature that can be inspected on Stellar Expert.
          </p>
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            {[
              { icon: '⚡', title: 'Per-request billing', desc: 'Pay only when you use an agent. No subscriptions.' },
              { icon: '🔐', title: 'Self-custodial', desc: 'Your private key never leaves Freighter.' },
              { icon: '📡', title: 'Real-time events', desc: 'QStash + Ably for serverless pub-sub.' },
            ].map((f) => (
              <div key={f.title} className="p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
                <div className="text-2xl mb-2">{f.icon}</div>
                <div className="font-syne font-bold text-white text-sm mb-1">{f.title}</div>
                <div className="text-gray-400 text-xs">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Start */}
        <section id="quickstart" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            Quick Start
          </h2>
          <p className="text-gray-400 text-sm">Install the CLI and run your first agent in seconds:</p>
          <TerminalOutput content={quickstartCode} title="terminal" language="bash" />
          <div className="p-4 rounded-lg border border-[rgba(255,184,0,0.2)] bg-[rgba(255,184,0,0.04)]">
            <p className="font-mono text-xs text-[#FFB800]">
              ⚠ Prerequisites: Node.js 18+, Freighter browser extension (for UI), or a Stellar keypair (for CLI)
            </p>
          </div>
        </section>

        {/* Wallet Setup */}
        <section id="wallet" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            Wallet Setup
          </h2>
          <p className="text-gray-400 text-sm">
            AgentForge integrates with <strong className="text-white">Freighter</strong> — the Stellar browser wallet.
            Every payment transaction is built client-side, signed by Freighter, and submitted to Horizon.
            Your private key never leaves your browser.
          </p>
          <TerminalOutput content={connectWalletCode} title="wallet.ts" language="ts" />
          <div className="grid md:grid-cols-2 gap-3 mt-2">
            <div className="p-3 rounded-lg border border-[rgba(0,255,229,0.1)] bg-[rgba(0,255,229,0.03)] font-mono text-xs">
              <p className="text-[#00FFE5] font-bold mb-1">Browser</p>
              <p className="text-gray-400">Freighter extension signs via <code>signTransaction(xdr)</code></p>
            </div>
            <div className="p-3 rounded-lg border border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.03)] font-mono text-xs">
              <p className="text-purple-400 font-bold mb-1">CLI / Server</p>
              <p className="text-gray-400">Uses <code>Keypair.fromSecret(STELLAR_AGENT_SECRET)</code></p>
            </div>
          </div>
        </section>

        {/* 0x402 Protocol */}
        <section id="protocol" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            0x402 Payment Protocol
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            The 0x402 protocol is a standard HTTP flow for pay-per-use APIs. When a client calls a paid
            endpoint without a payment proof, the server responds with <code className="text-[#00FFE5]">HTTP 402 Payment Required</code>{" "}
            and payment metadata in the response body and headers. The client builds a Stellar transaction,
            signs it (Freighter or keypair), submits it, and retries with the transaction hash.
          </p>
          <h3 className="font-syne text-lg font-bold text-white mt-2">Protocol Flow</h3>
          <WorkflowDiagram />
          <TerminalOutput content={paymentFlowCode} title="payment-flow.ts" language="ts" />
          <div className="space-y-2 mt-2">
            {[
              { header: 'X-Payment-Required', value: 'xlm', desc: 'Currency required' },
              { header: 'X-Payment-Amount', value: '0.05', desc: 'Amount in XLM' },
              { header: 'X-Payment-Address', value: 'G…owner', desc: 'Destination address' },
              { header: 'X-Payment-Memo', value: 'agent:{id}:req:{nonce}', desc: 'Memo (max 28 bytes)' },
            ].map((h) => (
              <div key={h.header} className="flex items-center gap-3 font-mono text-xs">
                <code className="text-[#00FFE5] w-40 shrink-0">{h.header}</code>
                <code className="text-[#FFB800] w-32 shrink-0">{h.value}</code>
                <span className="text-gray-500">{h.desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* CLI */}
        <section id="cli" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            CLI Tool
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            The AgentForge CLI lets you run agents, inspect transactions and manage A2A payment flows
            directly from the terminal — no browser required. Payments are built and signed using your
            <code className="text-[#00FFE5] mx-1">STELLAR_AGENT_SECRET</code> environment variable.
          </p>
          <TerminalOutput content={cliCode} title="terminal" language="bash" />
          <div className="p-4 rounded-lg border border-[rgba(0,255,229,0.1)] bg-[rgba(0,255,229,0.03)] font-mono text-xs">
            <p className="text-[#00FFE5] font-bold mb-2">CLI Commands</p>
            <div className="space-y-1 text-gray-400">
              <p><code>agentforge agents list</code> — List all available agents</p>
              <p><code>agentforge agents run &lt;id&gt; -i &quot;…&quot;</code> — Run agent with auto-payment</p>
              <p><code>agentforge tx status &lt;hash&gt;</code> — Check tx on Horizon</p>
              <p><code>agentforge tx inspect &lt;hash&gt;</code> — Full tx details</p>
              <p><code>agentforge a2a call &lt;from&gt; &lt;to&gt; -i &quot;…&quot;</code> — A2A routing via QStash</p>
            </div>
          </div>
        </section>

        {/* QStash */}
        <section id="qstash" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            QStash Messaging
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            AgentForge uses <strong className="text-white">Upstash QStash</strong> for event-driven messaging between
            services — replacing Kafka with a serverless HTTP-push model. Publishers call{" "}
            <code className="text-[#00FFE5]">publish(topic, payload)</code> and QStash delivers to
            <code className="text-[#00FFE5] ml-1">/api/consumers/{"{topic}"}</code> with signature verification.
          </p>
          <TerminalOutput content={qstashCode} title="qstash-example.ts" language="ts" />
          <div className="grid md:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] font-mono text-xs">
              <p className="text-white font-bold mb-2">Topics</p>
              <div className="space-y-1 text-gray-500">
                <p className="text-[#00FFE5]">agentforge.payment.pending</p>
                <p className="text-[#00FFE5]">agentforge.payment.confirmed</p>
                <p className="text-[#00FFE5]">agentforge.agent.completed</p>
                <p className="text-[#00FFE5]">agentforge.billing.updated</p>
                <p className="text-[#00FFE5]">agentforge.a2a.request</p>
                <p className="text-[#00FFE5]">agentforge.a2a.response</p>
              </div>
            </div>
            <div className="p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] font-mono text-xs">
              <p className="text-white font-bold mb-2">Env Variables</p>
              <div className="space-y-1 text-gray-500">
                <p>QSTASH_URL</p>
                <p>QSTASH_TOKEN</p>
                <p>QSTASH_CURRENT_SIGNING_KEY</p>
                <p>QSTASH_NEXT_SIGNING_KEY</p>
                <p className="text-gray-600 text-[10px] mt-2">Delivered to: /api/consumers/{"{topic-slug}"}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Architecture */}
        <section id="architecture" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            Architecture
          </h2>
          <p className="text-gray-400 text-sm">Full system architecture showing all components:</p>
          <ArchDiagram />
        </section>

        {/* Schema */}
        <section id="schema" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            Database Schema
          </h2>
          <TerminalOutput content={schemaSQL} title="schema.sql" language="sql" />
        </section>

        {/* API Reference */}
        <section id="api" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            API Reference
          </h2>
          <div className="space-y-3">
            {[
              { method: 'POST', path: '/api/agents/create', desc: 'Create and deploy a new agent', auth: false },
              { method: 'GET', path: '/api/agents/list', desc: 'List public agents (owner, model, tag filters)', auth: false },
              { method: 'GET', path: '/api/agents/:id', desc: 'Get agent details by ID', auth: false },
              { method: 'POST', path: '/api/agents/:id/run', desc: 'Run agent — returns 402 if payment required', auth: true },
              { method: 'POST', path: '/api/payment/verify', desc: 'Verify a Stellar payment transaction', auth: false },
              { method: 'POST', path: '/api/consumers/:topic', desc: 'QStash webhook endpoint (internal)', auth: true },
              { method: 'POST', path: '/api/ably/token', desc: 'Generate Ably auth token for realtime', auth: false },
            ].map((ep) => (
              <div
                key={ep.path}
                className="flex items-start gap-3 p-4 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]"
              >
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded shrink-0 mt-0.5 ${
                    ep.method === 'POST'
                      ? 'bg-[rgba(0,255,229,0.12)] text-[#00FFE5]'
                      : 'bg-[rgba(255,184,0,0.12)] text-[#FFB800]'
                  }`}
                >
                  {ep.method}
                </span>
                <div className="flex-1 min-w-0">
                  <code className="font-mono text-sm text-white">{ep.path}</code>
                  <p className="text-gray-400 text-xs mt-0.5">{ep.desc}</p>
                </div>
                {ep.auth && (
                  <span className="text-[10px] font-mono text-purple-400 shrink-0">0x402</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Environment Variables */}
        <section id="envvars" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            Environment Variables
          </h2>
          <div className="rounded-xl border border-[rgba(255,255,255,0.06)] overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-[rgba(255,255,255,0.03)]">
                  <th className="text-left text-gray-500 px-4 py-3 font-normal">Variable</th>
                  <th className="text-left text-gray-500 px-4 py-3 font-normal">Required</th>
                  <th className="text-left text-gray-500 px-4 py-3 font-normal">Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: 'NEXT_PUBLIC_SUPABASE_URL', req: true, desc: 'Supabase project URL' },
                  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', req: true, desc: 'Supabase anon key' },
                  { name: 'SUPABASE_SERVICE_ROLE_KEY', req: true, desc: 'Supabase service role (server only)' },
                  { name: 'OPENAI_API_KEY', req: false, desc: 'OpenAI key for GPT-4o-mini agents' },
                  { name: 'ANTHROPIC_API_KEY', req: false, desc: 'Anthropic key for Claude Haiku agents' },
                  { name: 'STELLAR_AGENT_SECRET', req: false, desc: 'Stellar secret key for CLI / server payments' },
                  { name: 'QSTASH_TOKEN', req: false, desc: 'Upstash QStash token for event publishing' },
                  { name: 'QSTASH_CURRENT_SIGNING_KEY', req: false, desc: 'QStash webhook signature verification' },
                  { name: 'QSTASH_NEXT_SIGNING_KEY', req: false, desc: 'QStash webhook rotation key' },
                  { name: 'ABLY_API_KEY', req: false, desc: 'Ably server key for realtime publishing' },
                  { name: 'NEXT_PUBLIC_ABLY_KEY', req: false, desc: 'Ably subscribe-only key (browser)' },
                  { name: 'NEXT_PUBLIC_APP_URL', req: false, desc: 'Deployed URL for QStash webhook delivery' },
                ].map((v) => (
                  <tr key={v.name} className="border-t border-[rgba(255,255,255,0.04)]">
                    <td className="px-4 py-2.5 text-[#00FFE5]">{v.name}</td>
                    <td className="px-4 py-2.5">
                      <span className={v.req ? 'text-green-400' : 'text-gray-600'}>
                        {v.req ? 'yes' : 'no'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400">{v.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
