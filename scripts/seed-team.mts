/* Creates the team's accounts: sign in with your first name, password is
   the same name (case-insensitive). The admin's password is set the same
   way. Re-runnable: people who already exist are left alone.

     npx tsx scripts/seed-team.mts                 # local database
     DATABASE_URL='postgresql://…' npx tsx scripts/seed-team.mts   # hosted */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(P);
const users = await import(P + '/lib/users.ts');
const { getDb, schema } = await import(P + '/lib/db/index.ts');
const { eq, sql } = await import('drizzle-orm');
const { hashPassword } = await import(P + '/lib/passwords.ts');

const ADMIN = 'Kartikay';
const TEAM = ['Pari', 'Abhishek', 'Akshat', 'Rishi', 'Yash', 'Sanchit', 'Saumil', 'Aganya', 'Gaurika', 'Prabhav'];

await users.ensureAdmin();
const db = await getDb();

// The admin: created if missing; name and password set to the name.
let [admin] = await db.select().from(schema.users).where(eq(schema.users.role, 'admin')).limit(1);
if (!admin) {
  [admin] = await db.insert(schema.users).values({ email: 'kartikay@grapevine.in', name: ADMIN, passwordHash: hashPassword(ADMIN.toLowerCase()), role: 'admin' }).returning();
  console.log(`admin created: ${ADMIN}`);
} else {
  await db.update(schema.users).set({ name: ADMIN, passwordHash: hashPassword(ADMIN.toLowerCase()), sessionVersion: sql`${schema.users.sessionVersion} + 1` }).where(eq(schema.users.id, admin.id));
  console.log(`admin: ${ADMIN} (${admin.email}) - password set to name`);
}

for (const name of TEAM) {
  const existing = await users.findUserByLogin(name);
  if (existing) { console.log(`exists: ${name}`); continue; }
  const u = await users.createUser({ name, password: name, role: 'member', createdBy: admin?.id || null });
  console.log(`created: ${u.name}`);
}
console.log('done');
process.exit(0);
