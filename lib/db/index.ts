/* Database handle.

   Hosted: DATABASE_URL (a Postgres connection string - Supabase's transaction
   pooler works). Local: no DATABASE_URL means an embedded Postgres (PGlite)
   stored in ./.data/pglite, so the app runs with zero setup. Same schema,
   same queries, in both cases.

   Migrations in ./drizzle are applied on first use. They are idempotent, so
   running them on every cold start of a serverless function is safe. */

import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { migrate as migratePg } from 'drizzle-orm/postgres-js/migrator';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { env } from '../env';
import * as schema from './schema';

export type Db =
  | ReturnType<typeof drizzlePglite<typeof schema>>
  | ReturnType<typeof drizzlePg<typeof schema>>;

const MIGRATIONS = path.join(process.cwd(), 'drizzle');

// Survive Next.js dev-server hot reloads without opening a second connection.
const g = globalThis as unknown as { __linkConsoleDb?: Promise<Db> };

async function open(): Promise<Db> {
  if (env.databaseUrl) {
    const postgres = (await import('postgres')).default;
    // prepare:false is required behind Supabase's transaction pooler.
    const client = postgres(env.databaseUrl, { prepare: false, max: 5 });
    const db = drizzlePg(client, { schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS });
    return db;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dir = env.dataDir || path.join(process.cwd(), '.data', 'pglite');
  mkdirSync(dir, { recursive: true }); // PGlite does not create parents itself
  const client = new PGlite(dir);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS });
  return db;
}

export function getDb(): Promise<Db> {
  if (!g.__linkConsoleDb) {
    g.__linkConsoleDb = open().catch((e) => {
      g.__linkConsoleDb = undefined; // let the next call retry
      throw e;
    });
  }
  return g.__linkConsoleDb;
}

export { schema };
