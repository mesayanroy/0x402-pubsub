'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import TerminalOutput from '@/components/TerminalOutput';

// ─── Code snippets ─────────────────────────────────────────────────────────────

const sdkSnippet = `// AgentForge JS client — full 0x402 payment flow
import { requestAccess, getPublicKey, signTransaction } from '@stellar/freighter-api';
import { Networks, TransactionBuilder, Operation, Asset, Memo, Server } from 'stellar-sdk';

const HORIZON = 'https://horizon-testnet.stellar.org';
const NETWORK = Networks.TESTNET;

async function callAgent(agentId, input) {
  const walletAddress = await getPublicKey();
  const url = \`/api/agents/\${agentId}/run\`;

  // Step 1: Initial request
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });

  // Step 2: Handle 402 — build & sign payment
  if (res.status === 402) {
    const { payment_details } = await res.json();
    const { amount_xlm, address, memo } = payment_details;

    const server = new Server(HORIZON);
    const account = await server.loadAccount(walletAddress);

    const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: NETWORK })
      .addOperation(Operation.payment({
        destination: address,
        asset: Asset.native(),
        amount: amount_xlm.toFixed(7),
      }))
      .addMemo(Memo.text(memo.slice(0, 28)))
      .setTimeout(30)
      .build();

    const signedXDR = await signTransaction(tx.toXDR(), { networkPassphrase: NETWORK });
    const signed = TransactionBuilder.fromXDR(signedXDR, NETWORK);
    const result = await server.submitTransaction(signed);

    // Step 3: Retry with payment proof
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Tx-Hash': result.hash,
        'X-Payment-Wallet': walletAddress,
      },
      body: JSON.stringify({ input }),
    });
  }

  const { output, request_id, latency_ms } = await res.json();
  console.log(\`[\${request_id}] \${output} (\${latency_ms}ms)\`);
  return output;
}`;

const cliSnippet = `# Install and configure the CLI
git clone https://github.com/your-org/agentforge
cd agentforge
npm install

# Set your Stellar secret key
export STELLAR_AGENT_SECRET=S...yourkey...

# List all agents
npm run cli -- agents list

# Run a paid agent (builds tx + pays automatically)
npm run cli -- agents run abc-123 \
  --input "Summarize today's DeFi yields" \
  --secret $STELLAR_AGENT_SECRET

# Agent-to-Agent (A2A) call
npm run cli -- a2a call agent-1 agent-2 \
  --input "Fetch price data and analyze"

# Check a transaction
npm run cli -- tx status abc123txhash`;

const webhookSnippet = `// QStash webhook handler pattern
// All consumers live at /api/consumers/{topic-slug}

// Example: handle payment_pending
import { createQStashReceiver } from '@/lib/qstash';

export async function POST(req) {
  const receiver = createQStashReceiver();
  const body = await req.text();
  const sig = req.headers.get('upstash-signature');

  const valid = await receiver.verify({
    signature: sig,
    body,
    url: req.url,
  });
  if (!valid) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = JSON.parse(body);
  // process payload…
  return Response.json({ ok: true });
}`;

const a2aSnippet = `// Agent-to-Agent payment flow
// Agent A calls Agent B — payment handled automatically

const { publish, TOPICS } = await import('@/lib/qstash');

await publish(TOPICS.A2A_REQUEST, {
  correlationId: 'corr-abc-123',
  fromAgentId: 'market-analyzer',
  toAgentId:   'price-feed-agent',
  input:       'Get BTC/XLM price for last 24h',
  callerWallet: 'GABC...youragentkey',
  // paymentTxHash is optional — if omitted, target agent handles 402
});

// QStash delivers to /api/consumers/agentforge-a2a-request
// A2A router calls /api/agents/{toAgentId}/run
// Response published to agentforge.a2a.response`;

const envSnippet = `# Required for core functionality
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# AI model backends
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-api03-...

# Stellar network
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_STELLAR_NETWORK=testnet
STELLAR_AGENT_SECRET=C22G2DCY...  # Server / CLI signing key

# QStash for serverless event-driven messaging
QSTASH_TOKEN=eyJVc2VySUQ...
QSTASH_CURRENT_SIGNING_KEY=sig_6eSvX3...
QSTASH_NEXT_SIGNING_KEY=sig_5EmSqiKD...

# Ably for realtime UI updates
ABLY_API_KEY=ROcuyw.LBHhOw:...
NEXT_PUBLIC_ABLY_KEY=ROcuyw.e5IGqA:...

# Deployed URL (required for QStash delivery)
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app`;

// ─── Feature tile ─────────────────────────────────────────────────────────────

function FeatureTile({ icon, title, desc, badge }: { icon: string; title: string; desc: string; badge?: string }) {
  return (
    <div className="p-5 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(0,255,229,0.15)] transition-all">
      <div className="flex items-start justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        {badge && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[rgba(0,255,229,0.1)] text-[#00FFE5]">
            {badge}
          </span>
        )}
      </div>
      <h3 className="font-syne font-bold text-white mb-1">{title}</h3>
      <p className="text-gray-400 text-xs leading-relaxed">{desc}</p>
    </div>
  );
}

// ─── Code tab ─────────────────────────────────────────────────────────────────

function CodeTab({ tabs }: { tabs: Array<{ label: string; content: string; language: string }> }) {
  const [active, setActive] = useState(0);
  return (
    <div className="rounded-xl overflow-hidden border border-[rgba(255,255,255,0.08)]">
      <div className="flex border-b border-[rgba(255,255,255,0.06)] bg-[rgba(0,0,0,0.4)]">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActive(i)}
            className={`px-4 py-2 text-xs font-mono transition-all ${
              active === i
                ? 'text-[#00FFE5] border-b border-[#00FFE5]'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <TerminalOutput content={tabs[active].content} title={tabs[active].label} language={tabs[active].language} />
    </div>
  );
}

// ─── Side nav ────────────────────────────────────────────────────────────────

const NAV = [
  { id: 'intro', label: 'Introduction' },
  { id: 'sdk', label: 'JavaScript SDK' },
  { id: 'cli', label: 'CLI Reference' },
  { id: 'a2a', label: 'A2A Payments' },
  { id: 'qstash', label: 'QStash Webhooks' },
  { id: 'envvars', label: 'Environment' },
  { id: 'limits', label: 'Limits & Pricing' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DevsPage() {
  const [activeSection, setActiveSection] = useState('intro');

  return (
    <div className="min-h-screen flex">
      {/* Side nav */}
      <aside className="hidden lg:block w-56 shrink-0 sticky top-0 h-screen overflow-y-auto py-10 pl-6 pr-4 border-r border-[rgba(255,255,255,0.06)]">
        <p className="font-mono text-[10px] text-gray-600 uppercase tracking-wider mb-4">Developers</p>
        <nav className="space-y-0.5">
          {NAV.map((s) => (
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

        <div className="mt-8 p-3 rounded-lg border border-[rgba(255,184,0,0.2)] bg-[rgba(255,184,0,0.04)]">
          <p className="font-mono text-[10px] text-[#FFB800] font-bold mb-1">Testnet</p>
          <p className="font-mono text-[10px] text-gray-500">All examples use Stellar testnet. Switch STELLAR_NETWORK=mainnet for production.</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 max-w-3xl mx-auto px-6 py-10 space-y-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <span className="text-xs font-mono text-[#FFB800] bg-[rgba(255,184,0,0.08)] px-2 py-0.5 rounded">
            Developer Hub
          </span>
          <h1 className="font-syne text-5xl font-bold text-white mt-3 mb-2">Build on AgentForge</h1>
          <p className="text-gray-400 font-mono text-sm leading-relaxed">
            Everything you need to integrate AI agents with 0x402 payments, build CLI tools, set up
            event-driven pipelines via QStash, and monitor activity in real-time.
          </p>
        </motion.div>

        {/* Feature grid */}
        <div className="grid md:grid-cols-3 gap-4">
          <FeatureTile
            icon="🔗"
            title="0x402 Protocol"
            desc="Pay-per-use AI endpoints with Stellar XLM. No API keys or subscriptions."
            badge="core"
          />
          <FeatureTile
            icon="💳"
            title="Freighter Wallet"
            desc="Browser-native signing. Users authorize each payment transaction directly."
          />
          <FeatureTile
            icon="⚡"
            title="QStash Events"
            desc="Serverless pub-sub via HTTP push. Replace Kafka with zero-ops infrastructure."
          />
          <FeatureTile
            icon="🤖"
            title="A2A Payments"
            desc="Agents can call other agents and pay automatically via the 0x402 flow."
            badge="new"
          />
          <FeatureTile
            icon="💻"
            title="CLI Tool"
            desc="Run agents from the terminal. Auto-signs payments with your Stellar key."
            badge="new"
          />
          <FeatureTile
            icon="📊"
            title="Dashboard"
            desc="Real-time request charts, billing invoices, and Stellar Explorer links."
            badge="new"
          />
        </div>

        {/* JS SDK */}
        <section id="sdk" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            JavaScript SDK
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Use the 0x402 pattern to call any AgentForge agent. The snippet below handles the full
            payment lifecycle — Freighter signing, Horizon submission, and retry with payment proof.
          </p>
          <TerminalOutput content={sdkSnippet} title="agentforge-client.ts" language="ts" />
          <div className="p-4 rounded-lg border border-[rgba(0,255,229,0.1)] bg-[rgba(0,255,229,0.03)] font-mono text-xs">
            <p className="text-[#00FFE5] font-bold mb-2">Response shape</p>
            <pre className="text-gray-400">{"{"} output: string, request_id: string, latency_ms: number {"}"}</pre>
          </div>
        </section>

        {/* CLI */}
        <section id="cli" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            CLI Reference
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            The <code className="text-[#00FFE5]">agentforge</code> CLI is a TypeScript/Node tool that uses
            <code className="text-[#00FFE5] mx-1">commander</code> for argument parsing and{" "}
            <code className="text-[#00FFE5]">stellar-sdk</code> directly for transaction building — perfect
            for server-side automation without a browser.
          </p>
          <TerminalOutput content={cliSnippet} title="terminal" language="bash" />
          <div className="overflow-hidden rounded-xl border border-[rgba(255,255,255,0.06)]">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="bg-[rgba(255,255,255,0.03)]">
                  <th className="text-left text-gray-500 px-4 py-3 font-normal">Command</th>
                  <th className="text-left text-gray-500 px-4 py-3 font-normal">Description</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { cmd: 'agents list', desc: 'List all available agents with pricing info' },
                  { cmd: 'agents run <id> -i "…"', desc: 'Run agent — auto-pays if price > 0 XLM' },
                  { cmd: 'tx status <hash>', desc: 'Check tx confirmation on Horizon' },
                  { cmd: 'tx inspect <hash>', desc: 'Full JSON tx details from Horizon' },
                  { cmd: 'a2a call <from> <to> -i "…"', desc: 'Route request between agents via QStash' },
                ].map((r) => (
                  <tr key={r.cmd} className="border-t border-[rgba(255,255,255,0.04)]">
                    <td className="px-4 py-2.5 text-[#00FFE5]">agentforge {r.cmd}</td>
                    <td className="px-4 py-2.5 text-gray-400">{r.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* A2A */}
        <section id="a2a" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            Agent-to-Agent Payments
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Agents can call other agents as sub-services and pay for them automatically using the 0x402
            protocol. Messages are queued via QStash and delivered asynchronously to{" "}
            <code className="text-[#00FFE5]">/api/consumers/agentforge-a2a-request</code>.
          </p>
          <TerminalOutput content={a2aSnippet} title="a2a-example.ts" language="ts" />
          <div className="p-4 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] font-mono text-xs">
            <p className="text-white font-bold mb-2">A2A Flow</p>
            <div className="flex items-center gap-2 text-gray-400 flex-wrap">
              <span className="px-2 py-1 rounded bg-[rgba(0,255,229,0.08)] text-[#00FFE5]">publish(A2A_REQUEST)</span>
              <span>→</span>
              <span className="px-2 py-1 rounded bg-[rgba(255,255,255,0.05)] text-gray-300">QStash</span>
              <span>→</span>
              <span className="px-2 py-1 rounded bg-[rgba(255,255,255,0.05)] text-gray-300">/api/consumers/a2a-request</span>
              <span>→</span>
              <span className="px-2 py-1 rounded bg-[rgba(255,255,255,0.05)] text-gray-300">/api/agents/{"{id}"}/run</span>
              <span>→</span>
              <span className="px-2 py-1 rounded bg-[rgba(0,255,229,0.08)] text-[#00FFE5]">publish(A2A_RESPONSE)</span>
            </div>
          </div>
        </section>

        {/* QStash */}
        <section id="qstash" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            QStash Webhooks
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            QStash is a serverless message queue that delivers messages via HTTP POST — no polling, no
            brokers. Signatures are verified using <code className="text-[#00FFE5]">QSTASH_CURRENT_SIGNING_KEY</code>{" "}
            to prevent spoofed requests.
          </p>
          <CodeTab
            tabs={[
              { label: 'Webhook handler', content: webhookSnippet, language: 'ts' },
            ]}
          />
          <div className="grid md:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
              <p className="text-white font-bold mb-1">Publish</p>
              <p className="text-gray-400">lib/qstash.ts <br/><code>publish(topic, payload)</code></p>
            </div>
            <div className="p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
              <p className="text-white font-bold mb-1">Consume</p>
              <p className="text-gray-400">Next.js API route<br/><code>/api/consumers/[topic]</code></p>
            </div>
            <div className="p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
              <p className="text-white font-bold mb-1">Verify</p>
              <p className="text-gray-400">QStash Receiver<br/><code>createQStashReceiver()</code></p>
            </div>
          </div>
        </section>

        {/* Env vars */}
        <section id="envvars" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            Environment Variables
          </h2>
          <TerminalOutput content={envSnippet} title=".env.local" language="bash" />
        </section>

        {/* Limits */}
        <section id="limits" className="scroll-mt-20 space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white border-b border-[rgba(255,255,255,0.06)] pb-3">
            Limits & Pricing
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { label: 'Minimum price', value: '0.00001 XLM', note: '= 1 stroop' },
              { label: 'Memo limit', value: '28 bytes', note: 'Stellar memo max' },
              { label: 'Tx timeout', value: '30 seconds', note: 'Payment window' },
              { label: 'Payment wait', value: '2 minutes', note: 'Horizon confirmation' },
              { label: 'Model context', value: '1024 tokens', note: 'GPT-4o-mini & Claude' },
              { label: 'QStash retries', value: '3 attempts', note: 'Exponential backoff' },
            ].map((l) => (
              <div
                key={l.label}
                className="flex items-center justify-between p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]"
              >
                <span className="font-mono text-xs text-gray-400">{l.label}</span>
                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-white">{l.value}</span>
                  <span className="font-mono text-[10px] text-gray-600 block">{l.note}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
