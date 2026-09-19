import PageTitle from '@/components/PageTitle';
import Link from 'next/link';
import { Suspense } from 'react';
import CampaignTable, { type ListRow } from '@/components/CampaignTable';
import SyncButtons from '@/components/SyncButtons';
import { ago } from '@/components/ui';
import { gaTotals, webUsersByCampaign } from '@/lib/analytics';
import { listCampaignRows, refreshStatus, totalsAsOf } from '@/lib/campaigns';
import { configured } from '@/lib/env';
import { campaignKind } from '@/lib/classify';
import { listFolders } from '@/lib/folders';
import { liveCounts } from '@/lib/live';
import { dayKey } from '@/lib/signups';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function CampaignsPage() {
  const [rows, sync, folderRows, live, before] = await Promise.all([listCampaignRows(), refreshStatus(), listFolders(), liveCounts(), totalsAsOf(7)]);
  const folders = folderRows.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, path: f.path, depth: f.depth }));
  const ids = Array.from(new Set(rows.flatMap((r) => r.currentRedirects.map((x) => x.identifier)).filter(Boolean)));
  const [ga, web] = await Promise.all([
    gaTotals(ids),
    webUsersByCampaign(rows.map((r) => ({ displayId: r.displayId, name: r.name, identifiers: r.currentRedirects.map((x) => x.identifier) }))),
  ]);

  const list: ListRow[] = rows.map((r) => {
    const desktop = r.currentRedirects.find((x) => x.field === 'website');
    const identifier = desktop?.identifier || '';
    const created = (r.lrCreatedAt || r.createdAt).toISOString();
    return {
      displayId: r.displayId,
      name: r.name,
      link: r.link,
      identifier,
      redirectUrl: desktop?.url || '',
      created,
      createdDay: dayKey(created),
      clicks: r.clicks, installs: r.installs, signups: r.signups,
      liveInstalls: live.get(r.displayId)?.installs || 0,
      liveSignups: live.get(r.displayId)?.signups || 0,
      before: before.byCampaign.get(r.displayId) || null,
      beforeDays: before.days,
      landings: ga.configured && identifier ? (ga.data.get(identifier.toLowerCase())?.sessions ?? 0) : null,
      users: web.configured ? (web.byCampaign.get(r.displayId)?.length ?? 0) : null,
      active: r.active,
      deleted: Boolean(r.lrDeletedAt),
      kind: campaignKind(r.name, r.origin),
      folderId: r.folderId,
    };
  });

  return (
    <div className="space-y-5">
      <PageTitle eyebrow="Eat. Sleep. Growth. Repeat." title="Campaigns" right={<>
        <span className="faint text-xs mr-1" title="Your active campaigns refresh every few minutes; everything else on a slower walk">
          {sync.hotAt ? `yours ${ago(sync.hotAt)}` : 'yours: not yet'} · {sync.allAt ? `all ${ago(sync.allAt)}` : 'all: not yet'}
          {sync.lastError ? <span className="badge badge-bad ml-2" title={sync.lastError}>refresh failed</span> : null}
        </span>
        <SyncButtons disabled={!configured.linkrunner} />
      </>} />

      {!configured.linkrunner && (
        <div className="alert alert-warn">
          Linkrunner is not connected. Put your key in <span className="mono">.env.local</span> as <span className="mono">LINKRUNNER_API_KEY</span> and restart — see <Link className="underline" href="/setup">Setup</Link>.
        </div>
      )}

      <Suspense fallback={<div className="muted text-sm">Loading…</div>}>
        <CampaignTable rows={list} folders={folders} ga={ga.configured} mb={web.configured} />
      </Suspense>
    </div>
  );
}
