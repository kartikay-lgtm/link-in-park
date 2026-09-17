'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { moveCampaignsAction } from '@/app/actions';
import CopyButton from './CopyButton';
import Icon from './Icon';
import FolderSidebar, { type FolderItem, type FolderKey } from './FolderSidebar';
import MultiPicker from './MultiPicker';
import { n } from './ui';

/* One campaign as the list needs it - plain strings and numbers so it can be
   handed from the server page to this client component. */
export type ListRow = {
  displayId: string;
  name: string;
  link: string;
  identifier: string;
  redirectUrl: string;
  created: string;        // ISO
  createdDay: string;     // YYYY-MM-DD in IST, for date filters
  clicks: number | null;
  installs: number | null;
  signups: number | null;
  liveInstalls: number;   // webhook events since the last sync
  liveSignups: number;
  landings: number | null; // GA4 sessions (null when GA4 is not connected)
  users: number | null;    // Metabase users (null when not connected)
  active: boolean;
  deleted: boolean;
  kind: 'marketing' | 'referral' | 'app';
  folderId: string | null;
};

type SortKey = 'name' | 'created' | 'folder' | 'clicks' | 'installs' | 'signups' | 'landings' | 'users' | 'people';
type Created = 'any' | '7' | '30' | '90' | 'custom';

const NUMERIC: SortKey[] = ['created', 'clicks', 'installs', 'signups', 'landings', 'users', 'people'];
const SORT_KEYS: SortKey[] = ['name', 'created', 'folder', 'clicks', 'installs', 'signups', 'landings', 'users', 'people'];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function dayKeyAgo(days: number): string {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

type Totals = { count: number; clicks: number; installs: number; signups: number; landings: number; users: number };
const zero = (): Totals => ({ count: 0, clicks: 0, installs: 0, signups: 0, landings: 0, users: 0 });
function add(t: Totals, r: ListRow): Totals {
  return { count: t.count + 1, clicks: t.clicks + (r.clicks || 0), installs: t.installs + (r.installs || 0) + (r.liveInstalls || 0), signups: t.signups + (r.signups || 0) + (r.liveSignups || 0), landings: t.landings + (r.landings || 0), users: t.users + (r.users || 0) };
}
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '–');

/* The campaign browser: folders on the left; filters, totals for what is
   shown, and a sortable table on the right. Everything happens in the
   browser, so filtering is instant; the choices are mirrored into the URL so
   a view can be refreshed or shared. */
export default function CampaignTable({ rows, folders, mb }: { rows: ListRow[]; folders: FolderItem[]; ga?: boolean; mb: boolean }) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  type View = 'marketing' | 'referral' | 'app' | 'all';
  const [view, setView] = useState<View>((['referral', 'app', 'all'].includes(params.get('view') || '') ? params.get('view') : 'marketing') as View);
  const [folder, setFolder] = useState<FolderKey>(params.get('folder') || 'all');
  const [campaigns, setCampaigns] = useState<string[]>((params.get('c') || '').split(',').filter(Boolean));
  const [idents, setIdents] = useState<string[]>((params.get('ident') || '').split(',').filter(Boolean));
  const [created, setCreated] = useState<Created>((['7', '30', '90', 'custom'].includes(params.get('created') || '') ? params.get('created') : 'any') as Created);
  const [from, setFrom] = useState(params.get('from') || '');
  const [to, setTo] = useState(params.get('to') || '');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>(() => {
    const k = params.get('sort') as SortKey | null;
    const key: SortKey = k && SORT_KEYS.includes(k) ? k : 'created';
    return { key, dir: params.get('dir') === 'asc' ? 'asc' : NUMERIC.includes(key) ? 'desc' : 'asc' };
  });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  // Mirror state into the URL without a server round trip.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const u = new URL(window.location.href);
    const set = (k: string, v: string, def = '') => { if (v && v !== def) u.searchParams.set(k, v); else u.searchParams.delete(k); };
    set('q', q); set('view', view, 'marketing'); set('folder', folder, 'all'); set('c', campaigns.join(',')); set('ident', idents.join(','));
    set('created', created, 'any'); set('from', created === 'custom' ? from : ''); set('to', created === 'custom' ? to : '');
    set('sort', sort.key, 'created'); set('dir', sort.dir, NUMERIC.includes(sort.key) ? 'desc' : 'asc');
    window.history.replaceState(null, '', u.toString());
  }, [q, view, folder, campaigns, idents, created, from, to, sort]);

  /* ---- folders --------------------------------------------------------- */
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  // Every folder id → the set of ids that count as "inside it" (itself + descendants).
  const subtree = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const f of folders) {
      const ids = new Set<string>([f.id]);
      for (const g of folders) if (g.path.startsWith(f.path + ' / ')) ids.add(g.id);
      m.set(f.id, ids);
    }
    return m;
  }, [folders]);
  const pathOf = (id: string | null) => (id && folderById.get(id)?.path) || '';

  // Rows in the current view (mine/all), before any folder or filter.
  const inView = useMemo(() => rows.filter((r) => (view === 'all' ? true : r.kind === view && !r.deleted)), [rows, view]);
  const kindCount = (k: View) => rows.filter((r) => (k === 'all' ? true : r.kind === k && !r.deleted)).length;

  const folderCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, ids] of subtree) m.set(id, inView.filter((r) => r.folderId && ids.has(r.folderId)).length);
    return m;
  }, [inView, subtree]);
  const unfiledCount = useMemo(() => inView.filter((r) => !r.folderId).length, [inView]);

  const base = useMemo(() => {
    if (folder === 'all') return inView;
    if (folder === 'unfiled') return inView.filter((r) => !r.folderId);
    const ids = subtree.get(folder);
    return ids ? inView.filter((r) => r.folderId && ids.has(r.folderId)) : inView;
  }, [inView, folder, subtree]);

  // Sections directly under the selected node, with roll-ups - the overview.
  const children = useMemo(() => {
    const parentId = folder === 'all' ? null : folder === 'unfiled' ? undefined : folder;
    if (parentId === undefined) return [];
    return folders.filter((f) => f.parentId === parentId).map((f) => {
      const ids = subtree.get(f.id)!;
      return { folder: f, totals: inView.filter((r) => r.folderId && ids.has(r.folderId)).reduce(add, zero()) };
    });
  }, [folders, folder, inView, subtree]);
  const direct = useMemo(() => (folder !== 'all' && folder !== 'unfiled') ? inView.filter((r) => r.folderId === folder).reduce(add, zero()) : null, [inView, folder]);

  /* ---- filters --------------------------------------------------------- */
  const campaignOptions = useMemo(() => base.map((r) => ({ value: r.displayId, label: r.name || '(unnamed)', hint: r.identifier || r.displayId })), [base]);
  const identOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of base) if (r.identifier) counts.set(r.identifier, (counts.get(r.identifier) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v, c]) => ({ value: v, label: v, hint: `${c} campaign${c === 1 ? '' : 's'}` }));
  }, [base]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cset = new Set(campaigns), iset = new Set(idents);
    const lo = created === 'custom' ? from : created === 'any' ? '' : dayKeyAgo(Number(created));
    const hi = created === 'custom' ? to : '';
    const out = base.filter((r) =>
      (!needle || r.name.toLowerCase().includes(needle) || r.displayId.toLowerCase().includes(needle) || r.identifier.toLowerCase().includes(needle) || pathOf(r.folderId).toLowerCase().includes(needle)) &&
      (cset.size === 0 || cset.has(r.displayId)) &&
      (iset.size === 0 || iset.has(r.identifier)) &&
      (!lo || r.createdDay >= lo) && (!hi || r.createdDay <= hi));
    const dir = sort.dir === 'asc' ? 1 : -1;
    out.sort((a, b) => {
      if (sort.key === 'name') return dir * a.name.localeCompare(b.name);
      if (sort.key === 'created') return dir * a.created.localeCompare(b.created);
      if (sort.key === 'folder') return dir * pathOf(a.folderId).localeCompare(pathOf(b.folderId));
      if (sort.key === 'people') return dir * (((a.signups || 0) + (a.users || 0)) - ((b.signups || 0) + (b.users || 0)));
      const av = a[sort.key] ?? -1, bv = b[sort.key] ?? -1;
      return dir * (av - bv);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, q, campaigns, idents, created, from, to, sort, folderById]);

  const totals = visible.reduce(add, zero());
  const filtered = Boolean(q || campaigns.length || idents.length || created !== 'any');
  const byId = useMemo(() => new Map(rows.map((r) => [r.displayId, r])), [rows]);

  function clickSort(key: SortKey) {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: NUMERIC.includes(key) ? 'desc' : 'asc' });
  }
  // A plain function, not a nested component: a component defined inside
  // render would remount its buttons on every keystroke in the search box.
  const th = (k: SortKey, label: string, num = false, title?: string) => (
    <th className={num ? 'num' : ''} title={title}>
      <button type="button" onClick={() => clickSort(k)} className="inline-flex items-center gap-1" style={{ font: 'inherit', color: sort.key === k ? 'var(--ink)' : 'inherit', fontWeight: sort.key === k ? 600 : 500 }}>
        {label}<span aria-hidden="true" style={{ opacity: sort.key === k ? 1 : 0, fontSize: 10 }}>{sort.key === k && sort.dir === 'asc' ? '▲' : '▼'}</span>
      </button>
    </th>
  );

  /* ---- selection & moving ---------------------------------------------- */
  const allVisibleChecked = visible.length > 0 && visible.every((r) => checked.has(r.displayId));
  function toggleAll() {
    setChecked(allVisibleChecked ? new Set() : new Set(visible.map((r) => r.displayId)));
  }
  function toggleOne(id: string) {
    setChecked((s) => { const c = new Set(s); if (c.has(id)) c.delete(id); else c.add(id); return c; });
  }
  function doMove() {
    const ids = [...checked];
    const target = moveTo === 'unfiled' ? null : moveTo;
    if (!ids.length || !moveTo) return;
    start(async () => {
      const r = await moveCampaignsAction(ids, target);
      if (!r.ok) return setNotice({ ok: false, text: r.error });
      setNotice({ ok: true, text: `Moved ${r.data.moved} campaign${r.data.moved === 1 ? '' : 's'} to ${target ? pathOf(target) : 'Unfiled'}.` });
      setChecked(new Set()); setMoveTo('');
    });
  }

  const currentFolder = folder !== 'all' && folder !== 'unfiled' ? folderById.get(folder) : undefined;
  const crumbs = currentFolder ? currentFolder.path.split(' / ') : [];
  const newLinkHref = currentFolder ? `/new?folder=${encodeURIComponent(currentFolder.id)}` : '/new';

  const overviewCols = 5 + (mb ? 1 : 0);
  const overviewRow = (key: string, label: React.ReactNode, t: Totals, quiet = false) => (
    <tr key={key} style={quiet ? { color: 'var(--ink-2)' } : undefined}>
      <td>{label}</td>
      <td className="num">{t.count}</td><td className="num">{n(t.clicks)}</td><td className="num">{n(t.installs)}</td><td className="num">{n(t.signups)}</td>
      {mb && <td className="num font-semibold">{n(t.signups + t.users)}</td>}
    </tr>
  );

  return (
    <div className="flex flex-col md:flex-row gap-8">
      <FolderSidebar folders={folders} counts={folderCounts} totalCount={inView.length} unfiledCount={unfiledCount} selected={folder}
        onSelect={(k) => { setFolder(k); setChecked(new Set()); setCampaigns([]); }} />

      <div className="flex-1 min-w-0">
        {/* Where am I + which population */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[15px] font-semibold flex items-center gap-1.5 flex-wrap min-w-0">
            <button type="button" className={crumbs.length || folder === 'unfiled' ? 'muted hover:underline font-medium' : ''} onClick={() => setFolder('all')}>All campaigns</button>
            {folder === 'unfiled' && <><span className="faint">/</span><span>Unfiled</span></>}
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              const target = folders.find((f) => f.path === crumbs.slice(0, i + 1).join(' / '));
              return <span key={i} className="flex items-center gap-1.5"><span className="faint">/</span>{target && !last ? <button type="button" className="muted hover:underline font-medium" onClick={() => setFolder(target.id)}>{c}</button> : c}</span>;
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="seg" title="Linkrunner holds three kinds of campaign; this picks which to show">
              {([['marketing', 'Mine'], ['referral', 'Referral links'], ['app', 'App referrals'], ['all', 'Everything']] as const).map(([k, label]) => (
                <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => { setView(k); setChecked(new Set()); }}>{label}<span className="cnt">{kindCount(k).toLocaleString('en-IN')}</span></button>
              ))}
            </div>
            <Link href={newLinkHref} className="btn btn-primary btn-sm"><Icon name="plus" size={14} />{currentFolder ? `New link in ${currentFolder.name}` : 'New link'}</Link>
          </div>
        </div>

        {/* Hero numbers for what is shown */}
        <div className="hero">
          <div><div className="k">Clicks</div><div className="v">{n(totals.clicks)}</div><div className="s">{visible.length.toLocaleString('en-IN')} campaign{visible.length === 1 ? '' : 's'}{filtered ? ' · filtered' : ''}</div></div>
          <div><div className="k">Installs</div><div className="v">{n(totals.installs)}</div><div className="s">{totals.clicks ? `${pct(totals.installs, totals.clicks)} of clicks` : '\u00a0'}</div></div>
          <div><div className="k">Sign-ups</div><div className="v">{n(totals.signups)}</div><div className="s">{totals.installs ? `${pct(totals.signups, totals.installs)} of installs` : '\u00a0'}</div></div>
          {mb && <div><div className="k">People</div><div className="v">{n(totals.signups + totals.users)}</div><div className="s">{n(totals.signups)} app · {n(totals.users)} web</div></div>}
        </div>

        {/* Sections under this node */}
        {children.length > 0 && (
          <div className="mt-5">
            <div className="section-title mb-2">{folder === 'all' ? 'Folders' : 'Sections'}</div>
            <div className="panel overflow-x-auto">
              <table className="table table-tight">
                <thead><tr><th>{folder === 'all' ? 'Folder' : 'Section'}</th><th className="num">Campaigns</th><th className="num">Clicks</th><th className="num">Installs</th><th className="num">Sign-ups</th>{mb && <th className="num" title="App sign-ups + web users">People</th>}</tr></thead>
                <tbody>
                  {children.map(({ folder: f, totals: t }) => overviewRow(f.id, <button type="button" className="font-medium hover:underline" onClick={() => setFolder(f.id)}>{f.name}</button>, t))}
                  {direct && direct.count > 0 && overviewRow('direct', `Directly in ${currentFolder?.name}`, direct, true)}
                  {folder === 'all' && unfiledCount > 0 && overviewRow('unfiled', <button type="button" className="hover:underline" onClick={() => setFolder('unfiled')}>Unfiled</button>, inView.filter((r) => !r.folderId).reduce(add, zero()), true)}
                  {children.length === 0 && <tr><td colSpan={overviewCols} className="faint">No sections</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          <div className="search" style={{ width: 240 }}>
            <Icon name="search" size={15} />
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" aria-label="Search" />
          </div>
          <MultiPicker label="Campaigns" options={campaignOptions} selected={campaigns} onChange={setCampaigns} placeholder="Type a campaign name…" />
          <MultiPicker label="Identifier" options={identOptions} selected={idents} onChange={setIdents} placeholder="Type an identifier…" />
          <select className={`select ${created !== 'any' ? 'btn-active' : ''}`} style={{ width: 'auto', border: 0, background: created !== 'any' ? 'var(--tint)' : 'transparent', fontWeight: 500 }} value={created} onChange={(e) => setCreated(e.target.value as Created)} aria-label="Created">
            <option value="any">Created any time</option>
            <option value="7">Created in last 7 days</option>
            <option value="30">Created in last 30 days</option>
            <option value="90">Created in last 90 days</option>
            <option value="custom">Created between…</option>
          </select>
          {created === 'custom' && (
            <span className="inline-flex items-center gap-1 text-sm">
              <input type="date" className="input" style={{ width: 'auto' }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
              <span className="faint">–</span>
              <input type="date" className="input" style={{ width: 'auto' }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
            </span>
          )}
          {filtered && <button type="button" className="btn muted" onClick={() => { setQ(''); setCampaigns([]); setIdents([]); setCreated('any'); setFrom(''); setTo(''); }}><Icon name="x" size={14} />Clear</button>}
          <span className="ml-auto faint text-xs tabular">{visible.length.toLocaleString('en-IN')} of {base.length.toLocaleString('en-IN')}</span>
        </div>

        {(campaigns.length > 0 || idents.length > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {campaigns.map((id) => (
              <span key={id} className="chip">{byId.get(id)?.name || id}
                <button type="button" aria-label={`Remove ${byId.get(id)?.name || id}`} onClick={() => setCampaigns(campaigns.filter((x) => x !== id))}><Icon name="x" size={12} /></button></span>
            ))}
            {idents.map((v) => (
              <span key={v} className="chip mono">{v}
                <button type="button" aria-label={`Remove ${v}`} onClick={() => setIdents(idents.filter((x) => x !== v))}><Icon name="x" size={12} /></button></span>
            ))}
          </div>
        )}

        {/* Bulk move bar */}
        {(checked.size > 0 || notice) && (
          <div className="mt-3 alert alert-info flex flex-wrap items-center gap-2">
            {checked.size > 0 ? (
              <>
                <span className="font-medium">{checked.size} selected</span>
                <span className="opacity-70">· move to</span>
                <select className="select" style={{ width: 'auto', height: 28 }} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} aria-label="Move to folder">
                  <option value="">Choose a folder…</option>
                  <option value="unfiled">Unfiled</option>
                  {folders.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}
                </select>
                <button type="button" className="btn btn-primary btn-sm" onClick={doMove} disabled={!moveTo || pending}>{pending ? 'Moving…' : 'Move'}</button>
                <button type="button" className="btn btn-sm" onClick={() => setChecked(new Set())}>Clear selection</button>
              </>
            ) : null}
            {notice && <span className={`badge ${notice.ok ? 'badge-ok' : 'badge-bad'} ml-auto`}>{notice.text} <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><Icon name="x" size={12} /></button></span>}
          </div>
        )}

        <div className="panel overflow-x-auto mt-3">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 32 }}><input type="checkbox" checked={allVisibleChecked} onChange={toggleAll} aria-label="Select all shown" /></th>
                {th('name', 'Campaign')}
                {th('folder', 'Folder')}
                {th('created', 'Created')}
                {th('clicks', 'Clicks', true)}
                {th('installs', 'Installs', true)}
                {th('signups', 'Sign-ups', true)}
                {mb && th('people', 'People', true, 'Everyone acquired: app sign-ups (Linkrunner) + web users')}
                <th style={{ width: 72 }}></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan={7 + (mb ? 1 : 0)} className="muted text-center py-12">
                  {rows.length === 0 ? 'No campaigns yet. Create one, or press "Import" to bring in your existing ones.' : folder !== 'all' && !filtered ? 'Nothing filed here yet. Tick campaigns elsewhere and use "Move to", or create a new link in this folder.' : 'Nothing matches these filters.'}
                </td></tr>
              )}
              {visible.map((r) => (
                <tr key={r.displayId} style={checked.has(r.displayId) ? { background: 'var(--tint)' } : undefined}>
                  <td><input type="checkbox" checked={checked.has(r.displayId)} onChange={() => toggleOne(r.displayId)} aria-label={`Select ${r.name}`} /></td>
                  <td>
                    <Link href={`/campaigns/${encodeURIComponent(r.displayId)}`} className="font-medium hover:underline">{r.name || '(unnamed)'}</Link>
                    <div className="faint text-[11.5px] mono mt-0.5 flex items-center gap-1.5">{r.displayId}{!r.active && <span className="badge badge-muted">inactive</span>}{r.deleted && <span className="badge badge-bad">deleted in Linkrunner</span>}</div>
                  </td>
                  <td className="text-[12.5px]">
                    {r.folderId && folderById.get(r.folderId)
                      ? <button type="button" className="muted hover:underline text-left" title="Open this folder" onClick={() => setFolder(r.folderId!)}>{pathOf(r.folderId)}</button>
                      : <span className="faint">—</span>}
                  </td>
                  <td className="whitespace-nowrap text-[12.5px] muted">{fmtDate(r.created)}</td>
                  <td className="num">{n(r.clicks)}</td>
                  <td className="num">{n(r.installs)}{r.liveInstalls > 0 && <span className="badge badge-ok ml-1" title="Installs reported live by Linkrunner since the last refresh">+{r.liveInstalls}</span>}</td>
                  <td className="num">{n(r.signups)}{r.liveSignups > 0 && <span className="badge badge-ok ml-1" title="Sign-ups reported live by Linkrunner since the last refresh">+{r.liveSignups}</span>}</td>
                  {mb && <td className="num font-semibold" title={`${n(r.signups)} app · ${n(r.users ?? 0)} web`}>{n((r.signups || 0) + (r.users || 0))}</td>}
                  <td>
                    <div className="flex items-center justify-end gap-0.5">
                      <CopyButton text={r.link} icon iconName="link" title="Copy link" />
                      {r.redirectUrl && <CopyButton text={r.redirectUrl} icon iconName="external" title={`Copy redirect URL · ${r.identifier || 'no identifier'}`} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
