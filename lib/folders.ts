/* Folder operations. Pure database work - nothing here talks to Linkrunner. */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from './db';
import type { Folder } from './db/schema';

const { folders, campaigns } = schema;

export type FolderNode = Folder & { path: string; depth: number };

/* All folders, parents before children, each with its full "A / B / C" path. */
export async function listFolders(): Promise<FolderNode[]> {
  const db = await getDb();
  const all = await db.select().from(folders);
  const byParent = new Map<string | null, Folder[]>();
  for (const f of all) {
    const list = byParent.get(f.parentId) || [];
    list.push(f);
    byParent.set(f.parentId, list);
  }
  const out: FolderNode[] = [];
  const walk = (parentId: string | null, prefix: string, depth: number) => {
    const kids = (byParent.get(parentId) || []).sort((a, b) => a.name.localeCompare(b.name));
    for (const k of kids) {
      const path = prefix ? `${prefix} / ${k.name}` : k.name;
      out.push({ ...k, path, depth });
      if (depth < 10) walk(k.id, path, depth + 1);
    }
  };
  walk(null, '', 0);
  return out;
}

export async function createFolder(name: string, parentId: string | null): Promise<Folder> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Give the folder a name');
  const db = await getDb();
  if (parentId) {
    const [p] = await db.select({ id: folders.id }).from(folders).where(eq(folders.id, parentId));
    if (!p) throw new Error('Parent folder no longer exists');
  }
  // Same name twice under one parent is only confusing.
  const [dupe] = await db.select({ id: folders.id }).from(folders)
    .where(and(parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId), sql`lower(${folders.name}) = lower(${trimmed})`));
  if (dupe) throw new Error(`A folder called "${trimmed}" already exists here`);
  const [row] = await db.insert(folders).values({ name: trimmed, parentId }).returning();
  return row;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Give the folder a name');
  const db = await getDb();
  await db.update(folders).set({ name: trimmed }).where(eq(folders.id, id));
}

/* Children and campaigns move up to the parent; nothing is lost. */
export async function deleteFolder(id: string): Promise<void> {
  const db = await getDb();
  const [f] = await db.select().from(folders).where(eq(folders.id, id));
  if (!f) return;
  await db.update(folders).set({ parentId: f.parentId }).where(eq(folders.parentId, id));
  await db.update(campaigns).set({ folderId: f.parentId }).where(eq(campaigns.folderId, id));
  await db.delete(folders).where(eq(folders.id, id));
}

/* Moves a folder under a new parent (null = top level). Refuses to move a
   folder into itself or one of its own descendants. */
export async function moveFolder(id: string, parentId: string | null): Promise<void> {
  const db = await getDb();
  if (parentId) {
    let cursor: string | null = parentId;
    for (let guard = 0; cursor && guard < 20; guard++) {
      if (cursor === id) throw new Error('A folder cannot be moved inside itself');
      const [p] = await db.select({ parentId: folders.parentId }).from(folders).where(eq(folders.id, cursor));
      cursor = p ? p.parentId : null;
    }
  }
  await db.update(folders).set({ parentId }).where(eq(folders.id, id));
}

export async function moveCampaigns(displayIds: string[], folderId: string | null): Promise<number> {
  if (displayIds.length === 0) return 0;
  const db = await getDb();
  if (folderId) {
    const [f] = await db.select({ id: folders.id }).from(folders).where(eq(folders.id, folderId));
    if (!f) throw new Error('That folder no longer exists');
  }
  const res = await db.update(campaigns).set({ folderId, updatedAt: new Date() }).where(inArray(campaigns.displayId, displayIds)).returning();
  return res.length;
}
