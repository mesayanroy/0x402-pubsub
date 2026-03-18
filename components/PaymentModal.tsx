'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  agentName: string;
  priceXlm: number;
  ownerAddress: string;
  requestNonce: string;
  onPaymentSuccess: (txHash: string) => void;
}

export default function PaymentModal({
  isOpen,
  onClose,
  agentId,
  agentName,
  priceXlm,
  ownerAddress,
  requestNonce,
  onPaymentSuccess,
}: PaymentModalProps) {
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    setPaying(true);
    setError(null);
    try {
      const StellarSdk = await import('stellar-sdk');
      const freighter = await import('@stellar/freighter-api');

      const { address: senderKey, error: addrError } = await freighter.getAddress();
      if (addrError || !senderKey) throw new Error('Could not get wallet address');

      const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
      const networkPassphrase = StellarSdk.Networks.TESTNET;

      const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
      const senderAccount = await horizonServer.loadAccount(senderKey);

      const memo = `agent:${agentId}:req:${requestNonce}`;
      const txBuilder = new StellarSdk.TransactionBuilder(senderAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: ownerAddress,
            asset: StellarSdk.Asset.native(),
            amount: priceXlm.toFixed(7),
          })
        )
        .addMemo(StellarSdk.Memo.text(memo.slice(0, 28)))
        .setTimeout(30)
        .build();

      const xdr = txBuilder.toXDR();
      const signedResult = await freighter.signTransaction(xdr, { networkPassphrase });
      if (signedResult.error) throw new Error(String(signedResult.error));
      const signedXdr = signedResult.signedTxXdr;
      const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
      const result = await horizonServer.submitTransaction(signedTx);
      onPaymentSuccess(result.hash);
    } catch (err) {
      setError(String(err));
    } finally {
      setPaying(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md mx-4 rounded-2xl border border-[rgba(0,255,229,0.2)] bg-[#0a0a10] p-6"
          >
            <h2 className="font-syne text-xl font-bold text-white mb-1">Payment Required</h2>
            <p className="text-gray-400 text-sm mb-6">402 — Pay-per-request via Stellar</p>

            <div className="space-y-3 mb-6 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Agent</span>
                <span className="text-white">{agentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="text-[#FFB800] font-bold">{priceXlm} XLM</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Network</span>
                <span className="text-[#00FFE5]">Stellar Testnet</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Memo</span>
                <span className="text-gray-300 text-xs truncate max-w-[200px]">
                  agent:{agentId.slice(0, 8)}:req:{requestNonce}
                </span>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded bg-[rgba(255,69,69,0.1)] border border-red-900 text-red-400 text-xs font-mono">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 text-sm font-mono border border-[rgba(255,255,255,0.1)] text-gray-400 rounded-lg hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePay}
                disabled={paying}
                className="flex-1 py-2.5 text-sm font-mono bg-[#00FFE5] text-black rounded-lg font-bold hover:bg-[#00e6ce] transition-colors disabled:opacity-50"
              >
                {paying ? 'Signing...' : 'Sign & Pay'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
