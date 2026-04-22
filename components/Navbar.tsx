'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import WalletConnect from './WalletConnect';

const BRAND_LOGO_SRC = '/brand/Screenshot 2026-04-22 220049.png';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/docs', label: 'Docs' },
  { href: '/devs', label: 'Devs' },
  { href: '/about', label: 'About' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[rgba(5,5,8,0.85)] backdrop-blur-md border-b border-[rgba(0,255,229,0.08)]">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="group inline-flex items-center">
          <span className="relative flex h-12 w-12 items-center justify-center overflow-hidden">
            <Image
              src={BRAND_LOGO_SRC}
              alt="AgentForge logo"
              fill
              sizes="48px"
              className="object-contain"
              priority
            />
          </span>
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
