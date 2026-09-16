'use client';

import { useState, useTransition } from 'react';
import { attachRedirectAction, setCustomRedirectAction } from '@/app/actions';

type Target = 'website' | 'android' | 'ios';

/* Two ways to change an existing link's web redirection: mint a fresh
   identifier on a landing page, or paste any URL by hand. Either way the old
   redirect is kept in history with its own numbers. */
export default function RedirectEditor({ displayId, defaultBaseUrl, currentUrl, disabled }: { displayId: string; defaultBaseUrl: string; currentUrl: string; disabled: boolean }) {
  const [mode, setMode] = useState<'closed' | 'generate' | 'custom'>('closed');
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [custom, setCustom] = useState(currentUrl);
  const [android, setAndroid] = useState(false);
  const [ios, setIos] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const targets: Target[] = ['website', ...(android ? ['android' as const] : []), ...(ios ? ['ios' as const] : [])];

  function generate() {
    setMsg(null);
    start(async () => {
      const r = await attachRedirectAction({ displayId, baseUrl, targets });
      setMsg(r.ok ? { ok: true, text: `New redirect live with identifier ${r.data.identifier}.` } : { ok: false, text: r.error });
      if (r.ok) setMode('closed');
    });
  }

  function apply() {
    setMsg(null);
    start(async () => {
      const r = await setCustomRedirectAction({ displayId, url: custom, targets });
      setMsg(r.ok ? { ok: true, text: 'Redirect updated in Linkrunner.' } : { ok: false, text: r.error });
      if (r.ok) setMode('closed');
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-outline btn-sm" onClick={() => setMode(mode === 'generate' ? 'closed' : 'generate')} disabled={disabled}>
          {currentUrl ? 'Replace with a new identifier' : 'Add web redirection'}
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => setMode(mode === 'custom' ? 'closed' : 'custom')} disabled={disabled}>Set a custom URL</button>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`}>{msg.text}</div>}

      {mode !== 'closed' && (
        <div className="panel p-4 space-y-3" style={{ background: 'var(--bg)' }}>
          {mode === 'generate' ? (
            <div>
              <label className="label">Landing page</label>
              <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
          ) : (
            <div>
              <label className="label">Redirect URL</label>
              <input className="input mono text-sm" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="https://…" />
            </div>
          )}
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked disabled /> Desktop URL</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={android} onChange={(e) => setAndroid(e.target.checked)} /> Also Android URL</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={ios} onChange={(e) => setIos(e.target.checked)} /> Also iOS URL</label>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" onClick={mode === 'generate' ? generate : apply} disabled={pending}>{pending ? 'Applying…' : 'Apply to Linkrunner'}</button>
            <button className="btn btn-sm" onClick={() => setMode('closed')}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
