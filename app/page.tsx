'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const stats = [
  { label: 'Agents Deployed', value: '1,247' },
  { label: 'Total Requests', value: '89,432' },
  { label: 'XLM Earned', value: '12,450' },
  { label: 'Active Builders', value: '342' },
];

const features = [
  {
    icon: '🤖',
    title: 'Build AI Agents',
    desc: 'Create custom AI agents with GPT-4o Mini or Claude Haiku. Set your own system prompt, tools, and pricing.',
  },
  {
    icon: '⛓️',
    title: 'Deploy On-Chain',
    desc: 'Register agents on Stellar via Soroban smart contracts. Every agent gets a unique on-chain identity.',
  },
  {
    icon: '💳',
    title: '0x402 Payments',
    desc: 'Every API call is monetized via the 0x402 protocol. Get paid in XLM per request, automatically.',
  },
  {
    icon: '🔀',
    title: 'Fork & Remix',
    desc: 'Fork any public agent, modify its prompt, and deploy your own version. Build on the community.',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function HomePage() {
  const [typedText, setTypedText] = useState('');
  const fullText = 'Build. Deploy. Monetize.';

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      if (i < fullText.length) {
        setTypedText(fullText.slice(0, i + 1));
        i++;
      } else {
        clearInterval(timer);
      }
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen grid-bg">
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-24 pb-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[rgba(0,255,229,0.2)] bg-[rgba(0,255,229,0.05)] text-[#00FFE5] text-xs font-mono mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FFE5] animate-pulse" />
            Live on Stellar Testnet
          </div>

          <h1 className="font-syne text-5xl md:text-7xl font-bold text-white mb-4 leading-tight">
            AgentForge
          </h1>
          <h2 className="font-mono text-2xl md:text-3xl text-[#00FFE5] mb-6 h-10">
            {typedText}<span className="animate-pulse">_</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            The Web3-native AI agent marketplace on Stellar. Build custom AI agents, monetize every API call
            with the 0x402 payment protocol, and trade agent access on-chain.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/build"
              className="px-8 py-3 font-mono text-sm bg-[#00FFE5] text-black rounded-lg font-bold hover:bg-[#00e6ce] transition-colors"
            >
              Build Your Agent
            </Link>
            <Link
              href="/agents"
              className="px-8 py-3 font-mono text-sm border border-[rgba(0,255,229,0.4)] text-[#00FFE5] rounded-lg hover:bg-[rgba(0,255,229,0.08)] transition-colors"
            >
              Browse Marketplace
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Stats ticker */}
      <section className="border-y border-[rgba(0,255,229,0.08)] bg-[rgba(0,0,0,0.3)] py-4">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-syne text-2xl font-bold text-[#00FFE5]">{stat.value}</div>
                <div className="font-mono text-xs text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <motion.h2
            variants={itemVariants}
            className="font-syne text-3xl font-bold text-white text-center mb-2"
          >
            How It Works
          </motion.h2>
          <motion.p
            variants={itemVariants}
            className="text-gray-500 text-center font-mono text-sm mb-12"
          >
            From idea to on-chain revenue in minutes
          </motion.p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                variants={itemVariants}
                className="p-5 rounded-xl border border-[rgba(0,255,229,0.1)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(0,255,229,0.25)] transition-all"
              >
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-syne font-bold text-white mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
                <div className="mt-3 font-mono text-xs text-[rgba(0,255,229,0.4)]">
                  {String(i + 1).padStart(2, '0')} /
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-2xl border border-[rgba(0,255,229,0.15)] bg-[rgba(0,255,229,0.03)] p-10 text-center"
        >
          <h2 className="font-syne text-3xl font-bold text-white mb-3">
            Ready to build your first agent?
          </h2>
          <p className="text-gray-400 font-mono text-sm mb-8 max-w-lg mx-auto">
            Connect your Freighter wallet, deploy in 3 steps, and start earning XLM per request.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/build"
              className="px-8 py-3 font-mono text-sm bg-[#00FFE5] text-black rounded-lg font-bold hover:bg-[#00e6ce] transition-colors"
            >
              Start Building →
            </Link>
            <Link
              href="/docs"
              className="px-8 py-3 font-mono text-sm border border-[rgba(255,255,255,0.1)] text-gray-400 rounded-lg hover:text-white transition-colors"
            >
              Read the Docs
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
