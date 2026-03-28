'use client';

import { motion } from 'framer-motion';
import TerminalOutput from '@/components/TerminalOutput';

const sdkSnippet = `// AgentForge JavaScript SDK (unofficial)
const AGENTFORGE_BASE = 'https://agentforge.dev';

async function callAgent(agentId, input, walletSigner) {
  const url = \`\${AGENTFORGE_BASE}/api/agents/\${agentId}/run\`;

  // Initial request
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input })
  });

  if (res.status === 402) {
    // Extract payment details
    const amount = res.headers.get('X-Payment-Amount');
    const address = res.headers.get('X-Payment-Address');
    const memo = res.headers.get('X-Payment-Memo');

    // Submit XLM payment
    const txHash = await walletSigner.payXLM(address, amount, memo);

    // Retry with payment proof
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Payment-Tx-Hash': txHash,
        'X-Payment-Wallet': walletSigner.address
      },
      body: JSON.stringify({ input })
    });
  }

  return res.json();
}`;

const webhookSnippet = `// Webhook setup for agent events
// POST /api/webhooks/register
{
  "agent_id": "your-agent-id",
  "url": "https://your-server.com/webhook",
  "events": ["request.completed", "payment.received"]
}

// Webhook payload (request.completed)
{
  "event": "request.completed",
  "agent_id": "abc123",
  "request_id": "req_xyz",
  "input": "user input",
  "output": "agent response",
  "payment_tx_hash": "stellar_tx_hash",
  "latency_ms": 240,
  "timestamp": "2024-01-01T00:00:00Z"
}`;

export default function DevsPage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-syne text-4xl font-bold text-white mb-2">Developer Hub</h1>
          <p className="text-gray-400 font-mono text-sm">
            Quickstart guides, SDK snippets, and webhook documentation.
          </p>
        </motion.div>

        <section>
          <h2 className="font-syne text-2xl font-bold text-white mb-4">JavaScript SDK</h2>
          <TerminalOutput content={sdkSnippet} title="sdk" language="js" />
        </section>

        <section>
          <h2 className="font-syne text-2xl font-bold text-white mb-4">Webhooks</h2>
          <TerminalOutput content={webhookSnippet} title="webhook" language="json" />
        </section>

        <section>
          <h2 className="font-syne text-2xl font-bold text-white mb-4">Environment Variables</h2>
          <div className="space-y-2">
            {[
              { key: 'NEXT_PUBLIC_SUPABASE_URL', desc: 'Your Supabase project URL' },
              { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', desc: 'Supabase anonymous key' },
              { key: 'OPENAI_API_KEY', desc: 'OpenAI API key for GPT-4o Mini' },
              { key: 'ANTHROPIC_API_KEY', desc: 'Anthropic API key for Claude Haiku' },
              { key: 'NEXT_PUBLIC_HORIZON_URL', desc: 'Stellar Horizon URL (testnet/mainnet)' },
            ].map((env) => (
              <div
                key={env.key}
                className="flex items-center justify-between p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]"
              >
                <code className="font-mono text-xs text-[#00FFE5]">{env.key}</code>
                <span className="text-gray-400 text-xs">{env.desc}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="p-6 rounded-2xl border border-[rgba(255,184,0,0.2)] bg-[rgba(255,184,0,0.04)]">
          <h2 className="font-syne text-xl font-bold text-[#FFB800] mb-3">Get Test XLM</h2>
          <p className="text-gray-400 text-sm mb-4">
            Fund your Stellar testnet account using Friendbot:
          </p>
          <code className="font-mono text-sm text-white">
            https://friendbot.stellar.org?addr={'{your_G_address}'}
          </code>
        </section>
      </div>
    </div>
  );
}
