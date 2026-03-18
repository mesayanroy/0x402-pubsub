'use client';

import { useState, useEffect } from 'react';
import { truncateAddress } from '@/lib/stellar';

export default function WalletConnect() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('wallet_address');
    if (saved) {
      setAddress(saved);
      fetchBalance(saved);
    }
  }, []);

  const fetchBalance = async (addr: string) => {
    try {
      const { getXlmBalance } = await import('@/lib/stellar');
      const bal = await getXlmBalance(addr);
      setBalance(parseFloat(bal).toFixed(2));
    } catch {
      setBalance('0');
    }
  };

  const connect = async () => {
    setConnecting(true);
    try {
      const freighter = await import('@stellar/freighter-api');
      const connectionResult = await freighter.isConnected();
      if (!connectionResult.isConnected) {
        alert('Please install the Freighter wallet extension.');
        return;
      }
      await freighter.requestAccess();
      const { address: pubKey, error } = await freighter.getAddress();
      if (error || !pubKey) {
        alert('Could not retrieve wallet address. Please try again.');
        return;
      }
      setAddress(pubKey);
      localStorage.setItem('wallet_address', pubKey);
      await fetchBalance(pubKey);
    } catch (err) {
      console.error('Wallet connect error:', err);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setBalance('0');
    localStorage.removeItem('wallet_address');
  };

  if (address) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-[rgba(0,255,229,0.2)] bg-[rgba(0,255,229,0.04)]">
          <div className="w-2 h-2 rounded-full bg-[#00FFE5] animate-pulse" />
          <span className="font-mono text-xs text-[#00FFE5]">{truncateAddress(address)}</span>
          <span className="font-mono text-xs text-gray-400">{balance} XLM</span>
        </div>
        <button
          onClick={disconnect}
          className="text-xs text-gray-500 hover:text-red-400 transition-colors font-mono"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className="px-4 py-1.5 text-sm font-mono border border-[#00FFE5] text-[#00FFE5] rounded hover:bg-[#00FFE5] hover:text-black transition-all duration-200 disabled:opacity-50"
    >
      {connecting ? 'Connecting...' : 'Connect Wallet'}
    </button>
  );
}
