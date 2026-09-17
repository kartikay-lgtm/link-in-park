/* Rebuilds the local embedded database (.data/pglite) from a hosted
   Postgres - the reverse of copy-db. Use it to bring a laptop in line with
   the live console, or after the local database got damaged.

     SOURCE_DATABASE_URL='postgresql://…' npx tsx scripts/pull-db.mts

   Stop `next dev` first. The existing local database is replaced. */

import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';

const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(P);
const { schema } = await import(P + '/lib/db/index.ts');

const source = process.env.SOURCE_DATABASE_URL;
if (!source) { console.error('Set SOURCE_DATABASE_URL to the hosted Postgres connection string.'); process.exit(1); }

const client = postgres(source, { prepare: false, max: 3, ssl: source.includes('railway') || source.includes('sslmode=require') ? 'require' : undefined });
const src = drizzlePg(client, { schema });

const dir = path.join(P, '.data', 'pglite');
await rm(dir, { recursive: true, force: true });
const local = new PGlite(dir);
const dst = drizzlePglite(local, { schema });
await migrate(dst, { migrationsFolder: path.join(P, 'drizzle') });

const tables = [
  ['folders', schema.folders], ['campaigns', schema.campaigns], ['redirects', schema.redirects],
  ['reporting_snapshots', schema.reportingSnapshots], ['sync_state', schema.syncState],
  ['web_users_raw', schema.webUsersRaw], ['web_user_uploads', schema.webUserUploads],
] as const;
for (const [name, t] of tables) {
  const rows = await src.select().from(t as never) as Record<string, unknown>[];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    if (chunk.length) await dst.insert(t as never).values(chunk as never).onConflictDoNothing();
  }
  console.log(`${name}: ${rows.length} pulled`);
}
await dst.execute(sql`SELECT setval(pg_get_serial_sequence('reporting_snapshots', 'id'), COALESCE((SELECT MAX(id) FROM reporting_snapshots), 0) + 1, false)`);
await local.close();
await client.end();
console.log('done');
process.exit(0);
