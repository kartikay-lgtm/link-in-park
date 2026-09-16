/* Google Analytics 4 Data API: "how many sessions landed with this
   utm_campaign value?"

   GA4 records utm_campaign automatically as the session's campaign name, so
   no tagging work is needed on the site. Access is through a service account
   (a robot Google user) given Viewer on the property; its JSON key is pasted
   into GA4_SERVICE_ACCOUNT_JSON as one line.

   Numbers here lag real time by a few hours - that is GA4, not us. */

import { JWT } from 'google-auth-library';
import { env, configured } from '../env';

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

let client: JWT | null = null;

function auth(): JWT {
  if (!configured.ga4) throw new Error('Google Analytics is not configured');
  if (!client) {
    const creds = JSON.parse(env.ga4ServiceAccountJson) as { client_email: string; private_key: string };
    client = new JWT({ email: creds.client_email, key: creds.private_key, scopes: [SCOPE] });
  }
  return client;
}

type Json = Record<string, unknown>;

async function runReport(body: Json): Promise<Json> {
  const token = await auth().getAccessToken();
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${env.ga4PropertyId}:runReport`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GA4 ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as Json;
}

export type GaTotals = { identifier: string; sessions: number; users: number; pageViews: number; engagedSessions: number };

const LIFETIME_START = '2023-01-01';

/* Session totals per identifier over the whole life of the property. */
export async function totalsByIdentifier(ids: string[]): Promise<Map<string, GaTotals>> {
  const out = new Map<string, GaTotals>();
  if (ids.length === 0) return out;
  const res = await runReport({
    dateRanges: [{ startDate: LIFETIME_START, endDate: 'today' }],
    dimensions: [{ name: 'sessionCampaignName' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'engagedSessions' }],
    dimensionFilter: {
      filter: { fieldName: 'sessionCampaignName', inListFilter: { values: ids, caseSensitive: false } },
    },
    limit: 10000,
  });
  for (const row of (res.rows as Json[]) || []) {
    const dims = row.dimensionValues as Array<{ value: string }>;
    const mets = row.metricValues as Array<{ value: string }>;
    const id = String(dims?.[0]?.value || '').toLowerCase();
    out.set(id, {
      identifier: id,
      sessions: Number(mets?.[0]?.value || 0),
      users: Number(mets?.[1]?.value || 0),
      pageViews: Number(mets?.[2]?.value || 0),
      engagedSessions: Number(mets?.[3]?.value || 0),
    });
  }
  return out;
}

export type GaDaily = { date: string; sessions: number; users: number };

/* Day-by-day sessions for one identifier, for the campaign page chart. */
export async function dailyForIdentifier(identifier: string, days = 30): Promise<GaDaily[]> {
  const res = await runReport({
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'date' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: { fieldName: 'sessionCampaignName', stringFilter: { matchType: 'EXACT', value: identifier, caseSensitive: false } },
    },
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  });
  return (((res.rows as Json[]) || []).map((row) => {
    const d = (row.dimensionValues as Array<{ value: string }>)[0].value; // YYYYMMDD
    const m = row.metricValues as Array<{ value: string }>;
    return { date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, sessions: Number(m[0].value), users: Number(m[1].value) };
  }));
}
