'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import Logo from './Logo';

/* The top bar inside the shell: logo, pill navigation in the middle, the
   person on the right. On the sign-in page only the logo shows. */
export default function Header({ right, isAdmin, userName }: { right: ReactNode; isAdmin: boolean; userName: string | null }) {
  const path = usePathname();
  const onLogin = path === '/login';
  const on = (href: string) => path === href || (href !== '/' && path.startsWith(href));
  const item = (href: string, label: string) => <Link key={href} href={href} className={on(href) ? 'on' : ''}>{label}</Link>;
  return (
    <div className="shell-head">
      <Link href="/" aria-label="Link-in Park home" className="shrink-0"><Logo size={26} /></Link>
      {!onLogin && (
        <>
          <nav className="seg mx-auto">
            {item('/', 'Campaigns')}
            {item('/web-users', 'Web users')}
            {item('/new', 'New link')}
            {isAdmin && item('/admin', 'Admin')}
          </nav>
          <div className="flex items-center gap-3 text-sm shrink-0">
            {userName && (
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-[12px] font-bold" style={{ background: 'var(--blue-bg)', color: 'var(--accent-ink)' }}>{userName.trim().slice(0, 1).toUpperCase()}</span>
                <span className="font-semibold text-[13px]">{userName}</span>
              </span>
            )}
            {right}
          </div>
        </>
      )}
    </div>
  );
}
