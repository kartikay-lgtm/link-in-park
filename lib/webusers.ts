/* Web users: people who arrived on desktop, went through the web onboarding
   flow ("Webflow") and now exist in the app without having installed it.

   One normalised shape, two sources with identical columns:
     - a CSV export of the Metabase question (data/webflow-users.csv), for now
     - the Metabase question itself, once METABASE_API_KEY is set
   The Metabase source wins when configured. */

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { desc, sql } from 'drizzle-orm';
import { getDb, schema } from './db';
import { configured, env } from './env';
import { parseCsv } from './integrations/csv';
import * as metabase from './integrations/metabase';
import { parsePgArray, type WebUser } from './webusers-shared';

export * from './webusers-shared';

export type WebUsersSource =
  | { kind: 'metabase'; label: string }
  | { kind: 'store'; label: string; modified: string; uploads: number; lastUpload: string | null }
  | { kind: 'csv'; label: string; file: string; modified: string }
  | { kind: 'none'; label: string };

const TZ = 'Asia/Kolkata';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/* Metabase's CSV export writes "Saturday, September 12, 2026, 11:09 PM";
   its API writes ISO. Both are taken to be IST when no zone is present. */
export function parseWhen(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  const m = /^(?:\w+,\s*)?(\w+)\s+(\d{1,2}),\s*(\d{4})(?:,\s*(\d{1,2}):(\d{2})\s*(AM|PM))?/i.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    if (month >= 0) {
      let h = m[4] ? Number(m[4]) % 12 : 0;
      if (m[6] && m[6].toUpperCase() === 'PM') h += 12;
      const mm = m[5] ? Number(m[5]) : 0;
      const iso = `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`;
      return new Date(iso).toISOString();
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dayKey(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }) : '';
}

/* Later steps in the journey (the QR code shown after web onboarding, the
   web-mobile download flow) write their own utm_campaign over the original.
   Until the table keeps the first touch in its own column, these are
   recognised by name so they are not mistaken for acquisition sources. */
const SECOND_TOUCH = (() => {
  const raw = env.secondTouchPatterns.trim();
  const fallback = /^Megh->|->\s*QR|Web Mobile/i;
  if (!raw) return fallback;
  try { return new RegExp(raw.split('|').map((x) => x.trim()).filter(Boolean).map((x) => `(?:${x})`).join('|'), 'i'); } catch { return fallback; }
})();

/* Column names that may carry the first touch, in order of preference. */
const FIRST_TOUCH_COLUMNS = ['first_utm_campaign', 'utm_campaign_first', 'original_utm_campaign', 'utm_campaign_original', 'initial_utm_campaign', 'acquisition_utm_campaign'];

function truthy(v: unknown): boolean {
  return v === true || String(v).toLowerCase() === 'true' || v === 1 || v === '1';
}

function list(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  const s = String(v ?? '').trim();
  if (!s) return [];
  try { const j = JSON.parse(s); return Array.isArray(j) ? j.map(String) : [s]; } catch { return s.split(',').map((x) => x.trim()).filter(Boolean); }
}

export function normaliseRow(r: Record<string, unknown>): WebUser {
  const g = (k: string) => (r[k] === null || r[k] === undefined ? '' : String(r[k]).trim());
  const createdAt = parseWhen(r.user_created_at);
  const recorded = g('utm_campaign');
  // Two table shapes:
  //  - with utm_campaign_2: utm_campaign is the FIRST touch and never changes;
  //    utm_campaign_2 lists every later step (QR, web-mobile flow, WATI…)
  //  - without it: utm_campaign is whatever wrote last, so a later step can
  //    hide the source; a separate first-touch column may exist instead.
  const hasJourney = 'utm_campaign_2' in r;
  const journey = hasJourney ? parsePgArray(r.utm_campaign_2) : [];
  const utmFirst = hasJourney ? recorded : (FIRST_TOUCH_COLUMNS.map(g).find(Boolean) || '');
  const utmCampaign = hasJourney ? (journey[journey.length - 1] || recorded) : recorded;
  return {
    id: g('id') || g('grapevine_id'),
    name: g('name'),
    linkedinUrl: g('linkedin_url'),
    role: g('role'),
    company: g('company_name'),
    utmCampaign,
    utmFirst,
    journey,
    source: utmFirst || utmCampaign,
    secondTouch: !utmFirst && Boolean(utmCampaign) && SECOND_TOUCH.test(utmCampaign),
    phone: g('phone'),
    email: g('email'),
    createdAt,
    createdDay: dayKey(createdAt),
    candidateCompleted: truthy(r.candidate_onboarding_completed),
    candidateStatus: g('candidate_onboarding_status'),
    bossStatus: g('boss_onboarding_status'),
    bossCompleted: truthy(r.boss_onboarding_completed),
    hasApp: truthy(r.has_tal_hire_app),
    registeredTo: list(r.registered_to_apps),
    lastActiveAt: parseWhen(r.last_active_at),
  };
}

/* ---- loading, with a short cache ------------------------------------------- */

const csvPath = () => path.resolve(process.cwd(), env.webflowCsvPath || 'data/webflow-users.csv');
let cache: { key: string; at: number; users: WebUser[]; source: WebUsersSource } | null = null;
const TTL_MS = 5 * 60_000;
// Legacy: the first version kept uploads in this file. It is read once and
// folded into the database if the tables are still empty.
const legacyStorePath = () => path.resolve(process.cwd(), 'data/webflow-users.store.json');

type UploadLog = { at: string; file: string; rows: number; added: number; updated: number };

async function uploadLog(): Promise<UploadLog[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.webUserUploads).orderBy(desc(schema.webUserUploads.at));
  return rows.map((r) => ({ at: r.at.toISOString(), file: r.file, rows: r.rows, added: r.added, updated: r.updated })).reverse();
}

async function storedCount(): Promise<number> {
  const db = await getDb();
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.webUsersRaw);
  return Number(r?.n || 0);
}

let legacyChecked = false;
async function importLegacyStoreOnce(): Promise<void> {
  if (legacyChecked) return;
  legacyChecked = true;
  try {
    if ((await storedCount()) > 0) return;
    const raw = JSON.parse(await readFile(legacyStorePath(), 'utf8')) as { users: Record<string, Record<string, unknown>>; uploads: UploadLog[] };
    const db = await getDb();
    const entries = Object.entries(raw.users || {});
    for (let i = 0; i < entries.length; i += 200) {
      await db.insert(schema.webUsersRaw).values(entries.slice(i, i + 200).map(([id, data]) => ({ id, data }))).onConflictDoNothing();
    }
    for (const u of raw.uploads || []) await db.insert(schema.webUserUploads).values({ at: new Date(u.at), file: u.file, rows: u.rows, added: u.added, updated: u.updated });
  } catch {
    /* no legacy file - nothing to do */
  }
}

/* Merge one CSV export into the store. Rows are keyed by id; a newer export
   overwrites the fields of a user it already knows (onboarding status, app
   install and last-active move on), and adds users it has not seen. */
export async function ingestCsv(text: string, originalName: string): Promise<{ rows: number; added: number; updated: number; total: number; firstTouchKept: number }> {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error('The file has no rows');
  const cols = Object.keys(rows[0]);
  for (const need of ['id', 'utm_campaign', 'user_created_at']) if (!cols.includes(need)) throw new Error(`This does not look like the Webflow Users export - no "${need}" column`);
  await importLegacyStoreOnce();
  const db = await getDb();
  const existing = new Map((await db.select().from(schema.webUsersRaw)).map((r) => [r.id, r.data]));
  let added = 0, updated = 0, firstTouchKept = 0;
  const writes: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (const r of rows) {
    const id = String(r.id || r.grapevine_id || '').trim();
    if (!id) continue;
    const old = existing.get(id);
    if (old) updated++; else added++;
    const merged: Record<string, unknown> = { ...old, ...r };
    // The first touch is the one thing a later export must never change. If
    // the source system ever overwrote it, keep what we first saw and count
    // it, so the upload message says so.
    const oldFirst = String(old?.utm_campaign ?? '').trim();
    const newFirst = String(r.utm_campaign ?? '').trim();
    if (oldFirst && newFirst && oldFirst !== newFirst) { merged.utm_campaign = oldFirst; merged.utm_campaign_overwritten_to = newFirst; firstTouchKept++; }
    writes.push({ id, data: merged });
    existing.set(id, merged);
  }
  for (let i = 0; i < writes.length; i += 200) {
    await db.insert(schema.webUsersRaw).values(writes.slice(i, i + 200).map((w) => ({ ...w, updatedAt: new Date() })))
      .onConflictDoUpdate({ target: schema.webUsersRaw.id, set: { data: sql`excluded.data`, updatedAt: new Date() } });
  }
  await db.insert(schema.webUserUploads).values({ file: path.basename(originalName).replace(/[^A-Za-z0-9._ -]/g, '_'), rows: rows.length, added, updated, content: text.length < 20_000_000 ? text : null });
  invalidateWebUsers();
  return { rows: rows.length, added, updated, total: existing.size, firstTouchKept };
}

export async function webUsersSource(): Promise<WebUsersSource> {
  if (configured.metabase) return { kind: 'metabase', label: `Metabase question #${env.metabaseCardId}` };
  await importLegacyStoreOnce();
  if ((await storedCount()) > 0) {
    const uploads = await uploadLog();
    const last = uploads[uploads.length - 1];
    return { kind: 'store', label: `${uploads.length} CSV upload${uploads.length === 1 ? '' : 's'} merged`, modified: last ? last.at : '', uploads: uploads.length, lastUpload: last ? last.at : null };
  }
  try {
    const st = await stat(csvPath());
    return { kind: 'csv', label: `CSV export · ${path.basename(csvPath())}`, file: csvPath(), modified: st.mtime.toISOString() };
  } catch {
    return { kind: 'none', label: 'No source yet: upload a CSV export of the Webflow Users question, or connect Metabase' };
  }
}

export async function loadWebUsers(): Promise<{ users: WebUser[]; source: WebUsersSource; error: string | null }> {
  const source = await webUsersSource();
  const key = source.kind === 'csv' ? 'csv:' + source.modified : source.kind === 'store' ? 'store:' + source.modified : source.kind;
  if (cache && cache.key === key && Date.now() - cache.at < TTL_MS) return { users: cache.users, source, error: null };
  try {
    let users: WebUser[] = [];
    if (source.kind === 'metabase') {
      const rs = await metabase.runCard();
      users = rs.rows.map((row) => normaliseRow(Object.fromEntries(rs.columns.map((c, i) => [c, row[i]]))));
    } else if (source.kind === 'store') {
      const db = await getDb();
      users = (await db.select().from(schema.webUsersRaw)).map((r) => normaliseRow(r.data));
    } else if (source.kind === 'csv') {
      users = parseCsv(await readFile(source.file, 'utf8')).map(normaliseRow);
    }
    users.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    cache = { key, at: Date.now(), users, source };
    return { users, source, error: null };
  } catch (e) {
    return { users: [], source, error: e instanceof Error ? e.message : String(e) };
  }
}

export function invalidateWebUsers(): void {
  cache = null;
}
