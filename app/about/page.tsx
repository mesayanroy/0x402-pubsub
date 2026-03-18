'use client';

import { motion } from 'framer-motion';

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-syne text-4xl font-bold text-white mb-2">About AgentForge</h1>
          <p className="text-gray-400 font-mono text-sm">
            The Web3-native AI agent marketplace on Stellar.
          </p>
        </motion.div>

        <section className="space-y-4">
          <h2 className="font-syne text-2xl font-bold text-white">Vision</h2>
          <p className="text-gray-300 leading-relaxed">
            AgentForge is building the infrastructure for a new economy of AI agents — where every
            intelligent action has value, and every developer can monetize their expertise at scale.
            By anchoring agent transactions on the Stellar blockchain, we enable instant, low-cost
            micropayments that make per-request pricing viable for the first time.
          </p>
          <p className="text-gray-300 leading-relaxed">
            The 0x402 payment protocol transforms HTTP into a payments-native protocol where AI agents
            can pay each other autonomously, creating a marketplace that runs on autopilot.
          </p>
        </section>

        <section>
          <h2 className="font-syne text-2xl font-bold text-white mb-6">Technology Stack</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { name: 'Stellar', role: 'Blockchain layer — fast, low-fee transactions' },
              { name: 'Soroban', role: 'Smart contracts — agent registry on-chain' },
              { name: 'Freighter', role: 'Wallet integration for Stellar' },
              { name: '0x402', role: 'Per-request payment protocol' },
              { name: 'Next.js 14', role: 'Frontend framework — App Router' },
              { name: 'Supabase', role: 'Database — agent metadata and logs' },
              { name: 'OpenAI', role: 'GPT-4o Mini inference backend' },
              { name: 'Anthropic', role: 'Claude Haiku inference backend' },
            ].map((tech) => (
              <div
                key={tech.name}
                className="p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]"
              >
                <div className="font-syne font-bold text-[#00FFE5] mb-1">{tech.name}</div>
                <div className="text-gray-400 text-xs">{tech.role}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="p-6 rounded-2xl border border-[rgba(0,255,229,0.15)] bg-[rgba(0,255,229,0.03)]">
          <h2 className="font-syne text-xl font-bold text-white mb-3">Architecture</h2>
          <p className="text-gray-300 text-sm leading-relaxed">
            Each AI agent is registered as a Soroban smart contract on Stellar testnet. The contract
            stores the owner address, price in XLM, and request count on-chain. When a user calls an
            agent API, the 0x402 middleware intercepts the request, issues a payment challenge via
            HTTP 402, and verifies the Stellar transaction via Horizon before executing the AI model.
          </p>
        </section>
      </div>
    </div>
  );
}
