'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

// Pages that should show the left sidebar (matched as exact path or sub-path)
const APP_PAGES = ['/dashboard', '/marketplace', '/trading', '/agents', '/build', '/workflow'];

function needsSidebar(pathname: string): boolean {
  return APP_PAGES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = needsSidebar(pathname);

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-56 min-h-screen">{children}</div>
    </div>
  );
}
