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

type Group = { key: string; campaign: { displayId: string; name: string } | null; sameName: number; sources: string[]; sharedBy: number; people: WebUser[]; installed: number; candidates: number; bosses: number };
type Outcome = 'all' | 'app' | 'candidate' | 'boss';

/* The web-users dashboard: the funnel, then every Linkrunner campaign with
   its people one click away. The chart is there for whoever wants it. */
export default function WebUsersView({ users, matches }: { users: WebUser[]; matches: Record<string, UtmMatch> }) {
  const [range, setRange] = useState<'all' | '7' | '30'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('all');
  const [showChart, setShowChart] = useState(false);

  const inRange = useMemo(() => {
    if (range === 'all') return users;
    const d = new Date(); d.setDate(d.getDate() - Number(range));
    const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return users.filter((u) => u.createdDay >= key);
  }, [users, range]);

  const campaignOf = (u: WebUser) => { const m = matches[matchKey(u.source)]; return m && m.campaigns.length ? m.campaigns[0] : null; };

  // Every person sits under their Linkrunner campaign when the source
  // resolves to one; otherwise under the raw source.
  const groups = useMemo(() => {
    const m = new Map<string, Group>();
    for (const u of inRange) {
      const k = matchKey(u.source);
      const match = matches[k];
      const key = match && match.campaigns.length ? 'c:' + match.campaigns[0].displayId : 'u:' + k;
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
  }, [inRange, matches]);

  const installed = inRange.filter((u) => u.hasApp).length;
  const bosses = inRange.filter((u) => u.bossCompleted).length;
  const candidates = inRange.filter((u) => u.candidateCompleted).length;
  const bossFlow = inRange.filter((u) => Boolean(u.bossStatus)).length;
  const firstTouch = useMemo(() => hasFirstTouch(users), [users]);
  const overwritten = inRange.filter((u) => u.secondTouch).length;

  const daily = useMemo(() => {
    const days = new Map<string, { signed: number; done: number }>();
    for (const u of inRange) {
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
  }, [inRange]);

  // Where people went after their first touch, for the "next step" table.
  const next = useMemo(() => {
    const m = new Map<string, { label: string; count: number; completed: number; installed: number }>();
    for (const u of inRange) {
      const step = u.journey[0] || '';
      const g = m.get(step.toLowerCase()) || { label: step || 'Stayed on the web (no later step)', count: 0, completed: 0, installed: 0 };
      g.count++; if (u.candidateCompleted || u.bossCompleted) g.completed++; if (u.hasApp) g.installed++;
      m.set(step.toLowerCase(), g);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [inRange]);
  const anyJourney = users.some((u) => u.journey.length > 0);

  const first = inRange.length ? inRange[inRange.length - 1].createdDay : '';
  const last = inRange.length ? inRange[0].createdDay : '';
  const fmt = (d: string) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

  // Sources that resolve to a Linkrunner campaign (or to the shared
  // identifier) versus standalone web links with no Linkrunner campaign.
  const linked = groups.filter((g) => g.campaign || g.sharedBy);
  const standalone = groups.filter((g) => !g.campaign && !g.sharedBy);

  const filterPeople = (people: WebUser[]) =>
    outcome === 'app' ? people.filter((u) => u.hasApp)
      : outcome === 'candidate' ? people.filter((u) => u.candidateCompleted)
      : outcome === 'boss' ? people.filter((u) => u.bossCompleted)
      : people;

  const renderTable = (title: string, list: Group[], isStandalone: boolean) => (
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
            <th style={{ width: 28 }}></th>
            {isStandalone ? <th>Source</th> : <><th>Linkrunner campaign</th><th>Source</th></>}
            <th className="num">Users</th>
            <th className="num" title="Have the app installed now">Installed the app</th>
            <th className="num" title="Completed candidate onboarding">Candidate</th>
            <th className="num" title="Completed boss onboarding">Boss</th>
          </tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={isStandalone ? 6 : 7} className="muted text-center py-6">Nothing in this period.</td></tr>}
            {list.map((g) => {
              const open = expanded === g.key;
              const people = open ? filterPeople(g.people) : [];
              return [
                <tr key={g.key} onClick={() => { setExpanded(open ? null : g.key); setOutcome('all'); }} style={{ cursor: 'pointer', background: open ? 'var(--tint)' : undefined }} aria-expanded={open}>
                  <td><Icon name="chevron" size={14} className="faint" style={{ transform: open ? 'rotate(180deg)' : undefined }} /></td>
                  {!isStandalone && (
                    <td className="text-[13px]">
                      {g.campaign
                        ? <><span className="font-medium">{g.campaign.name}</span>{g.sameName > 0 && <span className="faint text-xs ml-1" title="More than one campaign has this exact name">+{g.sameName} same name</span>}</>
                        : <span className="badge badge-warn" title="This identifier is used by many Linkrunner campaigns, so these users cannot be tied to one campaign">shared by {g.sharedBy} campaigns</span>}
                    </td>
                  )}
                  <td className={`mono text-[12px] max-w-[260px] truncate ${isStandalone ? 'font-medium' : ''}`} title={g.sources.join(', ')}>{g.sources.join(', ')}</td>
                  <td className="num font-medium">{g.people.length}</td>
                  <td className="num">{g.installed}<span className="faint text-xs ml-1.5">{pct(g.installed, g.people.length)}</span></td>
                  <td className="num">{g.candidates}<span className="faint text-xs ml-1.5">{pct(g.candidates, g.people.length)}</span></td>
                  <td className="num">{g.bosses}<span className="faint text-xs ml-1.5">{pct(g.bosses, g.people.length)}</span></td>
                </tr>,
                open && (
                  <tr key={g.key + ':people'}>
                    <td colSpan={isStandalone ? 6 : 7} style={{ background: 'var(--bg)', padding: '12px 16px 16px' }}>
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

  const steps = [
    { label: 'Web users', value: inRange.length },
    { label: 'Became candidates', value: candidates },
    { label: 'Downloaded the app', value: installed },
    { label: 'Entered the boss flow', value: bossFlow },
    { label: 'Became bosses', value: bosses },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="seg">
          {([['all', 'All time'], ['30', 'Last 30 days'], ['7', 'Last 7 days']] as const).map(([k, l]) => (
            <button key={k} type="button" className={range === k ? 'on' : ''} onClick={() => setRange(k)}>{l}</button>
          ))}
        </div>
        <button type="button" className={`btn btn-sm ${showChart ? 'btn-active' : 'btn-outline'}`} onClick={() => setShowChart((v) => !v)}>{showChart ? 'Hide chart' : 'View chart'}</button>
        <span className="ml-auto faint text-xs">{first && last ? `${fmt(first)} – ${fmt(last)}` : ''}</span>
      </div>

      {/* Funnel */}
      <div className="panel p-5">
        <div className="grid gap-3 sm:grid-cols-5">
          {steps.map((st, i) => (
            <div key={st.label} className="space-y-1.5">
              <div className="text-[12px] muted font-medium">{st.label}</div>
              <div className="text-[24px] font-semibold tabular" style={{ letterSpacing: '-0.02em', lineHeight: 1.1 }}>{n(st.value)}<span className="faint text-[13px] font-normal ml-1.5">{i === 0 ? '' : pct(st.value, inRange.length)}</span></div>
              <div className="h-1.5 rounded-full" style={{ background: 'var(--panel-2)' }}><div className="h-1.5 rounded-full" style={{ width: `${inRange.length ? Math.max(2, (100 * st.value) / inRange.length) : 0}%`, background: i === 0 ? 'var(--ink)' : i === 2 ? 'var(--series-blue)' : 'var(--series-aqua)' }} /></div>
            </div>
          ))}
        </div>
      </div>

      {showChart && <TimeSeriesChart title="Web users per day" series={daily} defaultRange={0} />}

      {/* By campaign, people one click away */}
      {renderTable('By Linkrunner campaign', linked, false)}
      {standalone.length > 0 && renderTable('Standalone web campaigns', standalone, true)}

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
                    <td className="num muted">{pct(g.count, inRange.length)}</td>
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

      <Collapsible title="All people" hint={`${inRange.length}`}>
        <WebUsersTable users={inRange} campaignOf={campaignOf} />
      </Collapsible>
    </div>
  );
}
