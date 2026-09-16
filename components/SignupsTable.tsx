'use client';

import { useMemo, useState } from 'react';

export type SignupRow = { id: string; name: string; phone: string; email: string; installedAt: string | null; attributedAt: string | null; adChannel: string };

function when(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

/* The people behind the sign-ups number, straight from Linkrunner. */
export default function SignupsTable({ rows }: { rows: SignupRow[] }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => [r.name, r.phone, r.email].some((v) => v.toLowerCase().includes(needle)));
  }, [rows, q]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input className="input" style={{ width: 260 }} placeholder="Search name, phone or email…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(100); }} />
        <span className="faint text-xs tabular">{visible.length === rows.length ? `${rows.length} sign-ups` : `${visible.length} of ${rows.length}`}</span>
      </div>
      <div className="panel overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="table table-tight">
          <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Email</th><th>Installed</th><th>Signed up</th></tr></thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={6} className="muted text-center py-6">{rows.length === 0 ? 'No sign-ups recorded for this campaign yet.' : 'No match.'}</td></tr>}
            {visible.slice(0, limit).map((r, i) => (
              <tr key={r.id || i}>
                <td className="muted">{i + 1}</td>
                <td className="font-medium">{r.name || <span className="muted">–</span>}</td>
                <td className="mono text-xs">{r.phone || '–'}</td>
                <td className="text-xs">{r.email || '–'}</td>
                <td className="text-xs whitespace-nowrap">{when(r.installedAt)}</td>
                <td className="text-xs whitespace-nowrap">{when(r.attributedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visible.length > limit && (
        <button className="btn btn-sm" onClick={() => setLimit((l) => l + 200)}>Show more ({visible.length - limit} left)</button>
      )}
    </div>
  );
}
