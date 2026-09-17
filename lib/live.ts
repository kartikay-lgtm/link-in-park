/* Live installs and sign-ups pushed by Linkrunner's webhook, counted on top
   of the last synced numbers until the next sync includes them. */

import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { getDb, schema } from './db';
import { matchKey } from './webusers-shared';

const { lrEvents, campaigns } = schema;

export type LiveCounts = Map<string, { installs: number; signups: number }>;

/* Events newer than each campaign's last synced numbers. */
export async function liveCounts(): Promise<LiveCounts> {
  const db = await getDb();
  const rows = await db
    .select({ displayId: lrEvents.campaignDisplayId, kind: lrEvents.kind, n: sql<number>`count(*)::int` })
    .from(lrEvents)
    .innerJoin(campaigns, eq(campaigns.displayId, lrEvents.campaignDisplayId))
    .where(sql`${lrEvents.campaignDisplayId} is not null and (${campaigns.statsAt} is null or ${lrEvents.at} > ${campaigns.statsAt})`)
    .groupBy(lrEvents.campaignDisplayId, lrEvents.kind);
  const m: LiveCounts = new Map();
  for (const r of rows) {
    if (!r.displayId) continue;
    const e = m.get(r.displayId) || { installs: 0, signups: 0 };
    if (r.kind === 'install') e.installs += Number(r.n);
    if (r.kind === 'signup') e.signups += Number(r.n);
    m.set(r.displayId, e);
  }
  return m;
}

export async function recentEvents(displayId: string, limit = 30) {
  const db = await getDb();
  return db.select().from(lrEvents).where(eq(lrEvents.campaignDisplayId, displayId)).orderBy(desc(lrEvents.at)).limit(limit);
}

export async function liveSince(displayId: string, since: Date | null) {
  const db = await getDb();
  return db.select().from(lrEvents).where(since ? and(eq(lrEvents.campaignDisplayId, displayId), gt(lrEvents.at, since)) : eq(lrEvents.campaignDisplayId, displayId)).orderBy(desc(lrEvents.at));
}

/* Works out which campaign a webhook payload is about. Linkrunner sends its
   numeric campaign id and the name; either may be missing on a test ping. */
export async function resolveCampaign(ref: string, name: string): Promise<string | null> {
  const db = await getDb();
  const num = Number(ref);
  if (ref && Number.isFinite(num)) {
    const [c] = await db.select({ displayId: campaigns.displayId }).from(campaigns).where(eq(campaigns.lrId, num));
    if (c) return c.displayId;
  }
  if (ref) {
    const [c] = await db.select({ displayId: campaigns.displayId }).from(campaigns).where(sql`lower(${campaigns.displayId}) = lower(${ref})`);
    if (c) return c.displayId;
  }
  if (name) {
    const all = await db.select({ displayId: campaigns.displayId, name: campaigns.name }).from(campaigns);
    const k = matchKey(name);
    const hits = all.filter((c) => matchKey(c.name) === k);
    if (hits.length === 1) return hits[0].displayId;
  }
  return null;
}
