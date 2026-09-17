/* Linkrunner API client.

   Everything the console does to Linkrunner goes through here. The surface is
   small - three writes and two reads - and each carries a note on the quirks
   already paid for in link-generator/LINKRUNNER-REPORTING-NOTES.md:

     POST   /create-campaign            mint a campaign (= a link)
     PATCH  /campaigns/:display_id      rename / set web redirects (needs name)
     DELETE /campaigns/:display_id
     GET    /campaigns?filter=ALL       list (Data API - fast, no click counts)
     GET    /reporting/campaigns        clicks / installs / sign-ups
                                        ** 1 request per MINUTE per key **

   Auth is the `linkrunner-key` header, not a Bearer token. */

import { env } from '../env';
import { normaliseCode } from '../ids';

const BASE = 'https://api.linkrunner.io/api/v1';

export class LinkrunnerError extends Error {
  status: number;
  body: string;
  retryAfter?: number;
  constructor(status: number, body: string, retryAfter?: number) {
    super(`Linkrunner ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

type Json = Record<string, unknown>;

function requireKey(): string {
  if (!env.linkrunnerKey) throw new Error('LINKRUNNER_API_KEY is not set');
  return env.linkrunnerKey;
}

async function call(method: string, path: string, body?: Json): Promise<Json> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'linkrunner-key': requireKey(),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    const ra = Number(res.headers.get('retry-after') || '');
    throw new LinkrunnerError(res.status, text, Number.isFinite(ra) && ra > 0 ? ra : undefined);
  }
  try {
    return text ? (JSON.parse(text) as Json) : {};
  } catch {
    throw new LinkrunnerError(res.status, 'non-JSON response: ' + text);
  }
}

/* ---- shapes -------------------------------------------------------------- */

/* A campaign as the Data API lists it. Only the fields we read are typed;
   the raw object is kept so nothing is lost when Linkrunner adds fields. */
export type LinkrunnerCampaign = {
  displayId: string;
  name: string;
  link: string;
  deeplink: string;
  website: string;
  androidWebRedirect: string;
  iosWebRedirect: string;
  active: boolean;
  createdAt: string | null;
  lrId: number | null;          // Linkrunner's numeric id (webhooks use it)
  raw: Json;
};

function s(v: unknown): string {
  return v == null ? '' : String(v);
}

function toCampaign(c: Json): LinkrunnerCampaign {
  return {
    displayId: s(c.display_id),
    name: s(c.name),
    link: s(c.link || c.shareable_link),
    deeplink: s(c.deeplink),
    website: s(c.website),
    androidWebRedirect: s(c.android_web_redirect),
    iosWebRedirect: s(c.ios_web_redirect),
    active: c.active === undefined ? true : Boolean(c.active),
    createdAt: c.created_at ? s(c.created_at) : null,
    lrId: Number.isFinite(Number(c.id)) && c.id !== null && c.id !== undefined ? Number(c.id) : null,
    raw: c,
  };
}

/* ---- writes -------------------------------------------------------------- */

export type CreateCampaignInput = {
  name: string;
  customDisplayId?: string;     // optional; Linkrunner assigns one when blank
  deeplink?: string;            // "deferred deeplinking" in the dashboard
  linkForDesktopUsers?: string; // create-only field; cannot be changed later
  androidWebRedirect?: string;  // accepted at creation (probed 2026-09-15)
  iosWebRedirect?: string;      // accepted at creation
  // NOT here: `website` (the Desktop URL) is ignored on create and must be
  // set with updateCampaign afterwards.
};

/* Returns the new campaign. Linkrunner assigns the display id when we do not
   send custom_display_id, matching a dashboard create with Display ID blank. */
export async function createCampaign(input: CreateCampaignInput): Promise<LinkrunnerCampaign> {
  const payload: Json = { name: input.name.trim(), is_shortlink: true };
  if (input.customDisplayId?.trim()) payload.custom_display_id = input.customDisplayId.trim();
  if (input.deeplink) payload.deeplink = input.deeplink;
  if (input.linkForDesktopUsers) payload.link_for_desktop_users = input.linkForDesktopUsers;
  if (input.androidWebRedirect) payload.android_web_redirect = input.androidWebRedirect;
  if (input.iosWebRedirect) payload.ios_web_redirect = input.iosWebRedirect;

  const out = await call('POST', '/create-campaign', payload);
  const data = (out.data || {}) as Json;
  const link = s(data.link);
  if (!link) throw new Error('Linkrunner gave no link back: ' + JSON.stringify(out).slice(0, 300));

  let displayId = s(data.display_id);
  if (!displayId) {
    // Links are https://link.tal.club/?c=<display id>, so the id can be read
    // straight off the link. Listing 1,000+ campaigns is the last resort.
    try { displayId = new URL(link).searchParams.get('c') || ''; } catch { /* not a URL */ }
  }
  if (!displayId) {
    const all = await listCampaigns();
    const match = all.find((c) => c.link === link);
    if (!match) throw new Error('Created a campaign but could not find its display id');
    return match;
  }
  return toCampaign({ ...data, display_id: displayId, name: payload.name, link });
}

export type UpdateCampaignInput = {
  name: string; // required by the API on every PATCH
  website?: string | null;
  androidWebRedirect?: string | null;
  iosWebRedirect?: string | null;
  active?: boolean;
};

/* PATCH persists website / android_web_redirect / ios_web_redirect as of
   2026-09-10. Between 2026-08-11 and 08-26 the same call returned 200 and
   silently dropped them, so callers must re-read the campaign afterwards and
   compare - see verifyRedirectApplied(). */
export async function updateCampaign(displayId: string, input: UpdateCampaignInput): Promise<Json> {
  const payload: Json = { name: input.name.trim() };
  if (input.website !== undefined) payload.website = input.website ?? '';
  if (input.androidWebRedirect !== undefined) payload.android_web_redirect = input.androidWebRedirect ?? '';
  if (input.iosWebRedirect !== undefined) payload.ios_web_redirect = input.iosWebRedirect ?? '';
  if (input.active !== undefined) payload.active = input.active;
  const out = await call('PATCH', '/campaigns/' + encodeURIComponent(displayId), payload);
  return (out.data || {}) as Json;
}

export async function deleteCampaign(displayId: string): Promise<void> {
  await call('DELETE', '/campaigns/' + encodeURIComponent(displayId));
}

/* ---- reads --------------------------------------------------------------- */

export async function listCampaigns(): Promise<LinkrunnerCampaign[]> {
  const out: LinkrunnerCampaign[] = [];
  let page = 1;
  // Bounded: a pagination bug on their side must not become an endless loop.
  for (let guard = 0; guard < 50; guard++) {
    const res = await call('GET', `/campaigns?filter=ALL&limit=1000&page=${page}`);
    const data = (res.data || {}) as Json;
    const list = (data.campaigns as Json[]) || [];
    for (const c of list) out.push(toCampaign(c));
    const pg = data.pagination as Json | undefined;
    const pages = Number(pg?.pages || 1);
    if (page >= pages) break;
    page++;
  }
  return out;
}

/* There is no GET /campaigns/:id (it 403s) - filtering the list is the way. */
export async function getCampaign(displayId: string): Promise<LinkrunnerCampaign | null> {
  const res = await call('GET', `/campaigns?filter=ALL&display_id=${encodeURIComponent(displayId)}`);
  const data = (res.data || {}) as Json;
  const list = (data.campaigns as Json[]) || [];
  const want = normaliseCode(displayId);
  const hit = list.map(toCampaign).find((c) => normaliseCode(c.displayId) === want) || null;
  return hit;
}

/* After a PATCH, confirm Linkrunner actually kept the redirect. */
export async function verifyRedirectApplied(displayId: string, expectedWebsite: string): Promise<boolean> {
  const c = await getCampaign(displayId);
  return Boolean(c && c.website === expectedWebsite);
}

/* ---- reporting ------------------------------------------------------------ */

export type ReportingRow = {
  displayId: string;
  clicks: number | null;
  installs: number | null;
  signups: number | null;
  active: boolean;
  createdAt: string | null;
  link: string;
};

export type ReportingPage = {
  rows: ReportingRow[];
  page: number;
  pages: number;
};

/* Every metric arrives as a display string ("3,201", "95.38%"). */
export function reportingNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* ONE page per call. The caller owns the one-request-per-minute cadence;
   a 429 surfaces as LinkrunnerError with retryAfter set. `limit` caps at 100.
   No from/to: those only set the metrics window, and lifetime totals are what
   a campaign is judged on. */
export type ReportingQuery = { page?: number; sortField?: 'clicks' | 'installs' | 'signups' | 'created_at'; sortOrder?: 'ascending' | 'descending'; search?: string; limit?: number };

/* One page of numbers. Sorting and `search` (matches name, display id, link)
   are how a request is aimed at the campaigns that matter, since the
   endpoint allows one request a minute. */
export async function fetchReportingPage(pageOrQuery: number | ReportingQuery): Promise<ReportingPage> {
  const q: ReportingQuery = typeof pageOrQuery === 'number' ? { page: pageOrQuery } : pageOrQuery;
  const page = q.page || 1;
  const params = new URLSearchParams({ limit: String(q.limit || 100), page: String(page), sort_field: q.sortField || 'installs', sort_order: q.sortOrder || 'descending' });
  if (q.search) params.set('search', q.search);
  const res = await call('GET', `/reporting/campaigns?${params.toString()}`);
  const data = (res.data || {}) as Json;
  const list = (data.campaigns as Json[]) || [];
  const rows: ReportingRow[] = list.map((c) => ({
    displayId: s(c.display_id),
    clicks: reportingNumber(c.clicks),
    installs: reportingNumber(c.installs),
    signups: reportingNumber(c['sign-ups']), // hyphenated key - not a typo
    active: c.active === undefined ? true : Boolean(c.active),
    createdAt: c.created_at ? s(c.created_at) : null,
    link: s(c.link),
  }));
  const pg = data.pagination as Json | undefined;
  return { rows, page, pages: Number(pg?.pages || 1) };
}

/* ---- attributed users (sign-ups) ------------------------------------------ */

/* One person who signed up through a campaign. Linkrunner only creates the
   record once the app reports a sign-up, so this list IS the sign-ups list
   (its total matched the Reporting API's sign-ups exactly when probed). */
export type AttributedUser = {
  id: string;
  name: string;
  phone: string;
  email: string;
  attributedAt: string | null; // sign-up
  installedAt: string | null;
  storeClickAt: string | null;
  adChannel: string;
  raw: Json;
};

function toUser(u: Json): AttributedUser {
  const ud = (u.user_data || {}) as Json;
  return {
    id: s(ud.id),
    name: s(ud.name),
    phone: s(ud.phone),
    email: s(ud.email),
    attributedAt: u.attributed_at ? s(u.attributed_at) : null,
    installedAt: u.installed_at ? s(u.installed_at) : null,
    storeClickAt: u.store_click_at ? s(u.store_click_at) : null,
    adChannel: s(u.ad_channel),
    raw: u,
  };
}

/* All sign-ups for one campaign. Page size goes up to 1,000 (probed), so
   nearly every campaign is one request; capped at 5 pages regardless. This
   is a Data API endpoint - not subject to the Reporting one-a-minute limit. */
export async function fetchAttributedUsers(displayId: string, cap = 5000): Promise<{ users: AttributedUser[]; total: number }> {
  const users: AttributedUser[] = [];
  let total = 0;
  for (let page = 1; page <= Math.ceil(cap / 1000); page++) {
    const res = await call('GET', `/attributed-users?limit=1000&page=${page}&display_id=${encodeURIComponent(displayId)}`);
    const data = (res.data || {}) as Json;
    const list = (data.users as Json[]) || [];
    for (const u of list) users.push(toUser(u));
    const pg = data.pagination as Json | undefined;
    total = Number(pg?.total ?? users.length);
    const pages = Number(pg?.pages || 1);
    if (page >= pages || list.length === 0) break;
  }
  return { users, total };
}
