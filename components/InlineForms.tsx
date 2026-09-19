'use client';

import { useState, useTransition } from 'react';
import { renameCampaignAction, setNotesAction } from '@/app/actions';

export function RenameForm({ displayId, name, disabled }: { displayId: string; name: string; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <h1 className="text-[28px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>{name || '(unnamed)'}</h1>
        <button className="btn btn-sm muted" onClick={() => setEditing(true)} disabled={disabled}>Rename</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input className="input max-w-md" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => {
        const r = await renameCampaignAction(displayId, value);
        if (!r.ok) return setError(r.error);
        setEditing(false);
      })}>{pending ? 'Saving…' : 'Save'}</button>
      <button className="btn btn-sm" onClick={() => { setEditing(false); setValue(name); }}>Cancel</button>
      {error && <span className="badge badge-bad">{error}</span>}
    </div>
  );
}

export function NotesForm({ displayId, notes }: { displayId: string; notes: string }) {
  const [value, setValue] = useState(notes);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <textarea className="textarea" rows={3} value={value} onChange={(e) => { setValue(e.target.value); setSaved(false); }} placeholder="Where this link was posted, who owns it, anything worth remembering…" />
      <div className="flex items-center gap-2">
        <button className="btn btn-sm" disabled={pending || value === notes} onClick={() => start(async () => { const r = await setNotesAction(displayId, value); setSaved(r.ok); })}>Save notes</button>
        {saved && <span className="badge badge-ok">Saved</span>}
      </div>
    </div>
  );
}
