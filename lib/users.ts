/* Users, sessions and the activity log. */

import { and, desc, eq, sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb, schema } from './db';
import type { User } from './db/schema';
import { env } from './env';
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from './auth';
import { hashPassword, verifyPassword } from './passwords';

const { users, activityLog } = schema;

export type Role = 'admin' | 'member';
export type SafeUser = Omit<User, 'passwordHash'>;

function safe(u: User): SafeUser {
  const { passwordHash: _omit, ...rest } = u; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
}

/* The signing secret for session cookies. */
export function sessionSecret(): string {
  return env.sessionSecret || env.syncSecret || env.appPassword;
}

/* Until someone has created accounts, the shared APP_PASSWORD is the super
   admin's password, under ADMIN_EMAIL. Runs once per process. */
let bootstrapped = false;
export async function ensureAdmin(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  if (Number(n) > 0 || !env.appPassword) return;
  await db.insert(users).values({ email: env.adminEmail.toLowerCase(), name: env.adminName, passwordHash: hashPassword(env.appPassword), role: 'admin' }).onConflictDoNothing();
}

/* Is the console gated at all? Yes once any user exists (or a bootstrap
   password is set). Unset both on a laptop and it stays open. */
export async function gated(): Promise<boolean> {
  await ensureAdmin();
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return Number(n) > 0;
}

export async function listUsers(): Promise<SafeUser[]> {
  const db = await getDb();
  return (await db.select().from(users).orderBy(users.createdAt)).map(safe);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  return u || null;
}

/* Checks a login; returns the user or null. */
export async function authenticate(email: string, password: string): Promise<User | null> {
  await ensureAdmin();
  const u = await findUserByEmail(email);
  if (!u || !u.active || !verifyPassword(password, u.passwordHash)) return null;
  const db = await getDb();
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  return u;
}

export async function sessionCookieFor(u: User): Promise<string> {
  return signSession(sessionSecret(), { userId: u.id, version: u.sessionVersion, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 });
}

/* Who is making this request? null when signed out, disabled, or the
   password changed since the cookie was issued. */
export async function currentUser(): Promise<SafeUser | null> {
  if (!(await gated())) return null;
  const jar = await cookies();
  const claims = await verifySession(sessionSecret(), jar.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const db = await getDb();
  const [u] = await db.select().from(users).where(and(eq(users.id, claims.userId), eq(users.active, true)));
  if (!u || u.sessionVersion !== claims.version) return null;
  return safe(u);
}

/* ---- admin operations ------------------------------------------------------ */

export async function createUser(input: { email: string; name: string; password: string; role: Role; createdBy: string }): Promise<SafeUser> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address');
  if (input.name.trim().length < 2) throw new Error('Enter the person\'s name');
  if (input.password.length < 8) throw new Error('Password must be at least 8 characters');
  const db = await getDb();
  if (await findUserByEmail(email)) throw new Error('A user with that email already exists');
  const [u] = await db.insert(users).values({ email, name: input.name.trim(), passwordHash: hashPassword(input.password), role: input.role, createdBy: input.createdBy }).returning();
  return safe(u);
}

export async function setPassword(userId: string, password: string): Promise<void> {
  if (password.length < 8) throw new Error('Password must be at least 8 characters');
  const db = await getDb();
  // Bumping the session version logs that person out everywhere.
  await db.update(users).set({ passwordHash: hashPassword(password), sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId));
}

export async function setActive(userId: string, active: boolean): Promise<void> {
  const db = await getDb();
  await db.update(users).set({ active, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId));
}

export async function setRole(userId: string, role: Role): Promise<void> {
  const db = await getDb();
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function countAdmins(): Promise<number> {
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(eq(users.role, 'admin'), eq(users.active, true)));
  return Number(n);
}

/* ---- activity log ---------------------------------------------------------- */

export type Actor = { id: string | null; name: string };

export async function logActivity(actor: Actor, action: string, summary: string, opts: { target?: string | null; details?: Record<string, unknown> } = {}): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(activityLog).values({ userId: actor.id, userName: actor.name, action, summary, target: opts.target ?? null, details: opts.details ?? null });
  } catch (e) {
    console.error('[activity] could not log', action, e instanceof Error ? e.message : e);
  }
}

export async function listActivity(limit = 500): Promise<Array<typeof activityLog.$inferSelect>> {
  const db = await getDb();
  return db.select().from(activityLog).orderBy(desc(activityLog.at)).limit(Math.min(limit, 5000));
}
