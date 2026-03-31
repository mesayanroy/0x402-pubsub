export default function PaymentWorkflowDiagram() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_20%_10%,rgba(0,255,229,0.15),transparent_35%),radial-gradient(circle_at_80%_90%,rgba(255,184,0,0.12),transparent_40%),#090912] p-4 overflow-x-auto">
      <svg viewBox="0 0 1100 360" className="min-w-[920px] w-full h-auto" role="img" aria-label="0x402 payment workflow">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#00FFE5" />
          </marker>
        </defs>

        <rect x="40" y="60" width="210" height="90" rx="14" fill="#0f172a" stroke="#00FFE5" />
        <text x="145" y="95" fill="#fff" textAnchor="middle" fontSize="17" fontWeight="700">Client App</text>
        <text x="145" y="120" fill="#9ca3af" textAnchor="middle" fontSize="12">Freighter signs tx</text>

        <rect x="330" y="50" width="250" height="110" rx="14" fill="#10121c" stroke="#3b82f6" />
        <text x="455" y="90" fill="#fff" textAnchor="middle" fontSize="17" fontWeight="700">0x402 Agent API</text>
        <text x="455" y="114" fill="#9ca3af" textAnchor="middle" fontSize="12">Returns 402 challenge</text>

        <rect x="670" y="40" width="250" height="130" rx="14" fill="#111827" stroke="#f59e0b" />
        <text x="795" y="80" fill="#fff" textAnchor="middle" fontSize="17" fontWeight="700">Stellar Horizon</text>
        <text x="795" y="105" fill="#9ca3af" textAnchor="middle" fontSize="12">tx hash + signature</text>
        <text x="795" y="125" fill="#9ca3af" textAnchor="middle" fontSize="12">memo + amount verify</text>

        <rect x="330" y="220" width="250" height="110" rx="14" fill="#101a13" stroke="#22c55e" />
        <text x="455" y="260" fill="#fff" textAnchor="middle" fontSize="17" fontWeight="700">QStash Consumers</text>
        <text x="455" y="284" fill="#9ca3af" textAnchor="middle" fontSize="12">billing + activity fan-out</text>

        <rect x="670" y="220" width="250" height="110" rx="14" fill="#1a1220" stroke="#a855f7" />
        <text x="795" y="260" fill="#fff" textAnchor="middle" fontSize="17" fontWeight="700">Dashboard + Docs</text>
        <text x="795" y="284" fill="#9ca3af" textAnchor="middle" fontSize="12">real-time charts + invoices</text>

        <line x1="250" y1="105" x2="330" y2="105" stroke="#00FFE5" strokeWidth="2" markerEnd="url(#arrow)" />
        <text x="290" y="95" fill="#9ca3af" textAnchor="middle" fontSize="11">POST /run</text>

        <line x1="580" y1="90" x2="670" y2="90" stroke="#00FFE5" strokeWidth="2" markerEnd="url(#arrow)" />
        <text x="626" y="80" fill="#9ca3af" textAnchor="middle" fontSize="11">verify tx</text>

        <line x1="740" y1="172" x2="520" y2="220" stroke="#00FFE5" strokeWidth="2" markerEnd="url(#arrow)" />
        <text x="620" y="188" fill="#9ca3af" textAnchor="middle" fontSize="11">confirmed event</text>

        <line x1="580" y1="275" x2="670" y2="275" stroke="#00FFE5" strokeWidth="2" markerEnd="url(#arrow)" />
        <text x="625" y="265" fill="#9ca3af" textAnchor="middle" fontSize="11">websocket updates</text>

        <line x1="455" y1="160" x2="455" y2="220" stroke="#00FFE5" strokeWidth="2" markerEnd="url(#arrow)" />
        <text x="472" y="196" fill="#9ca3af" fontSize="11">publish</text>
      </svg>
    </div>
  );
}
