/* Sign-ups for a campaign, and the day-by-day series drawn from them.

   Two sources feed the charts:
   - Linkrunner's user records: every sign-up with its install and sign-up
     time. Complete history, back to the campaign's first user.
   - The console's own reporting snapshots: clicks / installs / sign-ups
     totals captured on every refresh. Starts the day the console first
     synced, because Linkrunner does not expose past daily clicks. */

import type { ReportingSnapshot } from './db/schema';
import { configured } from './env';
import * as lr from './integrations/linkrunner';

const TZ = 'Asia/Kolkata';
const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: Promise<lr.AttributedUser[]> }>();

export function dayKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
}

export type SignupsResult = { users: lr.AttributedUser[]; total: number; error: string | null };

export async function signupsFor(displayId: string): Promise<SignupsResult> {
  if (!configured.linkrunner) return { users: [], total: 0, error: null };
  const hit = cache.get(displayId);
  const fresh = hit && Date.now() - hit.at < TTL_MS ? hit.value : null;
  const promise = fresh ?? lr.fetchAttributedUsers(displayId).then((r) => r.users);
  if (!fresh) cache.set(displayId, { at: Date.now(), value: promise });
  try {
    const users = await promise;
    users.sort((a, b) => String(b.attributedAt || '').localeCompare(String(a.attributedAt || '')));
    return { users, total: users.length, error: null };
  } catch (e) {
    cache.delete(displayId);
    return { users: [], total: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

export function invalidateSignups(displayId?: string): void {
  if (displayId) cache.delete(displayId);
  else cache.clear();
}

export type Point = { date: string; value: number };
export type Series = { name: string; color: string; points: Point[] };

// Categorical slots, validated: blue / orange / aqua.
export const SERIES_COLOR = { clicks: 'var(--series-blue)', installs: 'var(--series-orange)', signups: 'var(--series-aqua)' } as const;

/* Sign-ups per day, from user records. Every day between the first and last
   sign-up is present (zeros filled) so gaps read as zero, not as missing.
   (Linkrunner stamps installed_at with the same time as the sign-up, so an
   installs series from these records would only duplicate this one.) */
export function dailyFromUsers(users: lr.AttributedUser[]): Series[] {
  const signups = new Map<string, number>();
  for (const u of users) {
    if (u.attributedAt) signups.set(dayKey(u.attributedAt), (signups.get(dayKey(u.attributedAt)) || 0) + 1);
  }
  const days = fillDays([...signups.keys()]);
  return [{ name: 'Sign-ups', color: SERIES_COLOR.signups, points: days.map((d) => ({ date: d, value: signups.get(d) || 0 })) }];
}

/* Clicks / installs / sign-ups per day, as the difference between the last
   snapshot of each day and the day before. Needs two days of history, so the
   first day the console ran never appears. Linkrunner revises lifetime
   totals as late attributions land, so a day can come out slightly negative;
   those clamp to zero. */
export function dailyFromSnapshots(snaps: ReportingSnapshot[]): Series[] {
  const byDay = new Map<string, ReportingSnapshot>();
  for (const s of snaps) byDay.set(dayKey(s.fetchedAt), s);
  const days = [...byDay.keys()].sort();
  const delta = (f: (s: ReportingSnapshot) => number | null) =>
    days.slice(1).map((d, i) => ({ date: d, value: Math.max(0, (f(byDay.get(d)!) ?? 0) - (f(byDay.get(days[i])!) ?? 0)) }));
  return [
    { name: 'Clicks', color: SERIES_COLOR.clicks, points: delta((s) => s.clicks) },
    { name: 'Installs', color: SERIES_COLOR.installs, points: delta((s) => s.installs) },
    { name: 'Sign-ups', color: SERIES_COLOR.signups, points: delta((s) => s.signups) },
  ];
}

/* Running totals from snapshots - the last snapshot of each day. */
export function totalsFromSnapshots(snaps: ReportingSnapshot[]): Series[] {
  const byDay = new Map<string, ReportingSnapshot>();
  for (const s of snaps) byDay.set(dayKey(s.fetchedAt), s); // snaps are oldest→newest
  const days = [...byDay.keys()].sort();
  const pick = (f: (s: ReportingSnapshot) => number | null) => days.map((d) => ({ date: d, value: f(byDay.get(d)!) ?? 0 }));
  return [
    { name: 'Clicks', color: SERIES_COLOR.clicks, points: pick((s) => s.clicks) },
    { name: 'Installs', color: SERIES_COLOR.installs, points: pick((s) => s.installs) },
    { name: 'Sign-ups', color: SERIES_COLOR.signups, points: pick((s) => s.signups) },
  ];
}

function fillDays(keys: string[]): string[] {
  if (keys.length === 0) return [];
  const sorted = keys.slice().sort();
  const out: string[] = [];
  const end = new Date(sorted[sorted.length - 1] + 'T00:00:00Z');
  for (const d = new Date(sorted[0] + 'T00:00:00Z'); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
