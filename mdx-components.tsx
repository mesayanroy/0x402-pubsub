import type { MDXComponents } from 'mdx/types';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (props) => <h1 className="font-syne text-4xl font-bold text-white mb-4" {...props} />,
    h2: (props) => <h2 className="font-syne text-2xl font-bold text-white mt-10 mb-3" {...props} />,
    h3: (props) => <h3 className="font-syne text-xl font-semibold text-white mt-7 mb-2" {...props} />,
    p: (props) => <p className="text-gray-300 leading-7 mb-4" {...props} />,
    a: (props) => <a className="text-[#00FFE5] hover:underline" {...props} />,
    ul: (props) => <ul className="list-disc pl-6 text-gray-300 space-y-2 mb-4" {...props} />,
    ol: (props) => <ol className="list-decimal pl-6 text-gray-300 space-y-2 mb-4" {...props} />,
    li: (props) => <li className="leading-6" {...props} />,
    code: (props) => <code className="font-mono text-[#00FFE5] bg-white/5 px-1 py-0.5 rounded" {...props} />,
    pre: (props) => (
      <pre
        className="font-mono text-sm text-white/90 bg-[#0b0b12] border border-white/10 rounded-xl p-4 overflow-x-auto mb-5"
        {...props}
      />
    ),
    table: (props) => <table className="w-full border-collapse mb-6" {...props} />,
    th: (props) => <th className="text-left p-2 border-b border-white/10 font-mono text-xs text-gray-400" {...props} />,
    td: (props) => <td className="p-2 border-b border-white/5 text-sm text-gray-200" {...props} />,
    ...components,
  };
}
