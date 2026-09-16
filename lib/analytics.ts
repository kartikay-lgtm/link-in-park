/* Joins the external numbers onto identifiers, with a short cache so opening
   the list page twice in a minute does not cost two GA4 and two Metabase
   round trips. Every source is optional: unconfigured or failing sources come
   back as `null` with the reason, and the UI says so instead of breaking. */

import { configured } from './env';
import * as ga4 from './integrations/ga4';
import { loadWebUsers, matchKey, type WebUser } from './webusers';

export type SourceResult<T> = { data: T; error: string | null; configured: boolean };

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function invalidateAnalyticsCache(): void {
  cache.clear();
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function gaTotals(ids: string[]): Promise<SourceResult<Map<string, ga4.GaTotals>>> {
  if (!configured.ga4) return { data: new Map(), error: null, configured: false };
  try {
    const data = await cached('ga:' + ids.slice().sort().join(','), () => ga4.totalsByIdentifier(ids));
    return { data, error: null, configured: true };
  } catch (e) {
    return { data: new Map(), error: errorText(e), configured: true };
  }
}

/* Web users (desktop onboarding flow) attributed to campaigns. A campaign
   "owns" a web user when the user's utm_campaign equals one of the
   campaign's redirect identifiers - but only identifiers no other campaign
   shares (291 campaigns share "linkedin", so that one attributes to none) -
   or equals the campaign's name, which is how posts that link straight to
   the site are tagged. */
export type WebAttribution = { configured: boolean; error: string | null; sourceLabel: string; byCampaign: Map<string, WebUser[]> };

export async function webUsersByCampaign(campaigns: Array<{ displayId: string; name: string; identifiers: string[] }>): Promise<WebAttribution> {
  const { users, source, error } = await loadWebUsers();
  const byUtm = new Map<string, WebUser[]>();
  for (const u of users) { const k = matchKey(u.source); (byUtm.get(k) || byUtm.set(k, []).get(k)!).push(u); }
  const idFreq = new Map<string, number>();
  for (const c of campaigns) for (const id of new Set(c.identifiers.map(matchKey))) if (id) idFreq.set(id, (idFreq.get(id) || 0) + 1);
  const byCampaign = new Map<string, WebUser[]>();
  for (const c of campaigns) {
    const keys = new Set<string>();
    if (matchKey(c.name)) keys.add(matchKey(c.name));
    for (const id of c.identifiers.map(matchKey)) if (id && idFreq.get(id) === 1) keys.add(id);
    const seen = new Set<string>();
    const list: WebUser[] = [];
    for (const k of keys) for (const u of byUtm.get(k) || []) if (!seen.has(u.id)) { seen.add(u.id); list.push(u); }
    if (list.length) byCampaign.set(c.displayId, list);
  }
  return { configured: source.kind !== 'none', error, sourceLabel: source.label, byCampaign };
}

export async function gaDaily(identifier: string): Promise<SourceResult<ga4.GaDaily[]>> {
  if (!configured.ga4) return { data: [], error: null, configured: false };
  try {
    const data = await cached('gad:' + identifier, () => ga4.dailyForIdentifier(identifier));
    return { data, error: null, configured: true };
  } catch (e) {
    return { data: [], error: errorText(e), configured: true };
  }
}
