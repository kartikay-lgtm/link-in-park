'use client';

import { useState, useTransition } from 'react';
import { moveCampaignsAction } from '@/app/actions';
import type { FolderItem } from './FolderSidebar';

/* "Folder: [ … ]" for one campaign. Saves as soon as you pick. */
export default function FolderSelect({ displayId, folders, current }: { displayId: string; folders: FolderItem[]; current: string | null }) {
  const [value, setValue] = useState(current || '');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      <span className="muted">Folder</span>
      <select className="select" style={{ width: 'auto', padding: '4px 8px' }} value={value} disabled={pending}
        onChange={(e) => {
          const v = e.target.value; setValue(v);
          start(async () => {
            const r = await moveCampaignsAction([displayId], v || null);
            setMsg(r.ok ? { ok: true, text: 'Saved' } : { ok: false, text: r.error });
            setTimeout(() => setMsg(null), 2000);
          });
        }}>
        <option value="">Unfiled</option>
        {folders.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}
      </select>
      {msg && <span className={`badge ${msg.ok ? 'badge-ok' : 'badge-bad'}`}>{msg.text}</span>}
    </span>
  );
}
