'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Logo from './Logo';

/* The top bar. On the sign-in page it shows only the mark - no navigation
   into pages the visitor cannot open yet. */
export default function Header({ right }: { right: ReactNode }) {
  const onLogin = usePathname() === '/login';
  return (
    <header style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      <div className="mx-auto max-w-[1280px] px-6 h-12 flex items-center gap-7">
        <Link href="/" aria-label="Link-in Park home"><Logo /></Link>
        {!onLogin && (
          <>
            <nav className="flex items-center gap-1 text-[13.5px]">
              <Link href="/" className="btn btn-sm">Campaigns</Link>
              <Link href="/web-users" className="btn btn-sm">Web users</Link>
              <Link href="/new" className="btn btn-sm">New link</Link>
              <Link href="/setup" className="btn btn-sm">Setup</Link>
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">{right}</div>
          </>
        )}
      </div>
    </header>
  );
}
