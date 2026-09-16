'use client';

import { useState, type ReactNode } from 'react';

export type Tab = { id: string; label: string; badge?: string | number; content: ReactNode };

/* Tabs for drilling down: everything is rendered once (server-side), only
   the active panel is shown. Keeps the first view light without losing
   anything. */
export default function Tabs({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(initial || tabs[0]?.id);
  return (
    <div className="space-y-5">
      <div className="seg" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={active === t.id ? 'on' : ''} onClick={() => setActive(t.id)}>
            {t.label}{t.badge !== undefined && t.badge !== '' ? <span className="cnt">{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {tabs.map((t) => <div key={t.id} role="tabpanel" hidden={active !== t.id}>{t.content}</div>)}
    </div>
  );
}
