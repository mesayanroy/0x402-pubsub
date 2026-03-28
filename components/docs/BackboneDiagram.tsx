export default function BackboneDiagram() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a0a12] p-4 overflow-x-auto">
      <svg viewBox="0 0 1100 320" className="min-w-[920px] w-full h-auto" role="img" aria-label="QStash backbone architecture">
        <rect x="40" y="120" width="180" height="80" rx="12" fill="#0f172a" stroke="#00FFE5" />
        <text x="130" y="158" fill="#fff" fontSize="16" textAnchor="middle">CLI / Web</text>

        <rect x="280" y="120" width="210" height="80" rx="12" fill="#111827" stroke="#3b82f6" />
        <text x="385" y="158" fill="#fff" fontSize="16" textAnchor="middle">Agent Run API</text>

        <rect x="550" y="50" width="230" height="220" rx="12" fill="#151320" stroke="#f59e0b" />
        <text x="665" y="82" fill="#fff" fontSize="16" textAnchor="middle">QStash Topics</text>
        <text x="665" y="118" fill="#9ca3af" fontSize="12" textAnchor="middle">agentforge.payment.pending</text>
        <text x="665" y="142" fill="#9ca3af" fontSize="12" textAnchor="middle">agentforge.payment.confirmed</text>
        <text x="665" y="166" fill="#9ca3af" fontSize="12" textAnchor="middle">agentforge.agent.completed</text>
        <text x="665" y="190" fill="#9ca3af" fontSize="12" textAnchor="middle">agentforge.billing.updated</text>
        <text x="665" y="214" fill="#9ca3af" fontSize="12" textAnchor="middle">agentforge.marketplace.activity</text>

        <rect x="840" y="70" width="210" height="80" rx="12" fill="#1a1a26" stroke="#22c55e" />
        <text x="945" y="108" fill="#fff" fontSize="16" textAnchor="middle">Consumers</text>

        <rect x="840" y="170" width="210" height="80" rx="12" fill="#1a1a26" stroke="#a855f7" />
        <text x="945" y="208" fill="#fff" fontSize="16" textAnchor="middle">Dashboard + Ably</text>

        <line x1="220" y1="160" x2="280" y2="160" stroke="#00FFE5" strokeWidth="2" />
        <line x1="490" y1="160" x2="550" y2="160" stroke="#00FFE5" strokeWidth="2" />
        <line x1="780" y1="120" x2="840" y2="110" stroke="#00FFE5" strokeWidth="2" />
        <line x1="780" y1="200" x2="840" y2="210" stroke="#00FFE5" strokeWidth="2" />
      </svg>
    </div>
  );
}
