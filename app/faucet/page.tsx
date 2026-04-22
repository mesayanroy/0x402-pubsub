'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

const AF_TOKEN_CONTRACT = process.env.NEXT_PUBLIC_AF_TOKEN_CONTRACT_ID || '';
const FAUCET_AMOUNT = 5000;
const MAX_CLAIMS = 3;

export default function FaucetPage() {
  const [walletAddress, setWalletAddress] = useState('');
  const [claimsRemaining, setClaimsRemaining] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'claiming' | 'success' | 'error'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [totalClaimed, setTotalClaimed] = useState(0);

  async function checkClaims() {
    if (!walletAddress.trim() || walletAddress.length < 56) return;
    setStatus('checking');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/faucet/claims?wallet=${encodeURIComponent(walletAddress.trim())}`);
      const data = await res.json() as { claimsRemaining: number; totalClaimed: number; error?: string };
      if (data.error) throw new Error(data.error);
      setClaimsRemaining(data.claimsRemaining);
      setTotalClaimed(data.totalClaimed || 0);
      setStatus('idle');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to check claims');
      setStatus('error');
    }
  }

  async function claimTokens() {
    if (!walletAddress.trim()) return;
    setStatus('claiming');
    setErrorMsg('');
    try {
      const res = await fetch('/api/faucet/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: walletAddress.trim() }),
      });
      const data = await res.json() as { txHash?: string; claimsRemaining?: number; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Claim failed');
      setTxHash(data.txHash || null);
      setClaimsRemaining(data.claimsRemaining ?? null);
      setStatus('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Claim failed');
      setStatus('error');
    }
  }

  return (
    <main className="min-h-screen bg-[#050508] text-white py-20 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[rgba(0,255,229,0.2)] bg-[rgba(0,255,229,0.05)] mb-6">
            <span className="text-[#00FFE5] text-sm font-mono">AF$ Faucet</span>
            <span className="w-2 h-2 rounded-full bg-[#00FFE5] animate-pulse" />
          </div>
          <h1 className="text-4xl font-bold mb-4">
            Claim <span className="text-[#00FFE5]">AF$ Tokens</span>
          </h1>
          <p className="text-white/60">
            Get {FAUCET_AMOUNT} AF$ tokens up to {MAX_CLAIMS}× for free. Use them to trade,
            stake, and test agents on the platform.
          </p>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Per Claim', value: `${FAUCET_AMOUNT} AF$`, color: '#00FFE5' },
            { label: 'Max Claims', value: `${MAX_CLAIMS}×`, color: '#f59e0b' },
            { label: 'Total Supply', value: '100M AF$', color: '#4ade80' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-center">
              <div className="text-xl font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-xs text-white/40 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Faucet Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-white/[0.08] bg-[rgba(5,5,8,0.9)] p-8"
        >
          <div className="mb-6">
            <label className="block text-sm font-medium text-white/70 mb-2">
              Stellar Wallet Address
            </label>
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => {
                setWalletAddress(e.target.value);
                setClaimsRemaining(null);
                setStatus('idle');
                setTxHash(null);
              }}
              onBlur={checkClaims}
              placeholder="G... (56 character Stellar address)"
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-3 text-white placeholder-white/30 font-mono text-sm focus:outline-none focus:border-[#00FFE5]/50 transition-colors"
            />
          </div>

          {/* Claims remaining */}
          {claimsRemaining !== null && status !== 'error' && (
            <div className="mb-6 flex items-center gap-2 text-sm">
              <span className="text-white/60">Claims remaining:</span>
              <span className={`font-bold ${claimsRemaining > 0 ? 'text-[#00FFE5]' : 'text-red-400'}`}>
                {claimsRemaining} / {MAX_CLAIMS}
              </span>
              {totalClaimed > 0 && (
                <span className="text-white/40">
                  · Already received {totalClaimed * FAUCET_AMOUNT} AF$
                </span>
              )}
            </div>
          )}

          {/* Action button */}
          <button
            onClick={status === 'idle' || status === 'error' ? claimTokens : undefined}
            disabled={
              status === 'claiming' ||
              status === 'checking' ||
              status === 'success' ||
              !walletAddress.trim() ||
              claimsRemaining === 0
            }
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-[#00FFE5] text-black hover:bg-[#00FFE5]/90 active:scale-95"
          >
            {status === 'claiming'
              ? 'Claiming...'
              : status === 'checking'
              ? 'Checking...'
              : status === 'success'
              ? '✅ Claimed Successfully!'
              : claimsRemaining === 0
              ? 'Limit Reached'
              : `Claim ${FAUCET_AMOUNT} AF$`}
          </button>

          {/* Success */}
          {status === 'success' && txHash && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 rounded-xl bg-[rgba(74,222,128,0.08)] border border-[rgba(74,222,128,0.2)]"
            >
              <p className="text-[#4ade80] font-semibold mb-2">🎉 {FAUCET_AMOUNT} AF$ sent to your wallet!</p>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#00FFE5] underline font-mono break-all"
              >
                {txHash}
              </a>
            </motion.div>
          )}

          {/* Error */}
          {status === 'error' && errorMsg && (
            <div className="mt-4 p-4 rounded-xl bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.2)]">
              <p className="text-red-400 text-sm">{errorMsg}</p>
            </div>
          )}
        </motion.div>

        {/* Info */}
        <div className="mt-8 text-center text-white/40 text-sm space-y-1">
          <p>AF$ tokens are for testnet use only.</p>
          <p>Use them to run agents, trade on the playground, and test the 0x402 payment protocol.</p>
          {AF_TOKEN_CONTRACT && (
            <p className="font-mono text-xs mt-2">
              Contract: <span className="text-white/60">{AF_TOKEN_CONTRACT.slice(0, 16)}...{AF_TOKEN_CONTRACT.slice(-8)}</span>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
