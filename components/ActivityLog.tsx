'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Icon from './Icon';

export type Entry = { id: number; at: string; userName: string; action: string; target: string | null; summary: string; details: Record<string, unknown> | null };

const LABEL: Record<string, string> = {
  'link.create': 'Link created', 'redirect.replace': 'Redirect set', 'redirect.custom': 'Custom redirect', 'campaign.rename': 'Renamed', 'campaign.notes': 'Notes',
  'campaign.move': 'Moved to folder', 'folder.create': 'Folder created', 'folder.rename': 'Folder renamed', 'folder.delete': 'Folder deleted', 'folder.move': 'Folder moved',
  'webusers.upload': 'CSV uploaded', 'sync.import': 'Import', 'sync.refresh': 'Refresh', 'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'auth.login_failed': 'Failed sign-in',
  'user.create': 'User created', 'user.password': 'Password reset', 'user.enable': 'User enabled', 'user.disable': 'User disabled', 'user.role': 'Role changed',
};
const TONE = (a: string) => a.startsWith('link') || a.startsWith('redirect') ? 'badge-accent' : a === 'auth.login_failed' || a === 'user.disable' || a === 'folder.delete' ? 'badge-bad' : a.startsWith('auth') ? 'badge-muted' : a.startsWith('user') ? 'badge-warn' : 'badge';

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).replace(',', '');
}
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

/* Everything anyone did, newest first. Filter by person, kind of action,
   day range or free text; open a row for the full details. */
export default function ActivityLog({ entries, people }: { entries: Entry[]; people: string[] }) {
  const [who, setWho] = useState('');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [limit, setLimit] = useState(200);

  const kinds = useMemo(() => Array.from(new Set(entries.map((e) => e.action))).sort(), [entries]);
  const names = useMemo(() => Array.from(new Set([...people, ...entries.map((e) => e.userName)])).sort(), [people, entries]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) =>
      (!who || e.userName === who) && (!kind || e.action === kind) &&
      (!from || dayOf(e.at) >= from) && (!to || dayOf(e.at) <= to) &&
      (!needle || e.summary.toLowerCase().includes(needle) || (e.target || '').toLowerCase().includes(needle) || JSON.stringify(e.details || {}).toLowerCase().includes(needle)));
  }, [entries, who, kind, q, from, to]);

  const link = (e: Entry) => {
    const d = e.details || {};
    return typeof d.link === 'string' ? d.link : null;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="search" style={{ width: 240 }}><Icon name="search" size={15} /><input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person"><option value="">Everyone</option>{names.map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <select className="select" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Action"><option value="">All actions</option>{kinds.map((k) => <option key={k} value={k}>{LABEL[k] || k}</option>)}</select>
        <input type="date" className="input" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
        <span className="faint">to</span>
        <input type="date" className="input" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
        {(who || kind || q || from || to) && <button type="button" className="btn muted" onClick={() => { setWho(''); setKind(''); setQ(''); setFrom(''); setTo(''); }}><Icon name="x" size={14} />Clear</button>}
        <span className="ml-auto faint text-xs tabular">{shown.length} of {entries.length}</span>
      </div>
      <div className="panel overflow-x-auto">
        <table className="table table-tight">
          <thead><tr><th style={{ width: 24 }}></th><th>When</th><th>Who</th><th>Action</th><th>What</th><th>Link</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={6} className="muted text-center py-8">Nothing logged yet.</td></tr>}
            {shown.slice(0, limit).map((e) => {
              const isOpen = open === e.id;
              const l = link(e);
              return [
                <tr key={e.id} onClick={() => setOpen(isOpen ? null : e.id)} style={{ cursor: 'pointer', background: isOpen ? 'var(--tint)' : undefined }}>
                  <td><Icon name="chevron" size={13} className="faint" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} /></td>
                  <td className="whitespace-nowrap muted text-[12.5px]">{when(e.at)}</td>
                  <td className="whitespace-nowrap font-medium">{e.userName}</td>
                  <td><span className={`badge whitespace-nowrap ${TONE(e.action)}`}>{LABEL[e.action] || e.action}</span></td>
                  <td className="text-[13px]">{e.summary}</td>
                  <td className="whitespace-nowrap">{l ? <span className="inline-flex items-center gap-1"><span className="mono text-[12px]">{l.replace(/^https?:\/\//, '')}</span>{e.target && <Link href={`/campaigns/${encodeURIComponent(e.target)}`} className="btn btn-icon" title="Open campaign" onClick={(ev) => ev.stopPropagation()}><Icon name="external" size={13} /></Link>}</span> : e.target && e.action.startsWith('redirect') ? <Link href={`/campaigns/${encodeURIComponent(e.target)}`} className="link text-[12.5px]" onClick={(ev) => ev.stopPropagation()}>{e.target}</Link> : <span className="faint">—</span>}</td>
                </tr>,
                isOpen && (
                  <tr key={e.id + ':d'}>
                    <td colSpan={6} style={{ background: 'var(--bg)', padding: '10px 16px 12px' }}>
                      <div className="grid gap-x-8 gap-y-1 text-[12.5px]" style={{ gridTemplateColumns: 'max-content 1fr', maxWidth: 900 }}>
                        <span className="muted">Time</span><span>{new Date(e.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
                        <span className="muted">Action</span><span className="mono">{e.action}</span>
                        {e.target && <><span className="muted">Target</span><span className="mono">{e.target}</span></>}
                        {e.details && Object.entries(e.details).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
                          <span key={k} className="contents"><span className="muted">{k}</span><span className="mono break-all">{typeof v === 'string' ? v : JSON.stringify(v)}</span></span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
      {shown.length > limit && <button className="btn btn-sm" onClick={() => setLimit((l) => l + 300)}>Show more ({shown.length - limit} left)</button>}
    </div>
  );
}
