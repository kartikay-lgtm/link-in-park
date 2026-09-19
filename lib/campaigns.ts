/* The console's operations. Each one talks to Linkrunner first and records
   the outcome locally only once Linkrunner has confirmed it, so the database
   never claims a redirect that is not really live. */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, schema } from './db';
import type { Campaign, Redirect, ReportingSnapshot } from './db/schema';
import { env } from './env';
import { newIdentifier, normaliseCode } from './ids';
import * as lr from './integrations/linkrunner';
import { buildRedirectUrl, identifierFromUrl } from './redirect';

const { campaigns, redirects, reportingSnapshots, syncState } = schema;

export type RedirectTarget = 'website' | 'android' | 'ios';

/* ---- reads --------------------------------------------------------------- */

export type CampaignRow = Campaign & { currentRedirects: Redirect[]; allIdentifiers: string[] };

export async function listCampaignRows(): Promise<CampaignRow[]> {
  const db = await getDb();
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.createdAt));
  if (rows.length === 0) return [];
  const all = await db.select().from(redirects);
  const byCampaign = new Map<string, Redirect[]>();
  const identsBy = new Map<string, Set<string>>();
  for (const r of all) {
    if (r.isCurrent) (byCampaign.get(r.campaignDisplayId) || byCampaign.set(r.campaignDisplayId, []).get(r.campaignDisplayId)!).push(r);
    if (r.identifier) (identsBy.get(r.campaignDisplayId) || identsBy.set(r.campaignDisplayId, new Set()).get(r.campaignDisplayId)!).add(r.identifier);
  }
  return rows.map((c) => ({ ...c, currentRedirects: byCampaign.get(c.displayId) || [], allIdentifiers: [...(identsBy.get(c.displayId) || [])] }));
}

export type CampaignDetail = {
  campaign: Campaign;
  redirects: Redirect[];          // newest first, current ones flagged
  snapshots: ReportingSnapshot[]; // oldest first, for charting
};

export async function getCampaignDetail(displayId: string): Promise<CampaignDetail | null> {
  const db = await getDb();
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.displayId, displayId));
  if (!campaign) return null;
  const reds = await db
    .select()
    .from(redirects)
    .where(eq(redirects.campaignDisplayId, displayId))
    .orderBy(desc(redirects.createdAt));
  const snaps = await db
    .select()
    .from(reportingSnapshots)
    .where(eq(reportingSnapshots.campaignDisplayId, displayId))
    .orderBy(desc(reportingSnapshots.fetchedAt))
    .limit(90);
  return { campaign, redirects: reds, snapshots: snaps.reverse() };
}

export async function getSyncState() {
  const db = await getDb();
  const [row] = await db.select().from(syncState).where(eq(syncState.key, 'reporting'));
  return row || null;
}

/* ---- create -------------------------------------------------------------- */

export type CreateInput = {
  name: string;
  customDisplayId?: string;
  deeplink?: string;
  website?: string;             // desktop redirect
  androidWebRedirect?: string;
  iosWebRedirect?: string;
  folderId?: string | null;
};

/* The whole Linkrunner dialog in one go: create the campaign (Linkrunner
   takes the Android / iOS URLs at creation), then set the Desktop URL, which
   it only accepts as an update, and read it back. Every redirect that ends up
   live is recorded with its identifier. */
export async function createCampaign(input: CreateInput): Promise<Campaign> {
  const created = await lr.createCampaign({
    name: input.name,
    customDisplayId: input.customDisplayId,
    deeplink: input.deeplink,
    androidWebRedirect: input.androidWebRedirect,
    iosWebRedirect: input.iosWebRedirect,
  });
  const db = await getDb();
  const [row] = await db
    .insert(campaigns)
    .values({
      displayId: created.displayId,
      name: created.name || input.name,
      link: created.link,
      deeplink: created.deeplink || input.deeplink || '',
      website: created.website,
      androidWebRedirect: created.androidWebRedirect,
      iosWebRedirect: created.iosWebRedirect,
      active: created.active,
      origin: 'console',
      lrCreatedAt: created.createdAt ? new Date(created.createdAt) : new Date(),
      folderId: input.folderId || null,
    })
    .onConflictDoUpdate({
      target: campaigns.displayId,
      set: { name: created.name || input.name, link: created.link, updatedAt: new Date() },
    })
    .returning();

  // Android / iOS came back on the create response - record them.
  for (const [field, url] of [['android', created.androidWebRedirect], ['ios', created.iosWebRedirect]] as const) {
    if (url) await db.insert(redirects).values({ campaignDisplayId: row.displayId, identifier: identifierFromUrl(url), url, field, isCurrent: true });
  }
  if (input.website) return applyRedirect(row.displayId, input.website, ['website']);
  return row;
}

/* ---- redirects ----------------------------------------------------------- */

async function unusedIdentifier(): Promise<string> {
  const db = await getDb();
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = newIdentifier();
    const [hit] = await db.select({ id: redirects.id }).from(redirects).where(eq(redirects.identifier, id)).limit(1);
    if (!hit) return id;
  }
  throw new Error('Could not find an unused identifier after 10 tries');
}

export type AttachRedirectInput = {
  displayId: string;
  baseUrl?: string;                 // defaults to REDIRECT_BASE_URL
  targets?: RedirectTarget[];       // defaults to ['website'] (desktop only)
};

export type AttachRedirectResult = {
  identifier: string;
  url: string;
  campaign: Campaign;
};

/* Mints a fresh identifier, writes the redirect to Linkrunner, confirms it
   stuck, then records it. Any previous current redirect on the same field is
   closed, not deleted - its identifier is still out in the world. */
export async function attachGeneratedRedirect(input: AttachRedirectInput): Promise<AttachRedirectResult> {
  const identifier = await unusedIdentifier();
  const url = buildRedirectUrl({
    baseUrl: input.baseUrl || env.redirectBaseUrl,
    param: env.redirectParam,
    identifier,
  });
  const campaign = await applyRedirect(input.displayId, url, input.targets || ['website']);
  return { identifier, url, campaign };
}

/* Sets a redirect URL typed by hand (for editing existing links). The
   identifier is whatever the URL carries, possibly nothing. */
export async function setCustomRedirect(displayId: string, url: string, targets: RedirectTarget[] = ['website']): Promise<Campaign> {
  return applyRedirect(displayId, url.trim(), targets);
}

async function applyRedirect(displayId: string, url: string, targets: RedirectTarget[]): Promise<Campaign> {
  const db = await getDb();
  const [existing] = await db.select().from(campaigns).where(eq(campaigns.displayId, displayId));
  if (!existing) throw new Error('Unknown campaign ' + displayId);
  if (targets.length === 0) throw new Error('Choose at least one redirect target');

  const patch: lr.UpdateCampaignInput = { name: existing.name };
  if (targets.includes('website')) patch.website = url;
  if (targets.includes('android')) patch.androidWebRedirect = url;
  if (targets.includes('ios')) patch.iosWebRedirect = url;
  const echo = await lr.updateCampaign(displayId, patch);

  // Linkrunner has, in the past, answered 200 and quietly dropped the field.
  // Read the Desktop URL back rather than trust the status code. The Android
  // and iOS fields never appear in a GET, so for those the PATCH echo is the
  // only check available.
  const live = await lr.getCampaign(displayId);
  if (!live) throw new Error('Linkrunner no longer lists campaign ' + displayId);
  const echoed = (k: string) => (echo[k] === undefined ? true : String(echo[k] ?? '') === url);
  const kept =
    (!targets.includes('website') || live.website === url) &&
    (!targets.includes('android') || echoed('android_web_redirect')) &&
    (!targets.includes('ios') || echoed('ios_web_redirect'));
  if (!kept) {
    throw new Error(
      'Linkrunner accepted the update but did not save the redirect. ' +
      'Set it in the Linkrunner dashboard for now, then press "Import from Linkrunner" here.',
    );
  }

  const identifier = identifierFromUrl(url);
  const now = new Date();
  for (const field of targets) {
    await db
      .update(redirects)
      .set({ isCurrent: false, replacedAt: now })
      .where(and(eq(redirects.campaignDisplayId, displayId), eq(redirects.field, field), eq(redirects.isCurrent, true)));
    await db.insert(redirects).values({ campaignDisplayId: displayId, identifier, url, field, isCurrent: true });
  }

  const [updated] = await db
    .update(campaigns)
    .set({
      website: live.website,
      androidWebRedirect: targets.includes('android') ? url : existing.androidWebRedirect,
      iosWebRedirect: targets.includes('ios') ? url : existing.iosWebRedirect,
      updatedAt: now,
    })
    .where(eq(campaigns.displayId, displayId))
    .returning();
  return updated;
}

export async function renameCampaign(displayId: string, name: string): Promise<Campaign> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name cannot be empty');
  await lr.updateCampaign(displayId, { name: trimmed });
  const db = await getDb();
  const [row] = await db
    .update(campaigns)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(campaigns.displayId, displayId))
    .returning();
  return row;
}

export async function setNotes(displayId: string, notes: string): Promise<void> {
  const db = await getDb();
  await db.update(campaigns).set({ notes, updatedAt: new Date() }).where(eq(campaigns.displayId, displayId));
}

/* ---- import from Linkrunner ---------------------------------------------- */

export type ImportResult = { total: number; added: number; updated: number; removed: number };

/* Pulls every campaign Linkrunner knows about. Linkrunner is the source of
   truth for name / link / redirect fields; local notes and origin are kept.
   A redirect changed by hand in the Linkrunner dashboard shows up here as a
   closed old row plus a new current one, same as if it were changed here. */
export async function importFromLinkrunner(): Promise<ImportResult> {
  const remote = await lr.listCampaigns();
  const db = await getDb();
  const local = await db.select().from(campaigns);
  const localById = new Map(local.map((c) => [normaliseCode(c.displayId), c]));

  const allCurrent = await db.select().from(redirects).where(eq(redirects.isCurrent, true));
  const currentByKey = new Map(allCurrent.map((r) => [r.campaignDisplayId + '|' + r.field, r]));

  const now = new Date();
  const inserts: Array<typeof campaigns.$inferInsert> = [];
  const redirectInserts: Array<typeof redirects.$inferInsert> = [];
  const closeIds: string[] = [];
  let updated = 0;
  const seen = new Set<string>();

  for (const c of remote) {
    if (!c.displayId) continue;
    const existing = localById.get(normaliseCode(c.displayId));
    const displayId = existing ? existing.displayId : c.displayId;
    seen.add(displayId);

    if (existing) {
      const changed =
        existing.name !== c.name || existing.link !== c.link || existing.website !== c.website ||
        existing.androidWebRedirect !== c.androidWebRedirect || existing.iosWebRedirect !== c.iosWebRedirect ||
        existing.active !== c.active || existing.deeplink !== c.deeplink || (c.lrId !== null && existing.lrId !== c.lrId);
      if (changed || existing.lrDeletedAt) {
        await db
          .update(campaigns)
          .set({
            name: c.name, link: c.link, deeplink: c.deeplink, website: c.website, lrId: c.lrId ?? existing.lrId,
            androidWebRedirect: c.androidWebRedirect, iosWebRedirect: c.iosWebRedirect,
            active: c.active, updatedAt: now, lrDeletedAt: null,
          })
          .where(eq(campaigns.displayId, displayId));
        updated++;
      }
    } else {
      inserts.push({
        displayId, name: c.name, link: c.link, deeplink: c.deeplink, website: c.website, lrId: c.lrId,
        androidWebRedirect: c.androidWebRedirect, iosWebRedirect: c.iosWebRedirect,
        active: c.active, origin: 'import',
        lrCreatedAt: c.createdAt ? new Date(c.createdAt) : null,
      });
    }

    // Keep the redirect history in step with what is actually live.
    const fields: Array<[RedirectTarget, string]> = [
      ['website', c.website], ['android', c.androidWebRedirect], ['ios', c.iosWebRedirect],
    ];
    for (const [field, url] of fields) {
      const cur = currentByKey.get(displayId + '|' + field);
      if (url) {
        if (cur && cur.url === url) continue;
        if (cur) closeIds.push(cur.id);
        redirectInserts.push({ campaignDisplayId: displayId, identifier: identifierFromUrl(url), url, field, isCurrent: true });
      } else if (cur) {
        closeIds.push(cur.id);
      }
    }
  }

  // Batched writes: a first import is 1,000+ rows, and one round trip per row
  // is too slow behind a hosted connection pooler.
  const CHUNK = 200;
  for (let i = 0; i < inserts.length; i += CHUNK) await db.insert(campaigns).values(inserts.slice(i, i + CHUNK));
  for (let i = 0; i < closeIds.length; i += CHUNK) {
    await db.update(redirects).set({ isCurrent: false, replacedAt: now }).where(inArray(redirects.id, closeIds.slice(i, i + CHUNK)));
  }
  for (let i = 0; i < redirectInserts.length; i += CHUNK) await db.insert(redirects).values(redirectInserts.slice(i, i + CHUNK));

  // Anything local that Linkrunner no longer lists was deleted there.
  const gone = local.filter((c) => !seen.has(c.displayId) && !c.lrDeletedAt).map((c) => c.displayId);
  for (let i = 0; i < gone.length; i += CHUNK) {
    await db.update(campaigns).set({ lrDeletedAt: now, updatedAt: now }).where(inArray(campaigns.displayId, gone.slice(i, i + CHUNK)));
  }

  return { total: remote.length, added: inserts.length, updated, removed: gone.length };
}

/* ---- reporting sync ------------------------------------------------------ */

export const REPORTING_MIN_INTERVAL_MS = 61_000;

export type SyncResult =
  | { status: 'fetched'; page: number; pages: number; matched: number; complete: boolean; label?: string }
  | { status: 'waiting'; retryInSeconds: number; reason: 'local-limit' | 'rate-limited' }
  | { status: 'error'; message: string; retryInSeconds: number };

/* Fetches ONE page of the Reporting API and folds it in. Call it as often as
   you like - it refuses to hit Linkrunner more than once a minute, which is
   the limit on that endpoint. Pages advance across calls; when the last page
   lands the cursor resets, so repeated calls walk the whole account forever. */
/* ---- the refresh plan ---------------------------------------------------------
   Linkrunner allows one numbers request a minute, 100 campaigns each. Rather
   than walk all pages in order (13+ minutes for everything), each cycle
   spends most slots on the campaigns that actually move - the most-clicked
   and the newest - and the rest on a slow walk of everything else:

     clicks p1 · clicks p2 · clicks p3 · clicks p4 · newest p1 · slow · slow

   Measured on this account: every campaign whose numbers changed in the last
   three days was inside "top 400 by clicks or newest 100". So the hot set
   refreshes every ~7 minutes and a full pass still completes every ~45. */
const HOT_CLICK_PAGES = 4;
const HOT_NEW_PAGES = 1;
const SLOW_PER_CYCLE = 2;
type Step = { kind: 'clicks' | 'new' | 'slow'; page: number };
const PLAN: Step[] = [
  ...Array.from({ length: HOT_CLICK_PAGES }, (_, i) => ({ kind: 'clicks' as const, page: i + 1 })),
  ...Array.from({ length: HOT_NEW_PAGES }, (_, i) => ({ kind: 'new' as const, page: i + 1 })),
  ...Array.from({ length: SLOW_PER_CYCLE }, () => ({ kind: 'slow' as const, page: 0 })),
];
const HOT_STEPS = HOT_CLICK_PAGES + HOT_NEW_PAGES;

async function stateRow(key: string) {
  const db = await getDb();
  let [row] = await db.select().from(syncState).where(eq(syncState.key, key));
  if (!row) [row] = await db.insert(syncState).values({ key }).returning();
  return row;
}

/* Applies one page of numbers to the campaigns it names. A snapshot is
   written only when something changed (or the last one is over six hours
   old), so frequent refreshes do not flood the history table. */
async function applyReporting(rows: lr.ReportingRow[], now: Date): Promise<number> {
  const db = await getDb();
  const local = await db.select({ displayId: campaigns.displayId, clicks: campaigns.clicks, installs: campaigns.installs, signups: campaigns.signups, statsAt: campaigns.statsAt }).from(campaigns);
  const byCode = new Map(local.map((c) => [normaliseCode(c.displayId), c]));
  let matched = 0;
  const snaps: Array<typeof reportingSnapshots.$inferInsert> = [];
  for (const row of rows) {
    const cur = byCode.get(normaliseCode(row.displayId));
    if (!cur) continue; // not imported yet; the next import picks it up
    matched++;
    const changed = cur.clicks !== row.clicks || cur.installs !== row.installs || cur.signups !== row.signups;
    const stale = !cur.statsAt || now.getTime() - cur.statsAt.getTime() > 6 * 3600_000;
    await db.update(campaigns).set({ clicks: row.clicks, installs: row.installs, signups: row.signups, statsAt: now, active: row.active }).where(eq(campaigns.displayId, cur.displayId));
    if (changed || stale) snaps.push({ campaignDisplayId: cur.displayId, clicks: row.clicks, installs: row.installs, signups: row.signups, fetchedAt: now });
  }
  if (snaps.length) await db.insert(reportingSnapshots).values(snaps);
  return matched;
}

/* Waits for the one-a-minute window if needed (up to `maxWaitMs`), then
   claims it. Returns null when the window is not free in time. */
async function claimSlot(maxWaitMs: number): Promise<Date | null> {
  const db = await getDb();
  const deadline = Date.now() + maxWaitMs;
  for (;;) {
    const st = await stateRow('reporting');
    const since = st.lastRequestAt ? Date.now() - st.lastRequestAt.getTime() : Infinity;
    if (since >= REPORTING_MIN_INTERVAL_MS) {
      const now = new Date();
      await db.update(syncState).set({ lastRequestAt: now }).where(eq(syncState.key, 'reporting'));
      return now;
    }
    const wait = REPORTING_MIN_INTERVAL_MS - since;
    if (Date.now() + wait > deadline) return null;
    await new Promise((r) => setTimeout(r, Math.min(wait, 5_000) + 250));
  }
}

async function noteRateLimit(e: unknown, key: string): Promise<SyncResult> {
  const db = await getDb();
  const err = e as lr.LinkrunnerError;
  const retry = err.retryAfter ?? 60;
  // The key's one-a-minute budget is shared with anything else using it. A
  // 429 is not a failure, just "not our turn".
  if (err.status === 429) {
    await db.update(syncState).set({ lastError: '' }).where(eq(syncState.key, key));
    return { status: 'waiting', retryInSeconds: retry, reason: 'rate-limited' };
  }
  await db.update(syncState).set({ lastError: err.message || String(e) }).where(eq(syncState.key, key));
  return { status: 'error', message: err.message || String(e), retryInSeconds: retry };
}

/* One request, chosen by the plan. Called every minute by the background
   loop; safe to call more often (it just waits). */
export async function syncReportingPage(): Promise<SyncResult> {
  const db = await getDb();
  const plan = await stateRow('plan');   // nextPage = position in PLAN
  const slow = await stateRow('slow');   // nextPage / pages / lastCompletedAt = the full walk
  const hot = await stateRow('hot');     // lastCompletedAt = hot set last finished

  const gate = await stateRow('reporting');
  const since = gate.lastRequestAt ? Date.now() - gate.lastRequestAt.getTime() : Infinity;
  if (since < REPORTING_MIN_INTERVAL_MS) {
    return { status: 'waiting', retryInSeconds: Math.ceil((REPORTING_MIN_INTERVAL_MS - since) / 1000), reason: 'local-limit' };
  }
  const now = new Date();
  await db.update(syncState).set({ lastRequestAt: now }).where(eq(syncState.key, 'reporting'));

  const pos = ((plan.nextPage - 1) % PLAN.length + PLAN.length) % PLAN.length;
  const step = PLAN[pos];
  const query: lr.ReportingQuery =
    step.kind === 'clicks' ? { page: step.page, sortField: 'clicks', sortOrder: 'descending' }
      : step.kind === 'new' ? { page: step.page, sortField: 'created_at', sortOrder: 'descending' }
      : { page: slow.nextPage, sortField: 'installs', sortOrder: 'descending' };

  let page: lr.ReportingPage;
  try {
    page = await lr.fetchReportingPage(query);
  } catch (e) {
    return noteRateLimit(e, 'reporting');
  }
  const matched = await applyReporting(page.rows, now);

  let complete = false;
  if (step.kind === 'slow') {
    complete = page.page >= page.pages;
    await db.update(syncState).set({ pages: page.pages, nextPage: complete ? 1 : page.page + 1, lastCompletedAt: complete ? now : slow.lastCompletedAt, lastError: '' }).where(eq(syncState.key, 'slow'));
  } else if (pos === HOT_STEPS - 1) {
    await db.update(syncState).set({ lastCompletedAt: now, lastError: '' }).where(eq(syncState.key, 'hot'));
  }
  await db.update(syncState).set({ nextPage: pos + 2, pages: PLAN.length, lastError: '' }).where(eq(syncState.key, 'plan'));
  // Keep the legacy row's completion time for anything still reading it.
  if (complete) await db.update(syncState).set({ lastCompletedAt: now }).where(eq(syncState.key, 'reporting'));

  const label = step.kind === 'slow' ? `all campaigns p${page.page}/${page.pages}` : step.kind === 'clicks' ? `most-clicked p${step.page}` : 'newest';
  return { status: 'fetched', page: step.kind === 'slow' ? page.page : pos + 1, pages: step.kind === 'slow' ? page.pages : HOT_STEPS, matched, complete, label } as SyncResult;
}

/* Start the hot cycle from the top on the next slots. */
export async function prioritiseHot(): Promise<void> {
  const db = await getDb();
  await stateRow('plan');
  await db.update(syncState).set({ nextPage: 1 }).where(eq(syncState.key, 'plan'));
}

/* Where the refresh stands, for the header. */
export async function refreshStatus(): Promise<{ hotAt: Date | null; allAt: Date | null; position: number; hotSteps: number; lastRequestAt: Date | null; lastError: string }> {
  const [plan, slow, hot, gate] = await Promise.all([stateRow('plan'), stateRow('slow'), stateRow('hot'), stateRow('reporting')]);
  const pos = ((plan.nextPage - 1) % PLAN.length + PLAN.length) % PLAN.length;
  return { hotAt: hot.lastCompletedAt, allAt: slow.lastCompletedAt || gate.lastCompletedAt, position: pos, hotSteps: HOT_STEPS, lastRequestAt: gate.lastRequestAt, lastError: gate.lastError || slow.lastError };
}

/* Fresh numbers for one campaign, now: a single request aimed with
   `search`, taking the next free minute slot (waits up to a minute). */
export async function refreshOneCampaign(displayId: string): Promise<{ ok: true; waitedMs: number } | { ok: false; error: string }> {
  const t0 = Date.now();
  const now = await claimSlot(75_000);
  if (!now) return { ok: false, error: 'Linkrunner is busy - try again in a minute' };
  try {
    const page = await lr.fetchReportingPage({ search: displayId, page: 1, limit: 100 });
    const row = page.rows.find((r) => normaliseCode(r.displayId) === normaliseCode(displayId));
    if (!row) return { ok: false, error: 'Linkrunner did not return this campaign' };
    await applyReporting([row], now);
    return { ok: true, waitedMs: Date.now() - t0 };
  } catch (e) {
    const err = e as lr.LinkrunnerError;
    return { ok: false, error: err.status === 429 ? 'Linkrunner is busy - try again in a minute' : err.message || String(e) };
  }
}

/* Identifiers currently live across all campaigns - what GA4 and Metabase
   are asked about. */
export async function allIdentifiers(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ identifier: redirects.identifier })
    .from(redirects)
    .where(sql`${redirects.identifier} <> ''`);
  return rows.map((r) => r.identifier);
}

export async function redirectsForIdentifiers(ids: string[]): Promise<Redirect[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  return db.select().from(redirects).where(inArray(redirects.identifier, ids));
}

/* Totals as they stood `days` ago (the latest snapshot at or before that
   moment, per campaign), for "vs previous N days" comparisons. Campaigns
   without a snapshot that old count as 0 then - they were new. */
export async function totalsAsOf(days: number, displayIds?: string[]): Promise<{ clicks: number; installs: number; signups: number; byCampaign: Map<string, { clicks: number; installs: number; signups: number }>; days: number }> {
  const db = await getDb();
  // Use `days` when the history reaches that far; otherwise the oldest
  // snapshot we have (down to one day), so a new console still compares.
  const [oldest] = await db.select({ at: sql<string | null>`min(${reportingSnapshots.fetchedAt})` }).from(reportingSnapshots);
  const oldestAt = oldest?.at ? new Date(oldest.at) : null;
  const available = oldestAt ? Math.floor((Date.now() - oldestAt.getTime()) / 86400_000) : 0;
  const useDays = Math.max(1, Math.min(days, available));
  const cutoff = new Date(Date.now() - useDays * 86400_000);
  const empty = { clicks: 0, installs: 0, signups: 0, byCampaign: new Map<string, { clicks: number; installs: number; signups: number }>(), days: useDays };
  if (available < 1) return empty;
  // Latest snapshot at or before the cutoff, per campaign. Done with the
  // query builder (not raw SQL) so it runs the same on the embedded database
  // and on Postgres.
  const latest = db
    .select({ id: reportingSnapshots.campaignDisplayId, at: sql<Date>`max(${reportingSnapshots.fetchedAt})`.as('at') })
    .from(reportingSnapshots)
    .where(displayIds ? and(sql`${reportingSnapshots.fetchedAt} <= ${cutoff}`, inArray(reportingSnapshots.campaignDisplayId, displayIds)) : sql`${reportingSnapshots.fetchedAt} <= ${cutoff}`)
    .groupBy(reportingSnapshots.campaignDisplayId)
    .as('latest');
  const rows = await db
    .select({ id: reportingSnapshots.campaignDisplayId, clicks: reportingSnapshots.clicks, installs: reportingSnapshots.installs, signups: reportingSnapshots.signups })
    .from(reportingSnapshots)
    .innerJoin(latest, and(eq(reportingSnapshots.campaignDisplayId, latest.id), eq(reportingSnapshots.fetchedAt, latest.at)));
  const byCampaign = empty.byCampaign;
  let clicks = 0, installs = 0, signups = 0;
  for (const r of rows) {
    if (byCampaign.has(r.id)) continue;
    const v = { clicks: r.clicks || 0, installs: r.installs || 0, signups: r.signups || 0 };
    byCampaign.set(r.id, v);
    clicks += v.clicks; installs += v.installs; signups += v.signups;
  }
  return { clicks, installs, signups, byCampaign, days: useDays };
}
