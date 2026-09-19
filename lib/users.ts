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
  await db.insert(users).values({ email: env.adminEmail.toLowerCase(), name: env.adminName, passwordHash: hashPassword(env.appPassword.toLowerCase()), role: 'admin' }).onConflictDoNothing();
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

/* Looks a person up by what they typed: their name, or their email. */
export async function findUserByLogin(login: string): Promise<User | null> {
  const key = login.trim().toLowerCase();
  if (!key) return null;
  const db = await getDb();
  const [byEmail] = await db.select().from(users).where(eq(users.email, key));
  if (byEmail) return byEmail;
  const [byName] = await db.select().from(users).where(sql`lower(${users.name}) = ${key}`);
  return byName || null;
}

/* Checks a login; returns the user or null. Passwords are compared
   case-insensitively (the team's passwords are their own names). */
export async function authenticate(login: string, password: string): Promise<User | null> {
  await ensureAdmin();
  const u = await findUserByLogin(login);
  if (!u || !u.active || !verifyPassword(password.toLowerCase(), u.passwordHash)) return null;
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
  // Read the cookie before anything else: it marks the render as
  // per-request, so a build-time prerender never reaches the database.
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!(await gated())) return null;
  const claims = await verifySession(sessionSecret(), raw);
  if (!claims) return null;
  const db = await getDb();
  const [u] = await db.select().from(users).where(and(eq(users.id, claims.userId), eq(users.active, true)));
  if (!u || u.sessionVersion !== claims.version) return null;
  return safe(u);
}

/* ---- admin operations ------------------------------------------------------ */

export async function createUser(input: { email?: string; name: string; password: string; role: Role; createdBy?: string | null }): Promise<SafeUser> {
  // Email is optional: people sign in with their name. A placeholder keeps
  // the column unique.
  const email = (input.email || '').trim().toLowerCase() || `${input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}@team.local`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address');
  if (input.name.trim().length < 2) throw new Error('Enter the person\'s name');
  if (input.password.length < 3) throw new Error('Password must be at least 3 characters');
  const db = await getDb();
  if (await findUserByEmail(email)) throw new Error('A user with that email already exists');
  if (await findUserByLogin(input.name)) throw new Error('A user with that name already exists');
  const [u] = await db.insert(users).values({ email, name: input.name.trim(), passwordHash: hashPassword(input.password.toLowerCase()), role: input.role, createdBy: input.createdBy || null }).returning();
  return safe(u);
}

export async function setPassword(userId: string, password: string): Promise<void> {
  if (password.length < 3) throw new Error('Password must be at least 3 characters');
  const db = await getDb();
  // Bumping the session version logs that person out everywhere.
  await db.update(users).set({ passwordHash: hashPassword(password.toLowerCase()), sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId));
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
