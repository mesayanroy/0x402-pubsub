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
  onPaymentSuccess: (txHash: string, signerWallet: string) => void;
}

type PaymentStep = 'idle' | 'checking_wallet' | 'building_tx' | 'signing' | 'submitting' | 'confirming' | 'done' | 'error';

const STEP_LABELS: Record<PaymentStep, string> = {
  idle: 'Sign & Pay',
  checking_wallet: 'Checking wallet...',
  building_tx: 'Building transaction...',
  signing: 'Sign in Freighter...',
  submitting: 'Submitting to Stellar...',
  confirming: 'Confirming on ledger...',
  done: 'Done!',
  error: 'Retry',
};

/** Extract the most useful human-readable message from a Stellar SDK error. */
function extractStellarError(err: unknown): string {
  if (!err) return 'Unknown error';
  // Horizon BadResponseError has .response?.data?.extras?.result_codes
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    try {
      const resultCodes = (
        (e.response as Record<string, unknown>)?.data as Record<string, unknown>
      )?.extras as Record<string, unknown>;
      if (resultCodes?.result_codes) {
        const rc = resultCodes.result_codes as Record<string, unknown>;
        return `Transaction failed: ${rc.transaction || ''} ops: ${JSON.stringify(rc.operations || [])}`;
      }
    } catch {
      // fall through
    }
  }
  const msg = String(err);
  if (msg.includes('Resource Missing') || msg.includes('404')) {
    return 'Account not found on this Stellar network. Make sure your Freighter wallet is funded and connected to the correct network.';
  }
  if (msg.includes('403') || msg.includes('Forbidden')) {
    return 'Access denied. Please unlock your Freighter wallet and try again.';
  }
  return msg.startsWith('Error:') ? msg.slice(7).trim() : msg;
}

/** Poll Horizon until the transaction appears on the ledger (up to 30 s). */
async function waitForLedgerConfirmation(
  horizonServer: import('stellar-sdk').Horizon.Server,
  txHash: string,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await horizonServer.transactions().transaction(txHash).call();
      return; // confirmed
    } catch {
      // Not yet on ledger, wait and retry
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  // Timed out, but submission was successful so we proceed anyway
}

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
  const [txExplorerUrl, setTxExplorerUrl] = useState<string | null>(null);

  const paying = step !== 'idle' && step !== 'done' && step !== 'error';

  const handlePay = async () => {
    setStep('checking_wallet');
    setError(null);
    setTxExplorerUrl(null);
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
      const accessResult = await freighter.requestAccess();
      if (accessResult && 'error' in accessResult && accessResult.error) {
        throw new Error('Freighter access denied. Please allow this site in Freighter and try again.');
      }

      const { address: senderKey, error: addrError } = await freighter.getAddress();
      if (addrError || !senderKey) throw new Error('Could not get wallet address. Please ensure Freighter is unlocked and you have granted permission.');

      setStep('building_tx');

      const isMainnet = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet';
      const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL ||
        (isMainnet ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org');
      const networkPassphrase = isMainnet
        ? StellarSdk.Networks.PUBLIC
        : StellarSdk.Networks.TESTNET;

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
        .setTimeout(60)
        .build();

      setStep('signing');

      const xdr = txBuilder.toXDR();
      const signedResult = await freighter.signTransaction(xdr, { networkPassphrase });
      if (signedResult.error) throw new Error(String(signedResult.error));
      const signedXdr = signedResult.signedTxXdr;
      const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, networkPassphrase);

      setStep('submitting');

      const result = await horizonServer.submitTransaction(signedTx);
      const txHash = result.hash;

      // Build explorer URL for display
      const explorerNetwork = isMainnet ? 'public' : 'testnet';
      setTxExplorerUrl(`https://stellar.expert/explorer/${explorerNetwork}/tx/${txHash}`);

      // Wait for the transaction to be queryable on Horizon before handing
      // the hash back to the run route (avoids "Transaction not found" on verify).
      setStep('confirming');
      await waitForLedgerConfirmation(horizonServer, txHash);

      setStep('done');
      onPaymentSuccess(txHash, senderKey);
    } catch (err) {
      setError(extractStellarError(err));
      setStep('error');
    }
  };

  const isMainnet = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet';

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
                <span className={isMainnet ? 'text-[#4ade80]' : 'text-[#00FFE5]'}>
                  Stellar {isMainnet ? 'Mainnet' : 'Testnet'}
                </span>
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

            {step === 'done' && txExplorerUrl && (
              <div className="mb-4 p-3 rounded bg-[rgba(74,222,128,0.08)] border border-green-900 text-[#4ade80] text-xs font-mono">
                ✓ Payment confirmed on ledger.{' '}
                <a
                  href={txExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-green-300"
                >
                  View on Stellar Expert ↗
                </a>
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
