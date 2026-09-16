'use client';

import { useEffect, useState } from 'react';

export const THEMES = [
  { id: 'paper', label: 'Paper', hint: 'light · warm white, black button, indigo accent' },
  { id: 'trellis', label: 'Trellis', hint: 'light · cream, deep green — the Grapevine one' },
  { id: 'midnight', label: 'Midnight', hint: 'dark · graphite, soft indigo' },
  { id: 'hybrid', label: 'Hybrid', hint: 'dark · black, acid lime — the Link-in Park one' },
] as const;
export type ThemeId = (typeof THEMES)[number]['id'];
const KEY = 'lip-theme';

export function applyTheme(id: string) {
  if (id === 'paper') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', id);
}

/* Theme switcher in the header. The choice lives in this browser; a tiny
   inline script in the layout applies it before first paint. */
export default function ThemePicker() {
  // Read the saved choice after mount (the server cannot know it); the inline
  // script in the layout has already applied it to the page by then.
  const [theme, setTheme] = useState<ThemeId>('paper');
  useEffect(() => {
    const id = window.setTimeout(() => {
      try { const saved = localStorage.getItem(KEY) as ThemeId | null; if (saved && THEMES.some((t) => t.id === saved)) setTheme(saved); } catch {}
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  function pick(id: ThemeId) {
    setTheme(id);
    applyTheme(id);
    try { localStorage.setItem(KEY, id); } catch {}
  }
  return (
    <label className="inline-flex items-center gap-1.5 text-[12.5px] muted" title={THEMES.find((t) => t.id === theme)?.hint}>
      Theme
      <select className="select" style={{ height: 26, padding: '0 24px 0 8px', fontSize: 12.5, width: 'auto' }} value={theme} onChange={(e) => pick(e.target.value as ThemeId)} aria-label="Theme">
        {THEMES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </label>
  );
}
