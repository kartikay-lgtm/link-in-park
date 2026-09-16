'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import Icon from './Icon';

/* The L2 pop-up. Closes on the backdrop, the × button, or Escape - each of
   which simply goes back in history, which un-intercepts the route. */
export default function Modal({ children, fullHref }: { children: ReactNode; fullHref: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') router.back(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [router]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-8" style={{ background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(3px)' }} onClick={() => router.back()} role="dialog" aria-modal="true">
      <div className="w-full max-w-6xl max-h-[94vh] overflow-y-auto relative" style={{ background: 'var(--panel)', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.18)' }} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-end gap-1 px-4 pt-3 pb-1" style={{ background: 'linear-gradient(var(--panel) 70%, transparent)' }}>
          <a href={fullHref} className="btn btn-sm muted"><Icon name="external" size={14} />Open as page</a>
          <button type="button" className="btn btn-icon" onClick={() => router.back()} aria-label="Close" title="Close (Esc)"><Icon name="x" size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
