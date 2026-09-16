/* Metabase: "how many users did this identifier bring, and who are they?"

   The landing page stores the utm_campaign value against each user, and the
   saved question METABASE_CARD_ID (#577 "Webflow Users") already exposes that
   table. Rather than depend on the underlying table, queries reference the
   saved question itself with Metabase's {{#577}} card tag - so if the team
   changes the question, this keeps working.

   Auth: an API key in the `x-api-key` header (Admin → Authentication → API Keys). */

import { randomUUID } from 'node:crypto';
import { env, configured } from '../env';

type Json = Record<string, unknown>;

export class MetabaseError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`Metabase ${status}: ${body.slice(0, 300)}`);
    this.status = status;
  }
}

async function call(method: string, path: string, body?: Json): Promise<Json> {
  if (!configured.metabase) throw new Error('Metabase is not configured');
  const res = await fetch(env.metabaseUrl + path, {
    method,
    headers: { 'x-api-key': env.metabaseKey, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) throw new MetabaseError(res.status, text);
  try {
    return JSON.parse(text) as Json;
  } catch {
    // A bad key yields a plain-text "Unauthenticated", not JSON.
    throw new MetabaseError(res.status, 'non-JSON response: ' + text);
  }
}

let cachedDatabaseId: number | null = null;

async function cardDatabaseId(): Promise<number> {
  if (cachedDatabaseId) return cachedDatabaseId;
  const card = await call('GET', `/api/card/${env.metabaseCardId}`);
  const id = Number(card.database_id);
  if (!id) throw new Error('Saved question has no database_id');
  cachedDatabaseId = id;
  return id;
}

export type ResultSet = { columns: string[]; rows: unknown[][] };

/* Runs SQL in which {{#N}} stands for the saved question. */
async function runNative(sqlText: string): Promise<ResultSet> {
  const tag = `#${env.metabaseCardId}`;
  const res = await call('POST', '/api/dataset', {
    database: await cardDatabaseId(),
    type: 'native',
    native: {
      query: sqlText,
      'template-tags': {
        [tag]: { id: randomUUID(), name: tag, 'display-name': tag, type: 'card', 'card-id': env.metabaseCardId },
      },
    },
  });
  if (res.error) throw new Error('Metabase query error: ' + String(res.error).slice(0, 300));
  const data = (res.data || {}) as Json;
  const cols = ((data.cols as Json[]) || []).map((c) => String(c.name));
  const rows = (data.rows as unknown[][]) || [];
  return { columns: cols, rows };
}

/* Identifiers only ever contain URL-safe characters; anything else is
   dropped rather than escaped, since this is interpolated into SQL. */
function sqlList(ids: string[]): string {
  const safe = ids.map((v) => v.replace(/[^A-Za-z0-9_\-.:@ ]/g, '')).filter(Boolean);
  return safe.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
}

function ident(): string {
  return '"' + env.metabaseIdentifierColumn.replace(/"/g, '') + '"';
}

/* Columns of the saved question - for checking METABASE_IDENTIFIER_COLUMN. */
export async function describeCard(): Promise<{ name: string; columns: string[] }> {
  const card = await call('GET', `/api/card/${env.metabaseCardId}`);
  const meta = (card.result_metadata as Json[]) || [];
  return { name: String(card.name || ''), columns: meta.map((m) => String(m.name)) };
}

export type IdentifierCount = { identifier: string; users: number; firstSeen: string | null; lastSeen: string | null };

/* One row per identifier: how many users the landing page recorded for it. */
export async function countUsersByIdentifier(ids: string[]): Promise<Map<string, IdentifierCount>> {
  const out = new Map<string, IdentifierCount>();
  if (ids.length === 0) return out;
  const list = sqlList(ids);
  if (!list) return out;
  const q = `SELECT ${ident()} AS identifier, COUNT(*) AS users
             FROM {{#${env.metabaseCardId}}} AS u
             WHERE LOWER(${ident()}) IN (${list.toLowerCase()})
             GROUP BY ${ident()}`;
  const rs = await runNative(q);
  for (const r of rs.rows) {
    const id = String(r[0] ?? '').toLowerCase();
    out.set(id, { identifier: id, users: Number(r[1] ?? 0), firstSeen: null, lastSeen: null });
  }
  return out;
}

/* The actual people: every column the saved question exposes, newest first
   when it has a created_at-ish column. Capped so a runaway identifier cannot
   pull the whole table into a page. */
export async function usersForIdentifier(identifier: string, limit = 200): Promise<ResultSet> {
  const list = sqlList([identifier]);
  if (!list) return { columns: [], rows: [] };
  const q = `SELECT * FROM {{#${env.metabaseCardId}}} AS u
             WHERE LOWER(${ident()}) = ${list.toLowerCase()}
             LIMIT ${Math.max(1, Math.min(limit, 1000))}`;
  return runNative(q);
}

/* The whole saved question, as rows + column names. Used to load the web
   users table once Metabase is connected. */
export async function runCard(limit = 20000): Promise<ResultSet> {
  const q = `SELECT * FROM {{#${env.metabaseCardId}}} AS u LIMIT ${Math.max(1, Math.min(limit, 100000))}`;
  return runNative(q);
}
