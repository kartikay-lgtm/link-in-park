'use client';

import { useState, useTransition } from 'react';
import { createFolderAction, deleteFolderAction, moveFolderAction, renameFolderAction } from '@/app/actions';
import Icon from './Icon';

export type FolderItem = { id: string; name: string; parentId: string | null; path: string; depth: number };
export type FolderKey = 'all' | 'unfiled' | string; // string = folder id

/* The folder tree. Selecting a node scopes the campaign table to it (and its
   sections). Each folder has a small menu for housekeeping; every change goes
   through a server action and the page data refreshes on its own. */
export default function FolderSidebar({ folders, counts, totalCount, unfiledCount, selected, onSelect }: {
  folders: FolderItem[];
  counts: Map<string, number>;   // folder id → campaigns in it, including sections
  totalCount: number;
  unfiledCount: number;
  selected: FolderKey;
  onSelect: (k: FolderKey) => void;
}) {
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined); // undefined = closed, null = top level
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  function submitCreate() {
    if (creatingUnder === undefined) return;
    const parent = creatingUnder;
    start(async () => {
      const r = await createFolderAction(draft, parent);
      if (!r.ok) return setError(r.error);
      setError(''); setDraft(''); setCreatingUnder(undefined);
      onSelect(r.data.id);
    });
  }
  function submitRename(id: string) {
    start(async () => {
      const r = await renameFolderAction(id, draft);
      if (!r.ok) return setError(r.error);
      setError(''); setDraft(''); setRenaming(null);
    });
  }
  // Deleting asks inline (the desktop app swallows browser confirm dialogs).
  function remove(f: FolderItem) {
    start(async () => {
      const r = await deleteFolderAction(f.id);
      if (!r.ok) return setError(r.error);
      if (selected === f.id) onSelect(f.parentId || 'all');
      setConfirming(null); setMenu(null);
    });
  }
  function submitMove(id: string, parentId: string | null) {
    start(async () => {
      const r = await moveFolderAction(id, parentId);
      if (!r.ok) return setError(r.error);
      setError(''); setMoving(null);
    });
  }

  // A render helper rather than a nested component: a component declared
  // inside render remounts on every keystroke and the inline inputs would
  // lose focus after one character.
  const item = (k: FolderKey, label: string, count: number, depth = 0, f?: FolderItem) => {
    const active = selected === k;
    return (
      <div key={k} className="relative">
        <div className={`side-item ${active ? 'on' : ''}`} onClick={() => onSelect(k)} style={depth ? { marginLeft: depth * 12 } : undefined}>
          {renaming === f?.id ? (
            <input className="input" style={{ height: 24, padding: '0 6px' }} autoFocus value={draft} onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitRename(f!.id); if (e.key === 'Escape') setRenaming(null); }}
              onBlur={() => submitRename(f!.id)} />
          ) : (
            <span className="truncate">{label}</span>
          )}
          <span className="cnt">{count}</span>
          {f && (
            <button type="button" className="more" aria-label={`Options for ${f.name}`}
              onClick={(e) => { e.stopPropagation(); setMenu(menu === f.id ? null : f.id); }}><Icon name="more" size={14} /></button>
          )}
        </div>
        {f && menu === f.id && (
          <div className="menu absolute right-0 z-20 mt-0.5 w-44" onMouseLeave={() => setMenu(null)}>
            <button type="button" onClick={() => { setMenu(null); setDraft(''); setCreatingUnder(f.id); }}>New section inside</button>
            <button type="button" onClick={() => { setMenu(null); setDraft(f.name); setRenaming(f.id); }}>Rename</button>
            <button type="button" onClick={() => { setMenu(null); setMoving(f.id); }}>Move to…</button>
            <button type="button" className="btn-danger" onClick={() => { setMenu(null); setConfirming(f.id); }}>Delete…</button>
          </div>
        )}
        {f && confirming === f.id && (
          <div className="alert alert-bad text-[12.5px] my-1 space-y-2" style={{ marginLeft: depth * 12 }}>
            <div>Delete <b>{f.name}</b>?{' '}
              {(counts.get(f.id) || 0) > 0 || folders.some((o) => o.parentId === f.id)
                ? `Its ${counts.get(f.id) || 0} campaign${(counts.get(f.id) || 0) === 1 ? '' : 's'} and any sections move up one level - nothing is lost.`
                : 'It is empty.'}
            </div>
            <div className="flex gap-1">
              <button type="button" className="btn btn-sm btn-primary" style={{ background: 'var(--bad)', color: '#fff' }} onClick={() => remove(f)} disabled={pending}>{pending ? 'Deleting…' : 'Delete folder'}</button>
              <button type="button" className="btn btn-sm" onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          </div>
        )}
        {f && moving === f.id && (
          <div className="py-1 flex items-center gap-1" style={{ marginLeft: depth * 12 + 8 }}>
            <select className="select" style={{ height: 26, fontSize: 12.5 }} defaultValue={f.parentId || ''} onChange={(e) => submitMove(f.id, e.target.value || null)}>
              <option value="">Top level</option>
              {folders.filter((o) => o.id !== f.id && !o.path.startsWith(f.path + ' / ')).map((o) => <option key={o.id} value={o.id}>{o.path}</option>)}
            </select>
            <button type="button" className="btn btn-icon" onClick={() => setMoving(null)} aria-label="Cancel"><Icon name="x" size={14} /></button>
          </div>
        )}
        {f && creatingUnder === f.id && (
          <div className="py-1 flex items-center gap-1" style={{ marginLeft: (depth + 1) * 12 + 8 }}>
            <input className="input" style={{ height: 26, fontSize: 12.5 }} autoFocus placeholder="Section name" value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setCreatingUnder(undefined); }} />
            <button type="button" className="btn btn-sm btn-primary" onClick={submitCreate} disabled={pending}>Add</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-full md:w-60 shrink-0 space-y-1">
      {item('all', 'All campaigns', totalCount)}
      {item('unfiled', 'Unfiled', unfiledCount)}
      <div className="section-title pt-5 pb-2 px-3" style={{ fontSize: 14 }}>Folders</div>
      {folders.map((f) => item(f.id, f.name, counts.get(f.id) || 0, f.depth, f))}
      {creatingUnder === null ? (
        <div className="py-1 pl-2 flex items-center gap-1">
          <input className="input" style={{ height: 26, fontSize: 12.5 }} autoFocus placeholder="Folder name" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setCreatingUnder(undefined); }} />
          <button type="button" className="btn btn-sm btn-primary" onClick={submitCreate} disabled={pending}>Add</button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm muted mt-1" onClick={() => { setDraft(''); setCreatingUnder(null); }}><Icon name="plus" size={14} />New folder</button>
      )}
      {error && <div className="alert alert-bad text-xs mt-1">{error}</div>}
    </aside>
  );
}
