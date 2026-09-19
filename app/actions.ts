'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { invalidateAnalyticsCache } from '@/lib/analytics';
import { SESSION_COOKIE } from '@/lib/auth';
import * as svc from '@/lib/campaigns';
import * as folderSvc from '@/lib/folders';
import type { RedirectTarget } from '@/lib/campaigns';
import { configured, env } from '@/lib/env';
import { identifierFromUrl, isValidHttpUrl } from '@/lib/redirect';
import { countAdmins, createUser, currentUser, gated, logActivity, setActive, setPassword, setRole, type Role, type SafeUser } from '@/lib/users';
import { generatePassword } from '@/lib/passwords';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[link-console]', msg);
  return { ok: false, error: msg };
}

/* Who is acting. When the console is not gated (a laptop with no accounts),
   a placeholder actor keeps the log meaningful. */
async function actor(): Promise<SafeUser | { id: null; name: string; role: 'admin' }> {
  const u = await currentUser();
  if (u) return u;
  if (!(await gated())) return { id: null, name: 'local', role: 'admin' };
  throw new Error('Please sign in again');
}

async function requireAdmin(): Promise<SafeUser | { id: null; name: string; role: 'admin' }> {
  const u = await actor();
  if (u.role !== 'admin') throw new Error('Only a super admin can do that');
  return u;
}

function needLinkrunner() {
  if (!configured.linkrunner) throw new Error('Linkrunner is not connected yet - add LINKRUNNER_API_KEY to .env.local and restart.');
}

const targetsSchema = z.array(z.enum(['website', 'android', 'ios'])).min(1);

/* ---- create flow --------------------------------------------------------- */

const createSchema = z.object({
  name: z.string().trim().min(2, 'Give the campaign a name'),
  customDisplayId: z.string().trim().max(60).regex(/^[A-Za-z0-9_-]*$/, 'Display ID can only use letters, numbers, - and _').optional(),
  deeplink: z.string().trim().optional(),
  website: z.string().trim().optional(),
  androidWebRedirect: z.string().trim().optional(),
  iosWebRedirect: z.string().trim().optional(),
  folderId: z.string().uuid().nullable().optional(),
});

export async function createCampaignAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ displayId: string; name: string; link: string; website: string; identifier: string }>> {
  try {
    needLinkrunner();
    const who = await actor();
    const v = createSchema.parse(input);
    for (const [label, url] of [['Deep link', v.deeplink], ['Desktop URL', v.website], ['Android URL', v.androidWebRedirect], ['iOS URL', v.iosWebRedirect]] as const) {
      if (url && !isValidHttpUrl(url)) throw new Error(`${label} must be a full URL (https://…)`);
    }
    const c = await svc.createCampaign({
      name: v.name, customDisplayId: v.customDisplayId || undefined, deeplink: v.deeplink || undefined,
      website: v.website || undefined, androidWebRedirect: v.androidWebRedirect || undefined, iosWebRedirect: v.iosWebRedirect || undefined,
      folderId: v.folderId || null,
    });
    await logActivity(who, 'link.create', `${who.name} created link "${c.name}"${c.website ? ` with redirect ${identifierFromUrl(c.website) || c.website}` : ''}`, {
      target: c.displayId,
      details: { link: c.link, name: c.name, displayId: c.displayId, website: c.website || null, identifier: identifierFromUrl(c.website) || null, android: v.androidWebRedirect || null, ios: v.iosWebRedirect || null, deeplink: v.deeplink || null, folderId: v.folderId || null },
    });
    revalidatePath('/', 'layout');
    return { ok: true, data: { displayId: c.displayId, name: c.name, link: c.link, website: c.website, identifier: identifierFromUrl(c.website) } };
  } catch (e) {
    return fail(e);
  }
}

const attachSchema = z.object({
  displayId: z.string().min(1),
  baseUrl: z.string().trim().optional(),
  targets: targetsSchema.optional(),
});

export async function attachRedirectAction(
  input: z.input<typeof attachSchema>,
): Promise<ActionResult<{ identifier: string; url: string }>> {
  try {
    needLinkrunner();
    const who = await actor();
    const v = attachSchema.parse(input);
    const baseUrl = v.baseUrl || env.redirectBaseUrl;
    if (!isValidHttpUrl(baseUrl)) throw new Error('Landing page must be a full URL (https://…)');
    const r = await svc.attachGeneratedRedirect({
      displayId: v.displayId, baseUrl, targets: (v.targets as RedirectTarget[] | undefined) || ['website'],
    });
    invalidateAnalyticsCache();
    await logActivity(who, 'redirect.replace', `${who.name} set web redirect ${r.identifier} on ${v.displayId}`, { target: v.displayId, details: { url: r.url, identifier: r.identifier, targets: v.targets } });
    revalidatePath('/', 'layout');
    return { ok: true, data: { identifier: r.identifier, url: r.url } };
  } catch (e) {
    return fail(e);
  }
}

/* ---- editing existing campaigns ------------------------------------------ */

const customSchema = z.object({
  displayId: z.string().min(1),
  url: z.string().trim().min(1, 'Enter a URL'),
  targets: targetsSchema.optional(),
});

export async function setCustomRedirectAction(input: z.input<typeof customSchema>): Promise<ActionResult<null>> {
  try {
    needLinkrunner();
    const who = await actor();
    const v = customSchema.parse(input);
    if (!isValidHttpUrl(v.url)) throw new Error('Redirect must be a full URL (https://…)');
    await svc.setCustomRedirect(v.displayId, v.url, (v.targets as RedirectTarget[] | undefined) || ['website']);
    invalidateAnalyticsCache();
    await logActivity(who, 'redirect.custom', `${who.name} set a custom redirect on ${v.displayId}`, { target: v.displayId, details: { url: v.url, identifier: identifierFromUrl(v.url) || null, targets: v.targets } });
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function renameCampaignAction(displayId: string, name: string): Promise<ActionResult<null>> {
  try {
    needLinkrunner();
    const who = await actor();
    await svc.renameCampaign(displayId, name);
    await logActivity(who, 'campaign.rename', `${who.name} renamed ${displayId} to "${name.trim()}"`, { target: displayId, details: { name: name.trim() } });
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function setNotesAction(displayId: string, notes: string): Promise<ActionResult<null>> {
  try {
    const who = await actor();
    await svc.setNotes(displayId, notes.slice(0, 5000));
    await logActivity(who, 'campaign.notes', `${who.name} edited notes on ${displayId}`, { target: displayId });
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

/* ---- sync ------------------------------------------------------------------ */

export async function importAction(): Promise<ActionResult<svc.ImportResult>> {
  try {
    needLinkrunner();
    const who = await actor();
    const r = await svc.importFromLinkrunner();
    await logActivity(who, 'sync.import', `${who.name} imported from Linkrunner (${r.added} new, ${r.updated} updated)`, { details: r as unknown as Record<string, unknown> });
    invalidateAnalyticsCache();
    revalidatePath('/', 'layout');
    return { ok: true, data: r };
  } catch (e) {
    return fail(e);
  }
}

/* Put the hot pages (your active campaigns) first in the queue and take the
   first one now if the minute is free. */
export async function refreshMineAction(): Promise<ActionResult<svc.SyncResult>> {
  try {
    needLinkrunner();
    const who = await actor();
    await svc.prioritiseHot();
    const r = await svc.syncReportingPage();
    await logActivity(who, 'sync.refresh', `${who.name} refreshed their campaigns' numbers`, { details: r as unknown as Record<string, unknown> });
    if (r.status === 'fetched') invalidateAnalyticsCache();
    return { ok: true, data: r };
  } catch (e) {
    return fail(e);
  }
}

/* Fresh numbers for a single campaign - one request, a few seconds. */
export async function refreshCampaignAction(displayId: string): Promise<ActionResult<{ waitedMs: number }>> {
  try {
    needLinkrunner();
    await actor();
    const r = await svc.refreshOneCampaign(displayId);
    if (!r.ok) throw new Error(r.error);
    invalidateAnalyticsCache();
    revalidatePath('/', 'layout');
    return { ok: true, data: { waitedMs: r.waitedMs } };
  } catch (e) {
    return fail(e);
  }
}

export async function syncReportingAction(): Promise<ActionResult<svc.SyncResult>> {
  try {
    needLinkrunner();
    const who = await actor();
    const r = await svc.syncReportingPage();
    await logActivity(who, 'sync.refresh', `${who.name} refreshed numbers`, { details: r as unknown as Record<string, unknown> });
    revalidatePath('/', 'layout');
    return { ok: true, data: r };
  } catch (e) {
    return fail(e);
  }
}

export async function refreshAnalyticsAction(): Promise<ActionResult<null>> {
  invalidateAnalyticsCache();
  revalidatePath('/', 'layout');
  return { ok: true, data: null };
}

/* ---- login ----------------------------------------------------------------- */

export async function logoutAction(): Promise<void> {
  const u = await currentUser();
  if (u) await logActivity(u, 'auth.logout', `${u.name} signed out`);
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}

/* ---- folders --------------------------------------------------------------- */

export async function createFolderAction(name: string, parentId: string | null): Promise<ActionResult<{ id: string }>> {
  try {
    const who = await actor();
    const f = await folderSvc.createFolder(name, parentId);
    await logActivity(who, 'folder.create', `${who.name} created folder "${name.trim()}"`, { target: f.id });
    revalidatePath('/', 'layout');
    return { ok: true, data: { id: f.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function renameFolderAction(id: string, name: string): Promise<ActionResult<null>> {
  try {
    const who = await actor();
    await folderSvc.renameFolder(id, name);
    await logActivity(who, 'folder.rename', `${who.name} renamed a folder to "${name.trim()}"`, { target: id });
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFolderAction(id: string): Promise<ActionResult<null>> {
  try {
    const who = await actor();
    await folderSvc.deleteFolder(id);
    await logActivity(who, 'folder.delete', `${who.name} deleted a folder`, { target: id });
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function moveFolderAction(id: string, parentId: string | null): Promise<ActionResult<null>> {
  try {
    const who = await actor();
    await folderSvc.moveFolder(id, parentId);
    await logActivity(who, 'folder.move', `${who.name} moved a folder`, { target: id });
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function moveCampaignsAction(displayIds: string[], folderId: string | null): Promise<ActionResult<{ moved: number }>> {
  try {
    const who = await actor();
    const moved = await folderSvc.moveCampaigns(displayIds.slice(0, 2000), folderId);
    await logActivity(who, 'campaign.move', `${who.name} moved ${moved} campaign${moved === 1 ? '' : 's'} to ${folderId ? 'a folder' : 'Unfiled'}`, { details: { displayIds: displayIds.slice(0, 200), folderId } });
    revalidatePath('/', 'layout');
    return { ok: true, data: { moved } };
  } catch (e) {
    return fail(e);
  }
}

/* ---- web users: CSV upload --------------------------------------------- */

export async function uploadWebUsersCsvAction(formData: FormData): Promise<ActionResult<{ rows: number; added: number; updated: number; total: number; firstTouchKept: number }>> {
  try {
    const who = await actor();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Choose a CSV file first');
    if (file.size > 50 * 1024 * 1024) throw new Error('That file is over 50 MB');
    const { ingestCsv } = await import('@/lib/webusers');
    const r = await ingestCsv(await file.text(), file.name);
    await logActivity(who, 'webusers.upload', `${who.name} uploaded ${file.name} (${r.rows} rows, ${r.added} new)`, { details: { file: file.name, ...r } });
    revalidatePath('/', 'layout');
    return { ok: true, data: r };
  } catch (e) {
    return fail(e);
  }
}

/* ---- admin: users --------------------------------------------------------- */

export async function createUserAction(input: { email?: string; name: string; role: Role; password?: string }): Promise<ActionResult<{ id: string; password: string }>> {
  try {
    const admin = await requireAdmin();
    const password = input.password?.trim() || generatePassword();
    const u = await createUser({ email: input.email || '', name: input.name, role: input.role === 'admin' ? 'admin' : 'member', password, createdBy: admin.id || null });
    await logActivity(admin, 'user.create', `${admin.name} created user ${u.name} (${u.email}, ${u.role})`, { target: u.email, details: { role: u.role } });
    revalidatePath('/admin');
    return { ok: true, data: { id: u.id, password } };
  } catch (e) {
    return fail(e);
  }
}

export async function setUserPasswordAction(userId: string, password?: string): Promise<ActionResult<{ password: string }>> {
  try {
    const admin = await requireAdmin();
    const pw = password?.trim() || generatePassword();
    await setPassword(userId, pw);
    await logActivity(admin, 'user.password', `${admin.name} reset a user's password`, { target: userId });
    revalidatePath('/admin');
    return { ok: true, data: { password: pw } };
  } catch (e) {
    return fail(e);
  }
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    if (admin.id === userId && !active) throw new Error('You cannot disable your own account');
    if (!active && (await countAdmins()) <= 1) {
      const { listUsers } = await import('@/lib/users');
      const target = (await listUsers()).find((u) => u.id === userId);
      if (target?.role === 'admin') throw new Error('That is the only active super admin');
    }
    await setActive(userId, active);
    await logActivity(admin, active ? 'user.enable' : 'user.disable', `${admin.name} ${active ? 'enabled' : 'disabled'} a user`, { target: userId });
    revalidatePath('/admin');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function setUserRoleAction(userId: string, role: Role): Promise<ActionResult<null>> {
  try {
    const admin = await requireAdmin();
    if (admin.id === userId && role !== 'admin') throw new Error('You cannot remove your own super admin role');
    await setRole(userId, role === 'admin' ? 'admin' : 'member');
    await logActivity(admin, 'user.role', `${admin.name} made a user ${role === 'admin' ? 'a super admin' : 'a member'}`, { target: userId, details: { role } });
    revalidatePath('/admin');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}
