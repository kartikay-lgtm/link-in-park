import Link from 'next/link';
import CopyButton from '@/components/CopyButton';
import FolderSelect from '@/components/FolderSelect';
import { NotesForm, RenameForm } from '@/components/InlineForms';
import RedirectEditor from '@/components/RedirectEditor';
import RefreshCampaign from '@/components/RefreshCampaign';
import SignupsTable from '@/components/SignupsTable';
import Tabs from '@/components/Tabs';
import TimeSeriesChart from '@/components/TimeSeriesChart';
import WebUsersTable from '@/components/WebUsersTable';
import { ago, n, when } from '@/components/ui';
import { gaTotals, webUsersByCampaign } from '@/lib/analytics';
import { getCampaignDetail, redirectsForIdentifiers } from '@/lib/campaigns';
import { configured, env } from '@/lib/env';
import { listFolders } from '@/lib/folders';
import { liveSince, recentEvents } from '@/lib/live';
import { dailyFromUsers, SERIES_COLOR, signupsFor, type Series } from '@/lib/signups';

/* One campaign. The first view is deliberately small: what it is, its
   numbers, one chart. Everything deeper sits in tabs. Rendered inside the
   pop-up from the list and as the full page at /campaigns/<id>. */
export default async function CampaignDetail({ displayId, inModal = false }: { displayId: string; inModal?: boolean }) {
  const detail = await getCampaignDetail(displayId);
  if (!detail) return <div className="p-8 muted">Campaign not found.</div>;
  const { campaign: c, redirects } = detail;

  const current = redirects.filter((r) => r.isCurrent);
  const desktop = current.find((r) => r.field === 'website');
  const identifiers = Array.from(new Set(redirects.map((r) => r.identifier).filter(Boolean)));
  const mainId = desktop?.identifier || '';

  // Identifiers shared with other campaigns (like "linkedin") cannot credit
  // web users to this one.
  const sharing = await redirectsForIdentifiers(identifiers);
  const others = new Set(sharing.filter((r) => r.campaignDisplayId !== c.displayId).map((r) => r.identifier.toLowerCase()));
  const ownIdentifiers = identifiers.filter((i) => !others.has(i.toLowerCase()));

  const [signups, ga, web, folderRows, live, feed] = await Promise.all([
    signupsFor(c.displayId),
    gaTotals(identifiers),
    webUsersByCampaign([{ displayId: c.displayId, name: c.name, identifiers: ownIdentifiers }]),
    listFolders(),
    liveSince(c.displayId, c.statsAt),
    recentEvents(c.displayId, 25),
  ]);
  const liveInstalls = live.filter((e) => e.kind === 'install').length;
  const liveSignups = live.filter((e) => e.kind === 'signup').length;
  const folders = folderRows.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, path: f.path, depth: f.depth }));
  const webUsers = web.byCampaign.get(c.displayId) || [];
  const gaMain = mainId ? ga.data.get(mainId.toLowerCase()) : undefined;
  const pct = (a: number | null, b: number | null) => (a && b ? `${((100 * a) / b).toFixed(1)}%` : null);

  // One chart: app sign-ups per day, with web users per day alongside when
  // there are any.
  const series: Series[] = dailyFromUsers(signups.users);
  if (webUsers.length) {
    const byDay = new Map<string, number>();
    for (const u of webUsers) if (u.createdDay) byDay.set(u.createdDay, (byDay.get(u.createdDay) || 0) + 1);
    const days = new Set<string>([...series.flatMap((s) => s.points.map((p) => p.date)), ...byDay.keys()]);
    const sorted = [...days].sort();
    series.push({ name: 'Web users', color: SERIES_COLOR.clicks, points: sorted.map((d) => ({ date: d, value: byDay.get(d) || 0 })) });
    if (series[0]) { const m = new Map(series[0].points.map((p) => [p.date, p.value])); series[0].points = sorted.map((d) => ({ date: d, value: m.get(d) || 0 })); }
  }

  const overview = (
    <div className="space-y-5">
      <div className="hero" style={{ paddingTop: 0 }}>
        <div><div className="k">Clicks</div><div className="v">{n(c.clicks)}</div><div className="s">Linkrunner · {ago(c.statsAt)}</div></div>
        <div><div className="k">Installs</div><div className="v">{n(c.installs)}{liveInstalls > 0 && <span className="badge badge-ok ml-2 align-middle" title="Reported live since the last refresh">+{liveInstalls} live</span>}</div><div className="s">{pct(c.installs, c.clicks) ? `${pct(c.installs, c.clicks)} of clicks` : ' '}</div></div>
        <div><div className="k">Sign-ups</div><div className="v">{n(c.signups)}{liveSignups > 0 && <span className="badge badge-ok ml-2 align-middle" title="Reported live since the last refresh">+{liveSignups} live</span>}</div><div className="s">{pct(c.signups, c.installs) ? `${pct(c.signups, c.installs)} of installs` : ' '}</div></div>
        {web.configured && <div><div className="k">Web users</div><div className="v">{n(webUsers.length)}</div><div className="s">{webUsers.filter((u) => u.candidateCompleted || u.bossCompleted).length} completed onboarding</div></div>}
        {web.configured && <div><div className="k">People</div><div className="v">{n((c.signups || 0) + webUsers.length)}</div><div className="s">{n(c.signups)} app · {webUsers.length} web</div></div>}
        {ga.configured && <div><div className="k">Landings</div><div className="v">{mainId ? n(gaMain?.sessions ?? 0) : '—'}</div><div className="s">GA4 sessions</div></div>}
      </div>
      <div className="flex items-center gap-3"><RefreshCampaign displayId={c.displayId} /></div>
      {feed.length > 0 && (
        <div className="panel p-4">
          <div className="section-title mb-2">Live <span className="faint font-normal">· from Linkrunner, as it happens</span></div>
          <div className="space-y-1 text-[13px]">
            {feed.map((e) => (
              <div key={e.id} className="flex items-center gap-2">
                <span className={`badge ${e.kind === 'signup' ? 'badge-ok' : e.kind === 'install' ? 'badge-accent' : 'badge-muted'}`}>{e.kind === 'signup' ? 'Sign-up' : e.kind === 'install' ? 'Install' : e.kind}</span>
                <span className="font-medium">{e.userName || <span className="faint">someone</span>}</span>
                {e.phone && <span className="mono faint text-xs">{e.phone}</span>}
                <span className="faint text-xs ml-auto whitespace-nowrap">{when(e.at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <TimeSeriesChart
        title={webUsers.length ? 'Sign-ups per day · app and web' : 'Sign-ups per day'}
        series={series}
        note={signups.error ? `Could not load sign-ups from Linkrunner: ${signups.error}` : undefined}
      />
    </div>
  );

  const people = (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="section-title">App sign-ups</h2>
        <SignupsTable rows={signups.users.map((u) => ({ id: u.id, name: u.name, phone: u.phone, email: u.email, installedAt: u.installedAt, attributedAt: u.attributedAt, adChannel: u.adChannel }))} />
      </section>
      {web.configured && (
        <section className="space-y-2">
          <h2 className="section-title">Web users</h2>
          {web.error ? <div className="alert alert-bad">{web.error}</div> : <WebUsersTable users={webUsers} compact />}
        </section>
      )}
    </div>
  );

  const redirectsTab = (
    <div className="space-y-4">
      <div className="panel overflow-x-auto">
        <table className="table table-tight">
          <thead>
            <tr><th>Identifier</th><th>URL</th><th>Field</th><th>Status</th>{ga.configured && <th className="num" title="GA4 sessions">Landings</th>}<th>Web attribution</th></tr>
          </thead>
          <tbody>
            {redirects.length === 0 && <tr><td colSpan={6} className="muted text-center py-6">No web redirection on this campaign.</td></tr>}
            {redirects.map((r) => {
              const g = r.identifier ? ga.data.get(r.identifier.toLowerCase()) : undefined;
              const shared = r.identifier ? others.has(r.identifier.toLowerCase()) : false;
              return (
                <tr key={r.id} style={r.isCurrent ? undefined : { color: 'var(--ink-3)' }}>
                  <td><span className={`badge mono ${r.isCurrent ? 'badge-accent' : 'badge-muted'}`}>{r.identifier || 'none'}</span></td>
                  <td><div className="flex items-center gap-1"><span className="mono text-xs truncate inline-block max-w-[320px]" title={r.url}>{r.url}</span><CopyButton text={r.url} icon title="Copy URL" /></div></td>
                  <td className="text-xs">{r.field === 'website' ? 'Desktop' : r.field === 'android' ? 'Android' : 'iOS'}</td>
                  <td className="text-xs">{r.isCurrent ? <span className="badge badge-ok">live</span> : `replaced ${when(r.replacedAt)}`}<div className="faint">since {when(r.createdAt)}</div></td>
                  {ga.configured && <td className="num">{r.identifier ? n(g?.sessions ?? 0) : '–'}</td>}
                  <td className="text-xs">{!r.identifier ? <span className="faint">no identifier</span> : shared ? <span className="badge badge-warn" title="Other campaigns use this identifier too, so web users carrying it cannot be credited to this campaign">shared identifier</span> : <span className="badge badge-ok">unique</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <RedirectEditor displayId={c.displayId} defaultBaseUrl={env.redirectBaseUrl} currentUrl={desktop?.url || ''} disabled={!configured.linkrunner} />
    </div>
  );

  const peopleCount = signups.users.length + webUsers.length;

  return (
    <div className={`space-y-6 ${inModal ? 'px-6 pb-8 pt-2 sm:px-8' : ''}`}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <RenameForm displayId={c.displayId} name={c.name} disabled={!configured.linkrunner} />
          <div className="text-[13px] muted flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="mono">{c.displayId}</span>
            <span>· created {when(c.lrCreatedAt || c.createdAt)}</span>
            {!c.active && <span className="badge badge-muted">inactive</span>}
            {c.lrDeletedAt && <span className="badge badge-bad">deleted in Linkrunner {when(c.lrDeletedAt)}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <span className="flex items-center gap-1"><span className="muted">Link</span><span className="mono">{c.link}</span><CopyButton text={c.link} icon iconName="link" title="Copy link" /></span>
            {desktop && <span className="flex items-center gap-1"><span className="muted">Redirect</span><span className="badge badge-accent mono">{mainId || 'no identifier'}</span><CopyButton text={desktop.url} icon iconName="external" title="Copy redirect URL" /></span>}
            <FolderSelect displayId={c.displayId} folders={folders} current={c.folderId} />
          </div>
        </div>
      </div>

      <Tabs tabs={[
        { id: 'overview', label: 'Overview', content: overview },
        { id: 'people', label: 'People', badge: peopleCount || undefined, content: people },
        { id: 'redirects', label: 'Redirects', badge: redirects.length || undefined, content: redirectsTab },
        { id: 'notes', label: 'Notes', badge: c.notes ? '•' : undefined, content: <NotesForm displayId={c.displayId} notes={c.notes} /> },
      ]} />

      {!inModal && <Link href="/" className="text-sm muted hover:underline">← All campaigns</Link>}
    </div>
  );
}
