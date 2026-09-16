/* Copies everything from the local embedded database (.data/pglite) into a
   hosted Postgres - folders, campaigns and their filing, redirect history,
   numbers snapshots, and the uploaded web users. Safe to re-run: rows that
   already exist are left alone.

     TARGET_DATABASE_URL='postgresql://…' npx tsx scripts/copy-db.mts

   Stop `next dev` first (the embedded database allows one process). */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';

const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(P);
const { schema } = await import(P + '/lib/db/index.ts');

const target = process.env.TARGET_DATABASE_URL;
if (!target) { console.error('Set TARGET_DATABASE_URL to the hosted Postgres connection string.'); process.exit(1); }

const src = drizzlePglite(new PGlite(path.join(P, '.data', 'pglite')), { schema });
const client = postgres(target, { prepare: false, max: 3, ssl: target.includes('railway') || target.includes('sslmode=require') ? 'require' : undefined });
const dst = drizzlePg(client, { schema });

console.log('creating tables on the target…');
await migrate(dst, { migrationsFolder: path.join(P, 'drizzle') });

// Parents before children (foreign keys).
const tables = [
  ['folders', schema.folders], ['campaigns', schema.campaigns], ['redirects', schema.redirects],
  ['reporting_snapshots', schema.reportingSnapshots], ['sync_state', schema.syncState],
  ['web_users_raw', schema.webUsersRaw], ['web_user_uploads', schema.webUserUploads],
] as const;

for (const [name, t] of tables) {
  const rows = await src.select().from(t as never) as Record<string, unknown>[];
  let copied = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    if (chunk.length === 0) break;
    const res = await dst.insert(t as never).values(chunk as never).onConflictDoNothing().returning();
    copied += (res as unknown[]).length;
  }
  console.log(`${name}: ${rows.length} local, ${copied} copied`);
}
// The snapshot id counter must continue past the copied ids.
await dst.execute(sql`SELECT setval(pg_get_serial_sequence('reporting_snapshots', 'id'), COALESCE((SELECT MAX(id) FROM reporting_snapshots), 0) + 1, false)`);
await client.end();
console.log('done');
process.exit(0);
