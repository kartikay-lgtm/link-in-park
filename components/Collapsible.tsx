'use client';

import { useState, type ReactNode } from 'react';
import Icon from './Icon';

/* A section folded away until asked for. */
export default function Collapsible({ title, hint, children, open = false }: { title: string; hint?: string; children: ReactNode; open?: boolean }) {
  const [on, setOn] = useState(open);
  return (
    <section className="space-y-2">
      <button type="button" className="flex items-center gap-2 text-left" onClick={() => setOn((v) => !v)} aria-expanded={on}>
        <span className="section-title">{title}</span>
        {hint && <span className="faint text-[13px]">{hint}</span>}
        <Icon name="chevron" size={16} className="faint" style={{ transform: on ? 'rotate(180deg)' : undefined }} />
      </button>
      {on && children}
    </section>
  );
}
