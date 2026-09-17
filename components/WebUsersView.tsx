'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { hasFirstTouch, matchKey, type WebUser } from '@/lib/webusers-shared';
import Collapsible from './Collapsible';
import Icon from './Icon';
import TimeSeriesChart from './TimeSeriesChart';
import { n } from './ui';
import WebUsersTable from './WebUsersTable';

export type UtmMatch = { campaigns: Array<{ displayId: string; name: string }>; sharedBy: number };

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : '–');
const TZ = 'Asia/Kolkata';
const dayKeyAgo = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return d.toLocaleDateString('en-CA', { timeZone: TZ }); };
const fmtDay = (d: string, year = false) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) }) : '');

type Range = 'all' | '30' | '7' | 'custom' | 'day';
type Group = { key: string; campaign: { displayId: string; name: string } | null; sameName: number; sources: string[]; sharedBy: number; people: WebUser[]; installed: number; candidates: number; bosses: number };
type Outcome = 'all' | 'app' | 'candidate' | 'boss';
type Tally = { users: number; installed: number; candidates: number; bosses: number };

const tally = (people: WebUser[]): Tally => ({
  users: people.length,
  installed: people.filter((u) => u.hasApp).length,
  candidates: people.filter((u) => u.candidateCompleted).length,
  bosses: people.filter((u) => u.bossCompleted).length,
});

/* The web-users dashboard: pick a period, tick campaigns to combine them,
   and open any campaign or day for its people. */
export default function WebUsersView({ users, matches }: { users: WebUser[]; matches: Record<string, UtmMatch> }) {
  const [range, setRange] = useState<Range>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [day, setDay] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('all');
  const [showChart, setShowChart] = useState(false);

  /* ---- period -------------------------------------------------------------- */
  const inRange = useMemo(() => {
    const lo = range === '30' ? dayKeyAgo(30) : range === '7' ? dayKeyAgo(7) : range === 'custom' ? from : range === 'day' ? day : '';
    const hi = range === 'custom' ? to : range === 'day' ? day : '';
    return users.filter((u) => (!lo || u.createdDay >= lo) && (!hi || u.createdDay <= hi));
  }, [users, range, from, to, day]);

  /* ---- campaigns ----------------------------------------------------------- */
  const groupKeyOf = (u: WebUser) => {
    const k = matchKey(u.source);
    const m = matches[k];
    return m && m.campaigns.length ? 'c:' + m.campaigns[0].displayId : 'u:' + k;
  };
  const campaignOf = (u: WebUser) => { const m = matches[matchKey(u.source)]; return m && m.campaigns.length ? m.campaigns[0] : null; };

  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const u of inRange) {
      const key = groupKeyOf(u);
      const match = matches[matchKey(u.source)];
      let g = m.get(key);
      if (!g) {
        g = { key, campaign: match && match.campaigns.length ? match.campaigns[0] : null, sameName: match ? Math.max(0, match.campaigns.length - 1) : 0, sources: [], sharedBy: match?.sharedBy || 0, people: [], installed: 0, candidates: 0, bosses: 0 };
        m.set(key, g);
      }
      const src = u.source.trim() || '(no utm_campaign)';
      if (!g.sources.includes(src)) g.sources.push(src);
      g.people.push(u); if (u.hasApp) g.installed++; if (u.candidateCompleted) g.candidates++; if (u.bossCompleted) g.bosses++;
    }
    return [...m.values()].sort((a, b) => b.people.length - a.people.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inRange, matches]);
  const linked = groups.filter((g) => g.campaign || g.sharedBy);
  const standalone = groups.filter((g) => !g.campaign && !g.sharedBy);

  // What the numbers at the top describe: the ticked campaigns, or everyone.
  const focus = useMemo(() => (selected.size ? inRange.filter((u) => selected.has(groupKeyOf(u))) : inRange), [inRange, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = tally(focus);
  const bossFlow = focus.filter((u) => Boolean(u.bossStatus)).length;
  const firstTouch = useMemo(() => hasFirstTouch(users), [users]);
  const overwritten = inRange.filter((u) => u.secondTouch).length;

  /* ---- per day ------------------------------------------------------------- */
  const perDay = useMemo(() => {
    const m = new Map<string, WebUser[]>();
    for (const u of focus) if (u.createdDay) (m.get(u.createdDay) || m.set(u.createdDay, []).get(u.createdDay)!).push(u);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([d, people]) => ({ day: d, ...tally(people) }));
  }, [focus]);

  const daily = useMemo(() => {
    const days = new Map<string, { signed: number; done: number }>();
    for (const u of focus) {
      if (!u.createdDay) continue;
      const d = days.get(u.createdDay) || { signed: 0, done: 0 };
      d.signed++; if (u.candidateCompleted || u.bossCompleted) d.done++;
      days.set(u.createdDay, d);
    }
    const keys = [...days.keys()].sort();
    if (keys.length === 0) return [];
    const out: string[] = [];
    for (const d = new Date(keys[0] + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= keys[keys.length - 1]; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
    return [
      { name: 'Signed up', color: 'var(--series-blue)', points: out.map((d) => ({ date: d, value: days.get(d)?.signed || 0 })) },
      { name: 'Completed onboarding', color: 'var(--series-aqua)', points: out.map((d) => ({ date: d, value: days.get(d)?.done || 0 })) },
    ];
  }, [focus]);

  const next = useMemo(() => {
    const m = new Map<string, { label: string; count: number; completed: number; installed: number }>();
    for (const u of focus) {
      const step = u.journey[0] || '';
      const g = m.get(step.toLowerCase()) || { label: step || 'Stayed on the web (no later step)', count: 0, completed: 0, installed: 0 };
      g.count++; if (u.candidateCompleted || u.bossCompleted) g.completed++; if (u.hasApp) g.installed++;
      m.set(step.toLowerCase(), g);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [focus]);
  const anyJourney = users.some((u) => u.journey.length > 0);

  const first = inRange.length ? inRange[inRange.length - 1].createdDay : '';
  const last = inRange.length ? inRange[0].createdDay : '';

  /* ---- selection ----------------------------------------------------------- */
  const toggleSelect = (key: string) => setSelected((s) => { const c = new Set(s); if (c.has(key)) c.delete(key); else c.add(key); return c; });
  const toggleAll = (list: Group[]) => setSelected((s) => {
    const all = list.every((g) => s.has(g.key));
    const c = new Set(s);
    for (const g of list) { if (all) c.delete(g.key); else c.add(g.key); }
    return c;
  });
  const selectedNames = groups.filter((g) => selected.has(g.key)).map((g) => g.campaign?.name || g.sources[0]);

  const filterPeople = (people: WebUser[]) =>
    outcome === 'app' ? people.filter((u) => u.hasApp)
      : outcome === 'candidate' ? people.filter((u) => u.candidateCompleted)
      : outcome === 'boss' ? people.filter((u) => u.bossCompleted)
      : people;

  const renderTable = (title: string, list: Group[], isStandalone: boolean) => {
    const allTicked = list.length > 0 && list.every((g) => selected.has(g.key));
    return (
      <section className="space-y-2">
        <div className="section-title">{title}</div>
        {!isStandalone && !firstTouch && overwritten > 0 && (
          <div className="alert alert-warn text-[13px]">
            {overwritten} of {inRange.length} people carry a <b>later step</b> as their utm_campaign (the QR / app-download flow overwrites the original source), so their real source — almost always a LinkedIn ad — is hidden here. This resolves itself once the table stores the first touch in <span className="mono">first_utm_campaign</span>.
          </div>
        )}
        <div className="panel overflow-x-auto">
          <table className="table table-tight">
            <thead><tr>
              <th style={{ width: 34 }}><input type="checkbox" checked={allTicked} onChange={() => toggleAll(list)} aria-label="Select all" title="Select all" /></th>
              <th style={{ width: 24 }}></th>
              {isStandalone ? <th>Source</th> : <><th>Linkrunner campaign</th><th>Source</th></>}
              <th className="num">Users</th>
              <th className="num" title="Have the app installed now">Installed the app</th>
              <th className="num" title="Completed candidate onboarding">Candidate</th>
              <th className="num" title="Completed boss onboarding">Boss</th>
            </tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={isStandalone ? 7 : 8} className="muted text-center py-6">Nothing in this period.</td></tr>}
              {list.map((g) => {
                const open = expanded === g.key;
                const ticked = selected.has(g.key);
                const people = open ? filterPeople(g.people) : [];
                return [
                  <tr key={g.key} onClick={() => { setExpanded(open ? null : g.key); setOutcome('all'); }} style={{ cursor: 'pointer', background: ticked ? 'var(--tint)' : open ? 'var(--hover)' : undefined }} aria-expanded={open}>
                    <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={ticked} onChange={() => toggleSelect(g.key)} aria-label={`Select ${g.campaign?.name || g.sources[0]}`} /></td>
                    <td><Icon name="chevron" size={14} className="faint" style={{ transform: open ? 'rotate(180deg)' : undefined }} /></td>
                    {!isStandalone && (
                      <td className="text-[13px]">
                        {g.campaign
                          ? <><span className="font-medium">{g.campaign.name}</span>{g.sameName > 0 && <span className="faint text-xs ml-1" title="More than one campaign has this exact name">+{g.sameName} same name</span>}</>
                          : <span className="badge badge-warn" title="This identifier is used by many Linkrunner campaigns, so these users cannot be tied to one campaign">shared by {g.sharedBy} campaigns</span>}
                      </td>
                    )}
                    <td className={`mono text-[12px] max-w-[240px] truncate ${isStandalone ? 'font-medium' : ''}`} title={g.sources.join(', ')}>{g.sources.join(', ')}</td>
                    <td className="num font-medium">{g.people.length}</td>
                    <td className="num">{g.installed}<span className="faint text-xs ml-1.5">{pct(g.installed, g.people.length)}</span></td>
                    <td className="num">{g.candidates}<span className="faint text-xs ml-1.5">{pct(g.candidates, g.people.length)}</span></td>
                    <td className="num">{g.bosses}<span className="faint text-xs ml-1.5">{pct(g.bosses, g.people.length)}</span></td>
                  </tr>,
                  open && (
                    <tr key={g.key + ':people'}>
                      <td colSpan={isStandalone ? 7 : 8} style={{ background: 'var(--bg)', padding: '12px 16px 16px' }}>
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          <div className="seg">
                            {([['all', `All ${g.people.length}`], ['app', `Installed the app ${g.installed}`], ['candidate', `Candidate ${g.candidates}`], ['boss', `Boss ${g.bosses}`]] as const).map(([k, l]) => (
                              <button key={k} type="button" className={outcome === k ? 'on' : ''} onClick={(e) => { e.stopPropagation(); setOutcome(k); }}>{l}</button>
                            ))}
                          </div>
                          {g.campaign && <Link href={`/campaigns/${encodeURIComponent(g.campaign.displayId)}`} className="btn btn-sm btn-outline ml-auto" onClick={(e) => e.stopPropagation()}><Icon name="external" size={14} />Open campaign</Link>}
                        </div>
                        <WebUsersTable users={people} showUtm={false} compact />
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  const steps = [
    { label: 'Web users', value: totals.users },
    { label: 'Became candidates', value: totals.candidates },
    { label: 'Downloaded the app', value: totals.installed },
    { label: 'Entered the boss flow', value: bossFlow },
    { label: 'Became bosses', value: totals.bosses },
  ];

  return (
    <div className="space-y-8">
      {/* Period */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="seg">
          {([['all', 'All time'], ['30', 'Last 30 days'], ['7', 'Last 7 days'], ['custom', 'Custom range'], ['day', 'Single day']] as const).map(([k, l]) => (
            <button key={k} type="button" className={range === k ? 'on' : ''} onClick={() => { setRange(k); if (k === 'day' && !day) setDay(last || dayKeyAgo(0)); }}>{l}</button>
          ))}
        </div>
        {range === 'custom' && (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <input type="date" className="input" style={{ width: 'auto', height: 30 }} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <span className="faint">to</span>
            <input type="date" className="input" style={{ width: 'auto', height: 30 }} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </span>
        )}
        {range === 'day' && (
          <span className="inline-flex items-center gap-1">
            <button type="button" className="btn btn-icon" onClick={() => { const d = new Date((day || dayKeyAgo(0)) + 'T00:00:00'); d.setDate(d.getDate() - 1); setDay(d.toLocaleDateString('en-CA')); }} aria-label="Previous day">‹</button>
            <input type="date" className="input" style={{ width: 'auto', height: 30 }} value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day" />
            <button type="button" className="btn btn-icon" onClick={() => { const d = new Date((day || dayKeyAgo(0)) + 'T00:00:00'); d.setDate(d.getDate() + 1); setDay(d.toLocaleDateString('en-CA')); }} aria-label="Next day">›</button>
          </span>
        )}
        <button type="button" className={`btn btn-sm ${showChart ? 'btn-active' : 'btn-outline'}`} onClick={() => setShowChart((v) => !v)}>{showChart ? 'Hide chart' : 'View chart'}</button>
        <span className="ml-auto faint text-xs">{first && last ? (first === last ? fmtDay(first, true) : `${fmtDay(first)} – ${fmtDay(last, true)}`) : 'no users in this period'}</span>
      </div>

      {/* Funnel for the selection (or everyone) */}
      <div className="panel p-5">
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="badge badge-accent">{selected.size} campaign{selected.size === 1 ? '' : 's'} selected</span>
            <span className="text-[13px] muted truncate max-w-[720px]" title={selectedNames.join(', ')}>{selectedNames.slice(0, 6).join(' · ')}{selectedNames.length > 6 ? ` · +${selectedNames.length - 6} more` : ''}</span>
            <button type="button" className="btn btn-sm muted ml-auto" onClick={() => setSelected(new Set())}><Icon name="x" size={14} />Clear selection</button>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-5">
          {steps.map((st, i) => (
            <div key={st.label} className="space-y-1.5">
              <div className="text-[12px] muted font-medium">{st.label}</div>
              <div className="text-[24px] font-semibold tabular" style={{ letterSpacing: '-0.02em', lineHeight: 1.1 }}>{n(st.value)}<span className="faint text-[13px] font-normal ml-1.5">{i === 0 ? '' : pct(st.value, totals.users)}</span></div>
              <div className="h-1.5 rounded-full" style={{ background: 'var(--panel-2)' }}><div className="h-1.5 rounded-full" style={{ width: `${totals.users ? Math.max(2, (100 * st.value) / totals.users) : 0}%`, background: i === 0 ? 'var(--ink)' : i === 2 ? 'var(--series-blue)' : 'var(--series-aqua)' }} /></div>
            </div>
          ))}
        </div>
      </div>

      {showChart && <TimeSeriesChart title="Web users per day" series={daily} defaultRange={0} />}

      {renderTable('By Linkrunner campaign', linked, false)}
      {standalone.length > 0 && renderTable('Standalone web campaigns', standalone, true)}

      <Collapsible title="Per day" hint={`${perDay.length} days${selected.size ? ' · selected campaigns' : ''}`}>
        <div className="panel overflow-x-auto">
          <table className="table table-tight">
            <thead><tr><th>Day</th><th className="num">Users</th><th className="num">Installed the app</th><th className="num">Candidate</th><th className="num">Boss</th><th></th></tr></thead>
            <tbody>
              {perDay.length === 0 && <tr><td colSpan={6} className="muted text-center py-6">Nothing in this period.</td></tr>}
              {perDay.map((d) => (
                <tr key={d.day}>
                  <td className="whitespace-nowrap">{fmtDay(d.day, true)}</td>
                  <td className="num font-medium">{d.users}</td>
                  <td className="num">{d.installed}<span className="faint text-xs ml-1.5">{pct(d.installed, d.users)}</span></td>
                  <td className="num">{d.candidates}<span className="faint text-xs ml-1.5">{pct(d.candidates, d.users)}</span></td>
                  <td className="num">{d.bosses}<span className="faint text-xs ml-1.5">{pct(d.bosses, d.users)}</span></td>
                  <td className="text-right"><button type="button" className="btn btn-sm muted" onClick={() => { setRange('day'); setDay(d.day); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Focus day</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Collapsible>

      {anyJourney && (
        <Collapsible title="Where they went next" hint={`${next.length}`}>
          <div className="panel overflow-x-auto">
            <table className="table table-tight">
              <thead><tr><th>Next step</th><th className="num">People</th><th className="num">Share</th><th className="num">Completed</th><th className="num">Rate</th><th className="num">Installed app</th><th className="num">Rate</th></tr></thead>
              <tbody>
                {next.map((g) => (
                  <tr key={g.label} style={g.label.startsWith('Stayed') ? { color: 'var(--ink-2)' } : undefined}>
                    <td className={g.label.startsWith('Stayed') ? '' : 'mono text-[12.5px]'}>{g.label}</td>
                    <td className="num">{g.count}</td>
                    <td className="num muted">{pct(g.count, focus.length)}</td>
                    <td className="num">{g.completed}</td>
                    <td className="num muted">{pct(g.completed, g.count)}</td>
                    <td className="num">{g.installed}</td>
                    <td className="num muted">{pct(g.installed, g.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Collapsible>
      )}

      <Collapsible title="All people" hint={`${focus.length}`}>
        <WebUsersTable users={focus} campaignOf={campaignOf} />
      </Collapsible>
    </div>
  );
}
