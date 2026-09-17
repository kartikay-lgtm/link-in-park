'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Logo from './Logo';

/* The top bar. On the sign-in page it shows only the mark. The Admin link
   appears for super admins only. */
export default function Header({ right, isAdmin, userName }: { right: ReactNode; isAdmin: boolean; userName: string | null }) {
  const path = usePathname();
  const onLogin = path === '/login';
  const item = (href: string, label: string) => (
    <Link href={href} className={`btn btn-sm ${path === href || (href !== '/' && path.startsWith(href)) ? 'btn-active' : ''}`}>{label}</Link>
  );
  return (
    <header style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)' }}>
      <div className="mx-auto max-w-[1280px] px-6 h-12 flex items-center gap-7">
        <Link href="/" aria-label="Link-in Park home"><Logo /></Link>
        {!onLogin && (
          <>
            <nav className="flex items-center gap-1 text-[13.5px]">
              {item('/', 'Campaigns')}
              {item('/web-users', 'Web users')}
              {item('/new', 'New link')}
              {isAdmin && item('/admin', 'Admin')}
            </nav>
            <div className="ml-auto flex items-center gap-3 text-sm">
              {userName && <span className="muted text-[13px]">{userName}</span>}
              {right}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
