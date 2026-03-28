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
  paymentMemo: string;
  onPaymentSuccess: (txHash: string) => void;
}

type PaymentStep = 'idle' | 'checking_wallet' | 'building_tx' | 'signing' | 'submitting' | 'done' | 'error';

const STEP_LABELS: Record<PaymentStep, string> = {
  idle: 'Sign & Pay',
  checking_wallet: 'Checking wallet...',
  building_tx: 'Building transaction...',
  signing: 'Sign in Freighter...',
  submitting: 'Submitting to Stellar...',
  done: 'Done!',
  error: 'Retry',
};

export default function PaymentModal({
  isOpen,
  onClose,
  agentId,
  agentName,
  priceXlm,
  ownerAddress,
  paymentMemo,
  onPaymentSuccess,
}: PaymentModalProps) {
  const [step, setStep] = useState<PaymentStep>('idle');
  const [error, setError] = useState<string | null>(null);

  const paying = step !== 'idle' && step !== 'done' && step !== 'error';

  const handlePay = async () => {
    setStep('checking_wallet');
    setError(null);
    try {
      const StellarSdk = await import('stellar-sdk');
      const freighter = await import('@stellar/freighter-api');

      // Check Freighter is installed and connected
      const connectionResult = await freighter.isConnected();
      if (!connectionResult.isConnected) {
        throw new Error(
          'Freighter wallet is not installed. Please install the Freighter browser extension at https://www.freighter.app and try again.'
        );
      }

      // Request access if not already granted
      await freighter.requestAccess();

      const { address: senderKey, error: addrError } = await freighter.getAddress();
      if (addrError || !senderKey) throw new Error('Could not get wallet address. Please ensure Freighter is unlocked and you have granted permission.');

      setStep('building_tx');

      const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
      const networkPassphrase = StellarSdk.Networks.TESTNET;

      const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
      const senderAccount = await horizonServer.loadAccount(senderKey);

      const memo = paymentMemo || `agent:${agentId}`;
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

      setStep('signing');

      const xdr = txBuilder.toXDR();
      const signedResult = await freighter.signTransaction(xdr, { networkPassphrase });
      if (signedResult.error) throw new Error(String(signedResult.error));
      const signedXdr = signedResult.signedTxXdr;
      const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

      setStep('submitting');

      const result = await horizonServer.submitTransaction(signedTx);
      setStep('done');
      onPaymentSuccess(result.hash);
    } catch (err) {
      setError(String(err));
      setStep('error');
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
                  {paymentMemo}
                </span>
              </div>
            </div>

            {/* Step progress */}
            {paying && (
              <div className="mb-4 p-3 rounded bg-[rgba(0,255,229,0.06)] border border-[rgba(0,255,229,0.2)] text-[#00FFE5] text-xs font-mono flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00FFE5] animate-pulse shrink-0" />
                {STEP_LABELS[step]}
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded bg-[rgba(255,69,69,0.1)] border border-red-900 text-red-400 text-xs font-mono">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={paying}
                className="flex-1 py-2.5 text-sm font-mono border border-[rgba(255,255,255,0.1)] text-gray-400 rounded-lg hover:text-white transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handlePay}
                disabled={paying}
                className="flex-1 py-2.5 text-sm font-mono bg-[#00FFE5] text-black rounded-lg font-bold hover:bg-[#00e6ce] transition-colors disabled:opacity-50"
              >
                {STEP_LABELS[step]}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
