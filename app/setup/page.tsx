import { autoSyncState } from '@/lib/autosync';
import { webUsersSource } from '@/lib/webusers';
import { getSyncState } from '@/lib/campaigns';
import { configured, env } from '@/lib/env';
import { describeCard } from '@/lib/integrations/metabase';
import { totalsByIdentifier } from '@/lib/integrations/ga4';
import { when } from '@/components/ui';

export const dynamic = 'force-dynamic';

async function probeMetabase(): Promise<{ ok: boolean; text: string; columns: string[] }> {
  if (!configured.metabase) return { ok: false, text: 'Not configured', columns: [] };
  try {
    const card = await describeCard();
    const hasCol = card.columns.includes(env.metabaseIdentifierColumn);
    return {
      ok: hasCol,
      text: hasCol
        ? `Connected to question #${env.metabaseCardId} "${card.name}"; column "${env.metabaseIdentifierColumn}" found.`
        : `Connected to "${card.name}" but it has no column "${env.metabaseIdentifierColumn}". Set METABASE_IDENTIFIER_COLUMN to one of the columns below.`,
      columns: card.columns,
    };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e), columns: [] };
  }
}

async function probeGa(): Promise<{ ok: boolean; text: string }> {
  if (!configured.ga4) return { ok: false, text: 'Not configured' };
  try {
    await totalsByIdentifier(['__probe__']);
    return { ok: true, text: `Connected to GA4 property ${env.ga4PropertyId}.` };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message : String(e) };
  }
}

function Row({ name, ok, text }: { name: string; ok: boolean; text: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0" style={{ borderColor: 'var(--line)' }}>
      <span className={`badge ${ok ? 'badge-ok' : 'badge-warn'} mt-0.5`}>{ok ? 'OK' : 'Needs setup'}</span>
      <div><div className="font-medium">{name}</div><div className="text-sm muted break-all">{text}</div></div>
    </div>
  );
}

export default async function SetupPage() {
  const [mb, ga, sync, web] = await Promise.all([probeMetabase(), probeGa(), getSyncState(), webUsersSource()]);
  const auto = autoSyncState();
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold">Setup</h1>
        <p className="muted text-sm mt-1">Every connection lives in <span className="mono">.env.local</span> (locally) or the hosting provider&apos;s environment variables. Restart after changing them.</p>
      </div>

      <div className="panel px-5">
        <Row name="Linkrunner" ok={configured.linkrunner} text={configured.linkrunner ? 'Key present. Campaigns can be created and edited.' : 'Add LINKRUNNER_API_KEY (Linkrunner → Settings → Data APIs).'} />
        <Row name="Metabase" ok={mb.ok} text={mb.text} />
        <Row name="Web users source" ok={web.kind !== 'none'} text={web.kind === 'csv' ? `${web.label} - a CSV export of the Metabase question. Replace the file at data/webflow-users.csv to update; Metabase takes over automatically once connected.` : web.label} />
        <Row name="Google Analytics 4" ok={ga.ok} text={ga.text} />
        <Row name="Database" ok={true} text={configured.hostedDb ? 'Hosted Postgres (DATABASE_URL).' : 'Embedded local database in ./.data - fine on this machine; set DATABASE_URL before hosting.'} />
        <Row name="Password" ok={configured.auth} text={configured.auth ? 'Sign-in required.' : 'No APP_PASSWORD set - anyone who can reach this address can edit campaigns. Set one before going online.'} />
      </div>

      {mb.columns.length > 0 && (
        <div className="panel p-5">
          <div className="font-medium mb-2">Columns in the Metabase question</div>
          <div className="flex flex-wrap gap-1">{mb.columns.map((c) => <span key={c} className={`badge mono ${c === env.metabaseIdentifierColumn ? '' : 'badge-muted'}`}>{c}</span>)}</div>
        </div>
      )}

      <div className="panel p-5 space-y-2 text-sm">
        <div className="font-medium">Redirect defaults</div>
        <div><span className="muted">Landing page:</span> <span className="mono">{env.redirectBaseUrl}</span></div>
        <div><span className="muted">Identifier parameter:</span> <span className="mono">{env.redirectParam}</span></div>
        <div><span className="muted">Fixed extras:</span> <span className="mono">{env.redirectExtraParams || '(none)'}</span></div>
      </div>

      <div className="panel p-5 space-y-2 text-sm">
        <div className="font-medium">Automatic refresh</div>
        {auto ? (
          <p className="muted">Running in the background since {when(auto.startedAt)}: one Reporting page every 65s, campaign re-import every 10 min.
            Last tick {when(auto.lastTick)} → <span className="mono">{auto.lastResult}</span></p>
        ) : (
          <p className="muted">Off in this environment{env.autoSync ? ' (Linkrunner not connected)' : ''}. Numbers refresh when you press &quot;Refresh numbers&quot;, or have a scheduler call
            <span className="mono"> /api/sync/reporting?secret=…</span> every minute with SYNC_SECRET.</p>
        )}
        <div className="muted">Last full refresh: {when(sync?.lastCompletedAt)} · cursor at page {sync?.nextPage ?? 1} of {sync?.pages ?? 1}{sync?.lastError ? ` · last error: ${sync.lastError}` : ''}</div>
      </div>
    </div>
  );
}
