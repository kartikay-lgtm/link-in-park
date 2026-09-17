/* Background refresh for a long-running server.

   Every ~65s: one numbers request, chosen by the plan in lib/campaigns.ts
   (your active campaigns most minutes, everything else in the gaps).
   Linkrunner allows one a minute; syncReportingPage enforces that itself.
   Every 10 min: re-import the campaign list, so links made in the Linkrunner
   dashboard show up here on their own.

   Started once from instrumentation.ts. Not for serverless hosts - there the
   /api/sync/reporting endpoint plus a scheduler does the same job. */

import { invalidateAnalyticsCache } from './analytics';
import { importFromLinkrunner, syncReportingPage } from './campaigns';
import { configured, env } from './env';

const REPORTING_EVERY_MS = 65_000;
const IMPORT_EVERY_MS = 10 * 60_000;

type State = { startedAt: Date; lastTick: Date | null; lastResult: string; consecutive429: number };
const g = globalThis as unknown as { __linkConsoleAutoSync?: State };

export function autoSyncState(): State | null {
  return g.__linkConsoleAutoSync ?? null;
}

export function startAutoSync(): void {
  if (g.__linkConsoleAutoSync) return;
  if (!env.autoSync || !configured.linkrunner) return;
  const state: State = { startedAt: new Date(), lastTick: null, lastResult: 'starting', consecutive429: 0 };
  g.__linkConsoleAutoSync = state;

  const tick = async () => {
    state.lastTick = new Date();
    try {
      const r = await syncReportingPage();
      if (r.status === 'fetched') {
        state.consecutive429 = 0;
        state.lastResult = `${r.label || `page ${r.page}/${r.pages}`} (${r.matched} campaigns)${r.complete ? ' - full pass complete' : ''}`;
        invalidateAnalyticsCache();
      } else if (r.status === 'waiting') {
        if (r.reason === 'rate-limited') state.consecutive429++;
        state.lastResult = r.reason === 'rate-limited' ? `key busy (429 x${state.consecutive429})` : `waiting ${r.retryInSeconds}s`;
      } else {
        state.lastResult = 'error: ' + r.message;
      }
    } catch (e) {
      state.lastResult = 'error: ' + (e instanceof Error ? e.message : String(e));
    }
  };

  const reimport = async () => {
    try {
      const r = await importFromLinkrunner();
      if (r.added || r.updated || r.removed) invalidateAnalyticsCache();
    } catch (e) {
      console.warn('[autosync] import failed:', e instanceof Error ? e.message : e);
    }
  };

  setTimeout(reimport, 5_000);
  setInterval(reimport, IMPORT_EVERY_MS).unref();
  setTimeout(tick, 10_000);
  setInterval(tick, REPORTING_EVERY_MS).unref();
  console.log('[autosync] background refresh on: numbers every 65s (hot set first), import every 10 min');
}
