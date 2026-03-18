'use client';

import { motion } from 'framer-motion';
import AgentBuilder from '@/components/AgentBuilder';

export default function BuildPage() {
  return (
    <div className="min-h-screen grid-bg">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="font-syne text-4xl font-bold text-white mb-2">Build an Agent</h1>
          <p className="text-gray-400 font-mono text-sm mb-10">
            Deploy your AI agent on Stellar. 3 steps — configure, prompt, deploy.
          </p>
          <AgentBuilder />
        </motion.div>
      </div>
    </div>
  );
}
