import Link from 'next/link';
import CsvUpload from '@/components/CsvUpload';
import WebUsersView, { type UtmMatch } from '@/components/WebUsersView';
import { when } from '@/components/ui';
import { listCampaignRows } from '@/lib/campaigns';
import { loadWebUsers, matchKey } from '@/lib/webusers';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Desktop visitors who onboarded through the web flow, by utm_campaign,
   with each value tied back to the Linkrunner campaign it came from when
   that is knowable: by campaign name, or by a redirect identifier that no
   other campaign shares. */
export default async function WebUsersPage() {
  const [{ users, source, error }, rows] = await Promise.all([loadWebUsers(), listCampaignRows()]);

  const byName = new Map<string, Array<{ displayId: string; name: string }>>();
  const byIdent = new Map<string, Array<{ displayId: string; name: string }>>();
  for (const r of rows) {
    if (r.lrDeletedAt) continue;
    const c = { displayId: r.displayId, name: r.name };
    const nk = matchKey(r.name);
    if (nk) (byName.get(nk) || byName.set(nk, []).get(nk)!).push(c);
    // Any identifier the campaign has ever used, not only the live one - web
    // users who arrived before a redirect was replaced still belong to it.
    for (const x of r.allIdentifiers) { const ik = matchKey(x); if (ik) (byIdent.get(ik) || byIdent.set(ik, []).get(ik)!).push(c); }
  }
  const matches: Record<string, UtmMatch> = {};
  for (const k of new Set(users.map((u) => matchKey(u.source)))) {
    if (!k) continue;
    const viaName = byName.get(k) || [];
    const viaIdent = byIdent.get(k) || [];
    const campaigns = viaName.length ? viaName : viaIdent.length === 1 ? viaIdent : [];
    matches[k] = { campaigns, sharedBy: !campaigns.length && viaIdent.length > 1 ? viaIdent.length : 0 };
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold">Web users</h1>
        <div className="flex items-center gap-3">
          <span className="faint text-xs">
            {source.kind === 'store' && source.lastUpload ? `last upload ${when(source.lastUpload)}` : source.kind === 'csv' ? `CSV · ${when(source.modified)}` : source.kind === 'metabase' ? 'live from Metabase' : ''}
          </span>
          <CsvUpload />
        </div>
      </div>
      {error && <div className="alert alert-bad">{error}</div>}
      {source.kind === 'none' ? (
        <div className="alert alert-warn">No data yet. Export the &quot;Webflow Users&quot; question from Metabase as CSV and press Upload CSV, or connect Metabase in <Link href="/setup" className="underline">Setup</Link>.</div>
      ) : (
        <WebUsersView users={users} matches={matches} />
      )}
    </div>
  );
}
