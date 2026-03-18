'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import WalletConnect from './WalletConnect';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/agents', label: 'Agents' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/build', label: 'Build' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/docs', label: 'Docs' },
  { href: '/devs', label: 'Devs' },
  { href: '/about', label: 'About' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[rgba(5,5,8,0.8)] backdrop-blur-md border-b border-[rgba(0,255,229,0.08)]">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="font-syne text-xl font-bold text-[#00FFE5] tracking-tight">
          AgentForge
        </Link>
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 text-sm rounded transition-colors font-mono ${
                pathname === link.href
                  ? 'text-[#00FFE5] bg-[rgba(0,255,229,0.08)]'
                  : 'text-gray-400 hover:text-white hover:bg-[rgba(255,255,255,0.04)]'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <WalletConnect />
      </div>
    </nav>
  );
}
