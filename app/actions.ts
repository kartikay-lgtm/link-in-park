'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { invalidateAnalyticsCache } from '@/lib/analytics';
import { sessionTokenFor, SESSION_COOKIE } from '@/lib/auth';
import * as svc from '@/lib/campaigns';
import * as folderSvc from '@/lib/folders';
import type { RedirectTarget } from '@/lib/campaigns';
import { configured, env } from '@/lib/env';
import { identifierFromUrl, isValidHttpUrl } from '@/lib/redirect';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('[link-console]', msg);
  return { ok: false, error: msg };
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
    const v = createSchema.parse(input);
    for (const [label, url] of [['Deep link', v.deeplink], ['Desktop URL', v.website], ['Android URL', v.androidWebRedirect], ['iOS URL', v.iosWebRedirect]] as const) {
      if (url && !isValidHttpUrl(url)) throw new Error(`${label} must be a full URL (https://…)`);
    }
    const c = await svc.createCampaign({
      name: v.name, customDisplayId: v.customDisplayId || undefined, deeplink: v.deeplink || undefined,
      website: v.website || undefined, androidWebRedirect: v.androidWebRedirect || undefined, iosWebRedirect: v.iosWebRedirect || undefined,
      folderId: v.folderId || null,
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
    const v = attachSchema.parse(input);
    const baseUrl = v.baseUrl || env.redirectBaseUrl;
    if (!isValidHttpUrl(baseUrl)) throw new Error('Landing page must be a full URL (https://…)');
    const r = await svc.attachGeneratedRedirect({
      displayId: v.displayId, baseUrl, targets: (v.targets as RedirectTarget[] | undefined) || ['website'],
    });
    invalidateAnalyticsCache();
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
    const v = customSchema.parse(input);
    if (!isValidHttpUrl(v.url)) throw new Error('Redirect must be a full URL (https://…)');
    await svc.setCustomRedirect(v.displayId, v.url, (v.targets as RedirectTarget[] | undefined) || ['website']);
    invalidateAnalyticsCache();
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function renameCampaignAction(displayId: string, name: string): Promise<ActionResult<null>> {
  try {
    needLinkrunner();
    await svc.renameCampaign(displayId, name);
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function setNotesAction(displayId: string, notes: string): Promise<ActionResult<null>> {
  try {
    await svc.setNotes(displayId, notes.slice(0, 5000));
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
    const r = await svc.importFromLinkrunner();
    invalidateAnalyticsCache();
    revalidatePath('/', 'layout');
    return { ok: true, data: r };
  } catch (e) {
    return fail(e);
  }
}

export async function syncReportingAction(): Promise<ActionResult<svc.SyncResult>> {
  try {
    needLinkrunner();
    const r = await svc.syncReportingPage();
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

export async function loginAction(_prev: { error: string } | null, form: FormData): Promise<{ error: string }> {
  const password = String(form.get('password') || '');
  if (!env.appPassword || password !== env.appPassword) {
    return { error: 'That password is not right.' };
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sessionTokenFor(env.appPassword), {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}

/* ---- folders --------------------------------------------------------------- */

export async function createFolderAction(name: string, parentId: string | null): Promise<ActionResult<{ id: string }>> {
  try {
    const f = await folderSvc.createFolder(name, parentId);
    revalidatePath('/', 'layout');
    return { ok: true, data: { id: f.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function renameFolderAction(id: string, name: string): Promise<ActionResult<null>> {
  try {
    await folderSvc.renameFolder(id, name);
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFolderAction(id: string): Promise<ActionResult<null>> {
  try {
    await folderSvc.deleteFolder(id);
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function moveFolderAction(id: string, parentId: string | null): Promise<ActionResult<null>> {
  try {
    await folderSvc.moveFolder(id, parentId);
    revalidatePath('/', 'layout');
    return { ok: true, data: null };
  } catch (e) {
    return fail(e);
  }
}

export async function moveCampaignsAction(displayIds: string[], folderId: string | null): Promise<ActionResult<{ moved: number }>> {
  try {
    const moved = await folderSvc.moveCampaigns(displayIds.slice(0, 2000), folderId);
    revalidatePath('/', 'layout');
    return { ok: true, data: { moved } };
  } catch (e) {
    return fail(e);
  }
}

/* ---- web users: CSV upload --------------------------------------------- */

export async function uploadWebUsersCsvAction(formData: FormData): Promise<ActionResult<{ rows: number; added: number; updated: number; total: number; firstTouchKept: number }>> {
  try {
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) throw new Error('Choose a CSV file first');
    if (file.size > 50 * 1024 * 1024) throw new Error('That file is over 50 MB');
    const { ingestCsv } = await import('@/lib/webusers');
    const r = await ingestCsv(await file.text(), file.name);
    revalidatePath('/', 'layout');
    return { ok: true, data: r };
  } catch (e) {
    return fail(e);
  }
}
