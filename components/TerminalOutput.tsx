'use client';

interface TerminalOutputProps {
  content: string;
  title?: string;
  language?: string;
}

export default function TerminalOutput({ content, title = 'output', language = 'json' }: TerminalOutputProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(content);
  };

  return (
    <div className="rounded-xl border border-[rgba(0,255,229,0.12)] bg-[#070710] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(255,255,255,0.05)] bg-[rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#FF4545]" />
            <div className="w-3 h-3 rounded-full bg-[#FFB800]" />
            <div className="w-3 h-3 rounded-full bg-[#00FFE5]" />
          </div>
          <span className="text-xs font-mono text-gray-500">{title}.{language}</span>
        </div>
        <button
          onClick={handleCopy}
          className="text-xs font-mono text-gray-500 hover:text-[#00FFE5] transition-colors px-2 py-0.5 rounded border border-transparent hover:border-[rgba(0,255,229,0.2)]"
        >
          Copy
        </button>
      </div>
      <pre className="p-4 text-sm font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
        {content}
      </pre>
    </div>
  );
}
