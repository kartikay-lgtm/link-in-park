'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

export type PickerOption = { value: string; label: string; hint?: string };

/* A dropdown you can type into, with checkboxes. Selected options float to
   the top so a long list stays manageable. */
export default function MultiPicker({ label, options, selected, onChange, placeholder = 'Type to search…' }: {
  label: string; options: PickerOption[]; selected: string[]; onChange: (values: string[]) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    setTimeout(() => input.current?.focus(), 0);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const sel = useMemo(() => new Set(selected), [selected]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = needle ? options.filter((o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle) || (o.hint || '').toLowerCase().includes(needle)) : options;
    const picked = match.filter((o) => sel.has(o.value));
    const rest = match.filter((o) => !sel.has(o.value));
    return { list: [...picked, ...rest], total: match.length };
  }, [options, q, sel]);
  const LIMIT = 300;

  function toggle(v: string) {
    onChange(sel.has(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  return (
    <div className="relative" ref={root}>
      <button type="button" className={`btn ${selected.length ? 'btn-active' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label}{selected.length ? <span className="badge badge-accent" style={{ background: '#fff' }}>{selected.length}</span> : null}<Icon name="chevron" size={14} className="opacity-60" />
      </button>
      {open && (
        <div className="menu absolute left-0 mt-1 z-20 w-[360px] max-w-[90vw]" style={{ padding: 8 }}>
          <input ref={input} className="input" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && shown.list.length > 0) { toggle(shown.list.find((o) => !sel.has(o.value))?.value ?? shown.list[0].value); } }} />
          <div className="flex items-center gap-3 text-xs px-1 py-2">
            <button type="button" className="link" onClick={() => onChange(Array.from(new Set([...selected, ...shown.list.slice(0, LIMIT).map((o) => o.value)])))}>Select shown ({Math.min(shown.total, LIMIT)})</button>
            <button type="button" className="link" onClick={() => onChange([])} disabled={!selected.length} style={!selected.length ? { opacity: .4 } : undefined}>Clear</button>
            <span className="faint ml-auto">{shown.total} of {options.length}</span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {shown.list.length === 0 && <div className="muted text-sm px-2 py-4 text-center">No match.</div>}
            {shown.list.slice(0, LIMIT).map((o) => (
              <label key={o.value} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[13px]" style={{ background: sel.has(o.value) ? 'var(--tint)' : undefined }}>
                <input type="checkbox" checked={sel.has(o.value)} onChange={() => toggle(o.value)} />
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="faint text-xs ml-auto whitespace-nowrap">{o.hint}</span>}
              </label>
            ))}
            {shown.total > LIMIT && <div className="faint text-xs px-2 py-2">Type to narrow — {shown.total - LIMIT} more not shown.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
