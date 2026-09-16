'use client';

import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import type { WebUser } from '@/lib/webusers-shared';
import Icon from './Icon';

function when(iso: string | null): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).replace(',', '');
}

/* Long flow names, shortened for the row; the full name sits in the tooltip
   and in the expanded details. */
function shortStep(step: string): string {
  if (/->\s*QR/i.test(step) || /\bQR\b/.test(step)) return 'QR';
  if (/WATI/i.test(step)) return 'WATI';
  if (/Web Mobile/i.test(step)) return 'Web-mobile flow';
  return step.length > 22 ? step.slice(0, 22) + '…' : step;
}

export function Onboarding({ u }: { u: WebUser }) {
  if (u.bossStatus) return <span className={`badge whitespace-nowrap ${u.bossCompleted ? 'badge-ok' : 'badge-warn'}`}>{u.bossCompleted ? 'Boss ✓' : 'Boss · in progress'}</span>;
  return <span className={`badge whitespace-nowrap ${u.candidateCompleted ? 'badge-ok' : 'badge-muted'}`}>{u.candidateCompleted ? 'Candidate ✓' : 'Started'}</span>;
}

/* The people behind the web-users number. Compact rows; click one to
   expand its details. */
export default function WebUsersTable({ users, showUtm = true, compact = false, campaignOf }: { users: WebUser[]; showUtm?: boolean; compact?: boolean; campaignOf?: (u: WebUser) => { displayId: string; name: string } | null }) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(compact ? 50 : 100);
  const [open, setOpen] = useState<string | null>(null);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => [u.name, u.role, u.company, u.utmCampaign, u.source, u.phone, u.email].some((v) => v.toLowerCase().includes(needle)));
  }, [users, q]);
  const cols = 10 + (campaignOf ? 1 : 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="search" style={{ width: 240 }}>
          <Icon name="search" size={15} />
          <input className="input" placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(100); }} />
        </div>
        <span className="faint text-xs tabular">{visible.length === users.length ? users.length : `${visible.length} of ${users.length}`}</span>
      </div>
      <div className="panel overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="table table-tight" style={{ fontSize: 12.5 }}>
          <thead><tr>
            <th style={{ width: 24 }}></th>
            <th>Name</th><th>Phone</th><th title="LinkedIn">in</th>
            {campaignOf && <th>Linkrunner campaign</th>}
            <th>Role</th><th>Company</th><th>Then</th><th>Onboarding</th><th>App</th>
            <th>Signed up</th><th>Last active</th>
          </tr></thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={cols} className="muted text-center py-6">{users.length === 0 ? 'No web users recorded.' : 'No match.'}</td></tr>}
            {visible.slice(0, limit).map((u) => {
              const isOpen = open === u.id;
              const c = campaignOf ? campaignOf(u) : null;
              return (
                <Fragment key={u.id}>
                  <tr onClick={() => setOpen(isOpen ? null : u.id)} style={{ cursor: 'pointer', background: isOpen ? 'var(--tint)' : undefined }}>
                    <td><Icon name="chevron" size={13} className="faint" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }} /></td>
                    <td className="font-medium whitespace-nowrap max-w-[170px] truncate" title={u.name}>{u.name || <span className="faint">(no name)</span>}</td>
                    <td className="mono whitespace-nowrap faint" style={{ fontSize: 11.5 }}>{u.phone || '–'}</td>
                    <td>{u.linkedinUrl ? <a href={u.linkedinUrl} target="_blank" rel="noreferrer" className="btn btn-icon" style={{ width: 24, height: 24 }} title="Open LinkedIn profile" onClick={(e) => e.stopPropagation()}><Icon name="external" size={13} /></a> : <span className="faint">–</span>}</td>
                    {campaignOf && <td className="whitespace-nowrap max-w-[200px] truncate">{c ? <Link href={`/campaigns/${encodeURIComponent(c.displayId)}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{c.name}</Link> : <span className="faint">—</span>}</td>}
                    <td className="max-w-[150px] truncate" title={u.role}>{u.role || <span className="faint">–</span>}</td>
                    <td className="max-w-[150px] truncate" title={u.company}>{u.company || <span className="faint">–</span>}</td>
                    <td className="whitespace-nowrap" title={u.journey.join(' → ')}>{u.journey.length ? <span className="badge badge-muted mono">{shortStep(u.journey[0])}{u.journey.length > 1 ? ` +${u.journey.length - 1}` : ''}</span> : <span className="faint">—</span>}</td>
                    <td><Onboarding u={u} /></td>
                    <td>{u.hasApp ? <span className="badge badge-ok whitespace-nowrap">Installed</span> : <span className="badge badge-muted whitespace-nowrap">Web only</span>}</td>
                    <td className="whitespace-nowrap muted" style={{ fontSize: 12 }}>{when(u.createdAt)}</td>
                    <td className="whitespace-nowrap muted" style={{ fontSize: 12 }}>{when(u.lastActiveAt)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={cols} style={{ background: 'var(--bg)', padding: '10px 16px 12px' }}>
                        <div className="grid gap-x-8 gap-y-1.5 text-[12.5px]" style={{ gridTemplateColumns: 'max-content 1fr', maxWidth: 820 }}>
                          {showUtm && <><span className="muted">Source</span><span className="mono">{u.source || '—'}{u.secondTouch ? ' (later step)' : ''}</span></>}
                          <span className="muted">Journey</span><span className="mono">{u.journey.length ? u.journey.join('  →  ') : '—'}</span>
                          <span className="muted">Role</span><span>{u.role || '—'}</span>
                          <span className="muted">Company</span><span>{u.company || '—'}</span>
                          {u.email && <><span className="muted">Email</span><span>{u.email}</span></>}
                          {u.linkedinUrl && <><span className="muted">LinkedIn</span><a href={u.linkedinUrl} target="_blank" rel="noreferrer" className="link truncate">{u.linkedinUrl}</a></>}
                          <span className="muted">Registered to</span><span className="mono">{u.registeredTo.join(', ') || '—'}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {visible.length > limit && <button className="btn btn-sm" onClick={() => setLimit((l) => l + 200)}>Show more ({visible.length - limit} left)</button>}
    </div>
  );
}
