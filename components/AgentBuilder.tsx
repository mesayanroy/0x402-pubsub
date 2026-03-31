'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

type Step = 'configure' | 'prompt' | 'deploy';

interface AgentFormData {
  name: string;
  description: string;
  tags: string;
  model: 'openai-gpt4o-mini' | 'anthropic-claude-haiku';
  systemPrompt: string;
  tools: string[];
  priceXlm: string;
  visibility: 'public' | 'private' | 'forked';
  listInMarketplace: boolean;
  agentWallet: string;
}

const DRAFT_KEY = 'agent_builder_draft';
const DRAFT_STEP_KEY = 'agent_builder_step';

const initialData: AgentFormData = {
  name: '',
  description: '',
  tags: '',
  model: 'openai-gpt4o-mini',
  systemPrompt: '',
  tools: [],
  priceXlm: '0.01',
  visibility: 'public',
  listInMarketplace: true,
  agentWallet: '',
};

const toolOptions = [
  { id: 'web_search', label: 'Web Search' },
  { id: 'code_execution', label: 'Code Execution' },
  { id: 'file_io', label: 'File I/O' },
  { id: 'on_chain_data', label: 'On-Chain Data' },
];

const steps: Step[] = ['configure', 'prompt', 'deploy'];
const stepLabels: Record<Step, string> = {
  configure: '01 Configure',
  prompt: '02 Prompt',
  deploy: '03 Deploy',
};

function loadDraft(): { form: AgentFormData; step: Step } {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const stepRaw = localStorage.getItem(DRAFT_STEP_KEY);
    const form = raw ? (JSON.parse(raw) as AgentFormData) : initialData;
    const step: Step = (stepRaw as Step) || 'configure';
    return { form, step };
  } catch {
    return { form: initialData, step: 'configure' };
  }
}

function saveDraft(form: AgentFormData, step: Step) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    localStorage.setItem(DRAFT_STEP_KEY, step);
  } catch {
    // localStorage may not be available in SSR — ignore
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_STEP_KEY);
  } catch {
    // ignore
  }
}

type DeployPhase =
  | 'idle'
  | 'building_tx'
  | 'awaiting_validation_sig'
  | 'submitting_validation'
  | 'awaiting_confirm_sig'
  | 'submitting_confirm'
  | 'saving'
  | 'done';

const PHASE_LABELS: Record<DeployPhase, string> = {
  idle: '🚀 Deploy Agent',
  building_tx: 'Building transaction…',
  awaiting_validation_sig: '🔏 Sign validation in wallet…',
  submitting_validation: 'Submitting to Stellar…',
  awaiting_confirm_sig: '🔏 Sign confirmation in wallet…',
  submitting_confirm: 'Confirming on-chain…',
  saving: 'Saving to database…',
  done: '✅ Deployed!',
};

export default function AgentBuilder() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('configure');
  const [form, setForm] = useState<AgentFormData>(initialData);
  const [deployPhase, setDeployPhase] = useState<DeployPhase>('idle');
  const [deployedAgent, setDeployedAgent] = useState<{ id: string; apiKey: string; endpoint: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [onChainTxHash, setOnChainTxHash] = useState<string | null>(null);

  const deploying = deployPhase !== 'idle' && deployPhase !== 'done';

  // Hydrate from localStorage on mount (client only)
  useEffect(() => {
    const { form: savedForm, step: savedStep } = loadDraft();
    const hasData = savedForm.name || savedForm.description || savedForm.systemPrompt;
    if (hasData) {
      setForm(savedForm);
      setStep(savedStep);
      setDraftRestored(true);
    }
  }, []);

  // Persist to localStorage whenever form or step changes
  useEffect(() => {
    saveDraft(form, step);
  }, [form, step]);

  const stepIndex = steps.indexOf(step);

  const update = (field: keyof AgentFormData, value: string | string[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleTool = (toolId: string) => {
    setForm((prev) => ({
      ...prev,
      tools: prev.tools.includes(toolId)
        ? prev.tools.filter((t) => t !== toolId)
        : [...prev.tools, toolId],
    }));
  };

  const signTxWithFreighter = async (
    txXdr: string,
    networkPassphrase: string
  ): Promise<string> => {
    const freighter = await import('@stellar/freighter-api');
    const { signedTxXdr, error } = await freighter.signTransaction(txXdr, {
      networkPassphrase,
    });
    if (error || !signedTxXdr) {
      throw new Error((error as { message?: string } | null)?.message || 'Freighter signing failed');
    }
    return signedTxXdr;
  };

  const handleDeploy = async () => {
    setError(null);
    setOnChainTxHash(null);

    const walletAddress = localStorage.getItem('wallet_address');
    if (!walletAddress) {
      setError('Please connect your wallet first.');
      return;
    }

    const agentId = `${form.name.toLowerCase().replace(/\s+/g, '_').slice(0, 24)}_${Date.now()}`;
    const metadataHash = btoa(JSON.stringify({ name: form.name, model: form.model })).slice(0, 32);

    try {
      // ── Step 1: Build validation + request_deploy transaction ─────────────
      setDeployPhase('building_tx');

      const validateRes = await fetch('/api/agents/validate-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployer_wallet: walletAddress,
          agent_id: agentId,
          metadata_hash: metadataHash,
          price_xlm: parseFloat(form.priceXlm),
        }),
      });

      const validateData = await validateRes.json() as {
        status: string;
        validation_tx_xdr?: string;
        network_passphrase?: string;
        confirmation_message?: string;
        error?: string;
      };

      if (!validateRes.ok) {
        throw new Error(validateData.error || 'Validation transaction failed');
      }

      const validationMessage = validateData.confirmation_message ?? '';
      let signedValidateTxXdr = '';

      if (validateData.validation_tx_xdr && validateData.network_passphrase) {
        // ── Step 2: Sign validation transaction in user's wallet ─────────────
        setDeployPhase('awaiting_validation_sig');
        signedValidateTxXdr = await signTxWithFreighter(
          validateData.validation_tx_xdr,
          validateData.network_passphrase
        );
      }

      // ── Step 3: Submit signed tx + get confirm_deploy XDR ─────────────────
      setDeployPhase('submitting_validation');

      const confirmRes = await fetch('/api/agents/confirm-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signed_request_tx_xdr: signedValidateTxXdr,
          deployer_wallet: walletAddress,
          agent_id: agentId,
          validation_message: validationMessage,
        }),
      });

      const confirmData = await confirmRes.json() as {
        status: string;
        confirm_tx_xdr?: string;
        network_passphrase?: string;
        signature_hash?: string;
        error?: string;
      };

      if (!confirmRes.ok) {
        throw new Error(confirmData.error || 'Confirm-deploy request failed');
      }

      if (confirmData.confirm_tx_xdr && confirmData.network_passphrase) {
        // ── Step 4: Sign confirm_deploy transaction ──────────────────────────
        setDeployPhase('awaiting_confirm_sig');
        const signedConfirmTxXdr = await signTxWithFreighter(
          confirmData.confirm_tx_xdr,
          confirmData.network_passphrase
        );

        // Submit the confirm_deploy signed transaction to Horizon
        setDeployPhase('submitting_confirm');
        const horizonUrl = process.env.NEXT_PUBLIC_HORIZON_URL || 'https://horizon-testnet.stellar.org';
        const horizonRes = await fetch(`${horizonUrl}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ tx: signedConfirmTxXdr }),
        });

        if (horizonRes.ok) {
          const horizonData = await horizonRes.json() as { hash?: string };
          if (horizonData.hash) {
            setOnChainTxHash(horizonData.hash);
          }
        }
      }

      // ── Step 5: Save agent to Supabase ────────────────────────────────────
      setDeployPhase('saving');

      const createRes = await fetch('/api/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner_wallet: form.agentWallet || walletAddress,
          name: form.name,
          description: form.description,
          tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
          model: form.model,
          system_prompt: form.systemPrompt,
          tools: form.tools,
          price_xlm: parseFloat(form.priceXlm),
          visibility: form.listInMarketplace ? 'public' : form.visibility,
          list_in_marketplace: form.listInMarketplace,
        }),
      });

      const createData = await createRes.json() as {
        id?: string;
        api_key?: string;
        api_endpoint?: string;
        error?: string;
        details?: string;
      };

      if (!createRes.ok) {
        const extra = createData.details ? ` (${createData.details})` : '';
        throw new Error(`${createData.error || 'Deploy failed'}${extra}`);
      }

      clearDraft();
      setDeployPhase('done');
      setDeployedAgent({
        id: createData.id!,
        apiKey: createData.api_key!,
        endpoint: createData.api_endpoint!,
      });
    } catch (err) {
      setError(String(err));
      setDeployPhase('idle');
    }
  };

  if (deployedAgent) {
    return (
      <div className="space-y-6">
        <div className="p-6 rounded-xl border border-[rgba(0,255,229,0.2)] bg-[rgba(0,255,229,0.04)]">
          <h3 className="font-syne text-xl font-bold text-[#00FFE5] mb-2">🎉 Agent Deployed!</h3>
          <p className="text-gray-400 text-sm mb-4">Your agent is live on AgentForge.</p>
          {onChainTxHash && (
            <div className="mb-4 p-3 rounded-lg border border-[rgba(255,184,0,0.2)] bg-[rgba(255,184,0,0.06)] font-mono text-xs">
              <span className="text-gray-500">On-chain tx: </span>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${onChainTxHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-[#FFB800] hover:underline break-all"
              >
                {onChainTxHash.slice(0, 12)}…{onChainTxHash.slice(-12)}
              </a>
            </div>
          )}
          <div className="space-y-3 font-mono text-sm">
            <div>
              <span className="text-gray-500">Endpoint: </span>
              <span className="text-white break-all">{deployedAgent.endpoint}</span>
            </div>
            <div>
              <span className="text-gray-500">API Key: </span>
              <span className="text-[#FFB800] break-all">{deployedAgent.apiKey}</span>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => router.push(`/agents/${deployedAgent.id}`)}
              className="px-4 py-2 text-sm font-mono border border-[#00FFE5] text-[#00FFE5] rounded hover:bg-[#00FFE5] hover:text-black transition-all"
            >
              View Agent
            </button>
            <button
              onClick={() => { setDeployedAgent(null); setForm(initialData); setStep('configure'); setDeployPhase('idle'); }}
              className="px-4 py-2 text-sm font-mono border border-[rgba(255,255,255,0.15)] text-gray-400 rounded hover:text-white transition-all"
            >
              Build Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  const DEPLOY_PHASES: DeployPhase[] = [
    'building_tx',
    'awaiting_validation_sig',
    'submitting_validation',
    'awaiting_confirm_sig',
    'submitting_confirm',
    'saving',
  ];

  const DEPLOY_PHASE_LABELS: Record<DeployPhase, string> = {
    idle: '',
    building_tx: 'Building Soroban transaction',
    awaiting_validation_sig: 'Wallet: Sign validation message',
    submitting_validation: 'Submitting to Stellar Horizon',
    awaiting_confirm_sig: 'Wallet: Sign confirm_deploy',
    submitting_confirm: 'Inter-contract call → AgentRegistry',
    saving: 'Saving agent to database',
    done: '',
  };

  return (
    <div className="space-y-6">
      {draftRestored && (
        <div className="flex items-center justify-between p-3 rounded-lg border border-[rgba(255,184,0,0.3)] bg-[rgba(255,184,0,0.06)]">
          <span className="text-xs font-mono text-[#FFB800]">📝 Draft restored from last session</span>
          <button
            onClick={() => { setForm(initialData); setStep('configure'); setDraftRestored(false); }}
            className="text-xs font-mono text-gray-500 hover:text-red-400 transition-colors"
          >
            Clear draft
          </button>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex gap-2">
        {steps.map((s, i) => (
          <button
            key={s}
            onClick={() => i < stepIndex + 1 && setStep(s)}
            className={`flex-1 py-2 text-xs font-mono rounded border transition-all ${
              s === step
                ? 'border-[#00FFE5] text-[#00FFE5] bg-[rgba(0,255,229,0.08)]'
                : i < stepIndex
                ? 'border-[rgba(0,255,229,0.3)] text-[rgba(0,255,229,0.5)]'
                : 'border-[rgba(255,255,255,0.08)] text-gray-600'
            }`}
          >
            {stepLabels[s]}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 'configure' && (
          <motion.div
            key="configure"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5">Agent Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="My Awesome Agent"
                className="w-full px-3 py-2.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-[rgba(0,255,229,0.4)]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="What does this agent do?"
                rows={3}
                className="w-full px-3 py-2.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-[rgba(0,255,229,0.4)] resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5">Tags (comma-separated)</label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => update('tags', e.target.value)}
                placeholder="web3, finance, automation"
                className="w-full px-3 py-2.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-[rgba(0,255,229,0.4)]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5">Base Model *</label>
              <div className="grid grid-cols-2 gap-2">
                {(['openai-gpt4o-mini', 'anthropic-claude-haiku'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => update('model', m)}
                    className={`py-2.5 text-xs font-mono rounded-lg border transition-all ${
                      form.model === m
                        ? 'border-[#00FFE5] bg-[rgba(0,255,229,0.08)] text-[#00FFE5]'
                        : 'border-[rgba(255,255,255,0.08)] text-gray-400 hover:border-[rgba(255,255,255,0.2)]'
                    }`}
                  >
                    {m === 'openai-gpt4o-mini' ? 'GPT-4o Mini' : 'Claude Haiku'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5">Price (XLM/request)</label>
                <input
                  type="number"
                  value={form.priceXlm}
                  onChange={(e) => update('priceXlm', e.target.value)}
                  min="0.01"
                  step="0.01"
                  className="w-full px-3 py-2.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg text-white text-sm font-mono focus:outline-none focus:border-[rgba(0,255,229,0.4)]"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1.5">Visibility</label>
                <select
                  value={form.visibility}
                  onChange={(e) => update('visibility', e.target.value)}
                  className="w-full px-3 py-2.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg text-white text-sm font-mono focus:outline-none focus:border-[rgba(0,255,229,0.4)]"
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                  <option value="forked">Forked</option>
                </select>
              </div>
            </div>

            {/* Marketplace listing toggle */}
            <div
              onClick={() => setForm((prev) => ({ ...prev, listInMarketplace: !prev.listInMarketplace }))}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                form.listInMarketplace
                  ? 'border-[rgba(0,255,229,0.35)] bg-[rgba(0,255,229,0.06)]'
                  : 'border-[rgba(255,255,255,0.08)] bg-transparent'
              }`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                form.listInMarketplace ? 'bg-[#00FFE5] border-[#00FFE5]' : 'border-[rgba(255,255,255,0.2)]'
              }`}>
                {form.listInMarketplace && <span className="text-black text-[10px] font-bold">✓</span>}
              </div>
              <div>
                <div className="text-xs font-mono text-white">List in Marketplace for monetization</div>
                <div className="text-[10px] font-mono text-gray-500 mt-0.5">
                  Your agent will appear in the public marketplace. Earn {form.priceXlm || '0.01'} XLM per request via 0x402 protocol.
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5">Agent Wallet Address (optional)</label>
              <input
                type="text"
                value={form.agentWallet}
                onChange={(e) => update('agentWallet', e.target.value)}
                placeholder="Leave blank to use your connected wallet"
                className="w-full px-3 py-2.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-[rgba(0,255,229,0.4)]"
              />
              {form.agentWallet && !/^G[A-Z2-7]{55}$/.test(form.agentWallet) && (
                <p className="text-[10px] font-mono text-red-400 mt-1">Invalid Stellar address format.</p>
              )}
              <p className="text-[10px] font-mono text-gray-500 mt-1">
                Build this agent for a different wallet. Enables multi-agent architecture.
              </p>
            </div>
            <button
              onClick={() => setStep('prompt')}
              disabled={!form.name || (!!form.agentWallet && !/^G[A-Z2-7]{55}$/.test(form.agentWallet))}
              className="w-full py-3 font-mono text-sm bg-[#00FFE5] text-black rounded-lg font-bold hover:bg-[#00e6ce] transition-colors disabled:opacity-40"
            >
              Next: System Prompt →
            </button>
          </motion.div>
        )}

        {step === 'prompt' && (
          <motion.div
            key="prompt"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-1.5">System Prompt *</label>
              <textarea
                value={form.systemPrompt}
                onChange={(e) => update('systemPrompt', e.target.value)}
                placeholder="You are a helpful assistant specialized in..."
                rows={10}
                className="w-full px-3 py-2.5 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-lg text-white text-sm font-mono placeholder-gray-600 focus:outline-none focus:border-[rgba(0,255,229,0.4)] resize-none"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-gray-400 mb-2">Tool Capabilities</label>
              <div className="grid grid-cols-2 gap-2">
                {toolOptions.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => toggleTool(tool.id)}
                    className={`py-2 px-3 text-xs font-mono rounded-lg border text-left transition-all ${
                      form.tools.includes(tool.id)
                        ? 'border-[#FFB800] bg-[rgba(255,184,0,0.08)] text-[#FFB800]'
                        : 'border-[rgba(255,255,255,0.08)] text-gray-500 hover:border-[rgba(255,255,255,0.2)]'
                    }`}
                  >
                    {form.tools.includes(tool.id) ? '✓ ' : '○ '}{tool.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('configure')}
                className="flex-1 py-3 font-mono text-sm border border-[rgba(255,255,255,0.1)] text-gray-400 rounded-lg hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep('deploy')}
                disabled={!form.systemPrompt}
                className="flex-1 py-3 font-mono text-sm bg-[#00FFE5] text-black rounded-lg font-bold hover:bg-[#00e6ce] transition-colors disabled:opacity-40"
              >
                Next: Deploy →
              </button>
            </div>
          </motion.div>
        )}

        {step === 'deploy' && (
          <motion.div
            key="deploy"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] space-y-2 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Name</span>
                <span className="text-white">{form.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Model</span>
                <span className="text-[#00FFE5]">
                  {form.model === 'openai-gpt4o-mini' ? 'GPT-4o Mini' : 'Claude Haiku'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Price</span>
                <span className="text-[#FFB800]">{form.priceXlm} XLM/req</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Visibility</span>
                <span className="text-white">{form.listInMarketplace ? 'public' : form.visibility}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Marketplace</span>
                <span className={form.listInMarketplace ? 'text-[#00FFE5]' : 'text-gray-500'}>
                  {form.listInMarketplace ? '✓ Listed for monetization' : 'Private (not listed)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tools</span>
                <span className="text-white">{form.tools.length > 0 ? form.tools.join(', ') : 'none'}</span>
              </div>
            </div>

            {/* On-chain validation flow indicator */}
            {deploying && (
              <div className="p-4 rounded-xl border border-[rgba(0,255,229,0.15)] bg-[rgba(0,255,229,0.04)] space-y-2">
                <p className="font-mono text-xs text-[#00FFE5] font-bold uppercase tracking-widest mb-3">
                  On-Chain Validation
                </p>
                {DEPLOY_PHASES.map((phase, i) => {
                  const phaseIdx = DEPLOY_PHASES.indexOf(deployPhase);
                  const thisIdx = i;
                  const done = thisIdx < phaseIdx;
                  const active = thisIdx === phaseIdx;
                  return (
                    <div key={phase} className="flex items-center gap-2">
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-[9px] shrink-0 ${
                        done
                          ? 'bg-[#00FFE5] border-[#00FFE5] text-black'
                          : active
                          ? 'border-[#00FFE5] text-[#00FFE5] animate-pulse'
                          : 'border-gray-700 text-gray-700'
                      }`}>
                        {done ? '✓' : String(i + 1)}
                      </span>
                      <span className={`font-mono text-xs ${
                        done ? 'text-gray-500 line-through' : active ? 'text-white' : 'text-gray-600'
                      }`}>
                        {DEPLOY_PHASE_LABELS[phase]}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {error && (
              <div className="p-3 rounded bg-[rgba(255,69,69,0.1)] border border-red-900 text-red-400 text-xs font-mono">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep('prompt')}
                disabled={deploying}
                className="flex-1 py-3 font-mono text-sm border border-[rgba(255,255,255,0.1)] text-gray-400 rounded-lg hover:text-white transition-colors disabled:opacity-40"
              >
                ← Back
              </button>
              <button
                onClick={handleDeploy}
                disabled={deploying}
                className="flex-1 py-3 font-mono text-sm bg-[#00FFE5] text-black rounded-lg font-bold hover:bg-[#00e6ce] transition-colors disabled:opacity-50"
              >
                {PHASE_LABELS[deployPhase]}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
