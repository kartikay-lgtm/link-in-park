'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { createCampaignAction } from '@/app/actions';
import CopyButton from './CopyButton';
import type { FolderItem } from './FolderSidebar';
import Icon from './Icon';

type Created = { displayId: string; name: string; link: string; website: string; identifier: string };

/* Same alphabet as the server (lib/ids.ts): lowercase + digits without the
   look-alikes 0/o and 1/l/i. Five characters. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function newIdentifier(): string {
  const buf = new Uint32Array(5);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

function withIdentifier(base: string, param: string, extra: string, id: string): string {
  try {
    const u = new URL(base);
    new URLSearchParams(extra).forEach((v, k) => { if (k !== param) u.searchParams.set(k, v); });
    u.searchParams.set(param, id);
    return u.toString();
  } catch { return base; }
}

function idFrom(url: string, param: string): string {
  try { return new URL(url).searchParams.get(param) || ''; } catch { return ''; }
}

/* The Linkrunner "Create Campaign" dialog, rebuilt: the same fields, plus
   "Add web redirection", which fills the Desktop URL with a fresh identifier
   before anything is created. One button then creates the campaign in
   Linkrunner, sets the redirects, and records it here. */
export default function CreateFlow({ defaultBaseUrl, param, extraParams, disabled, folders, initialFolderId }: {
  defaultBaseUrl: string; param: string; extraParams: string; disabled: boolean; folders: FolderItem[]; initialFolderId: string;
}) {
  const [name, setName] = useState('');
  const [displayId, setDisplayId] = useState('');
  const [folderId, setFolderId] = useState(initialFolderId);
  const [deferred, setDeferred] = useState(false);
  const [deeplink, setDeeplink] = useState('');

  const [webRedirect, setWebRedirect] = useState(false);
  const [desktop, setDesktop] = useState('');
  const [android, setAndroid] = useState('');
  const [ios, setIos] = useState('');
  const [showMobile, setShowMobile] = useState(false);

  const [created, setCreated] = useState<Created | null>(null);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const identifier = idFrom(desktop, param);

  function addWebRedirect() {
    setWebRedirect(true);
    setDesktop(withIdentifier(defaultBaseUrl, param, extraParams, newIdentifier()));
  }
  function regenerate() {
    const base = (() => { try { const u = new URL(desktop || defaultBaseUrl); u.search = ''; return u.toString(); } catch { return defaultBaseUrl; } })();
    setDesktop(withIdentifier(base, param, extraParams, newIdentifier()));
  }
  function removeWebRedirect() {
    setWebRedirect(false); setDesktop(''); setAndroid(''); setIos(''); setShowMobile(false);
  }

  function create() {
    setError('');
    start(async () => {
      const r = await createCampaignAction({
        name, customDisplayId: displayId || undefined, deeplink: deferred ? deeplink : undefined,
        website: webRedirect ? desktop : undefined, androidWebRedirect: webRedirect ? android : undefined, iosWebRedirect: webRedirect ? ios : undefined,
        folderId: folderId || null,
      });
      if (!r.ok) return setError(r.error);
      setCreated(r.data);
    });
  }

  function reset() {
    setName(''); setDisplayId(''); setDeferred(false); setDeeplink(''); removeWebRedirect(); setCreated(null); setError('');
  }

  const canCreate = !disabled && !pending && name.trim().length >= 2 && (!webRedirect || desktop.trim().length > 0) && (!deferred || deeplink.trim().length > 0);

  if (created) {
    return (
      <div className="panel p-6 space-y-5">
        <div className="flex items-center gap-2">
          <span className="badge badge-ok">Created</span>
          <span className="font-semibold">{created.name}</span>
          <span className="faint mono text-xs">{created.displayId}</span>
          {folderId && <span className="badge badge-muted">{folders.find((f) => f.id === folderId)?.path}</span>}
        </div>
        <div className="grid gap-3 sm:grid-cols-[110px_1fr] items-center text-sm">
          <span className="muted">Link</span>
          <span className="flex items-center gap-2 min-w-0"><span className="mono text-[13px] truncate">{created.link}</span><CopyButton text={created.link} label="Copy link" /></span>
          {created.website && (<>
            <span className="muted">Web redirect</span>
            <span className="flex items-center gap-2 min-w-0"><span className="mono text-[13px] truncate">{created.website}</span><CopyButton text={created.website} label="Copy" /></span>
            <span className="muted">Identifier</span>
            <span><span className="badge badge-accent mono" style={{ fontSize: 13 }}>{created.identifier}</span></span>
          </>)}
        </div>
        <div className="flex gap-2">
          <Link href={`/campaigns/${encodeURIComponent(created.displayId)}`} className="btn btn-primary">Open campaign</Link>
          <button className="btn btn-outline" onClick={reset}>Create another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-6 space-y-6">
      {error && <div className="alert alert-bad">{error}</div>}

      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="name">Campaign name <span style={{ color: 'var(--bad)' }}>*</span></label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. LinkedIn post 15 Sep" autoFocus />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="displayId">Display ID <span className="faint font-normal">optional</span></label>
            <input id="displayId" className="input mono" value={displayId} onChange={(e) => setDisplayId(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))} placeholder="Leave blank and Linkrunner assigns one" />
          </div>
          <div>
            <label className="label" htmlFor="folder">Folder</label>
            <select id="folder" className="select w-full" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">Unfiled</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}
            </select>
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={deferred} onChange={(e) => setDeferred(e.target.checked)} />
          <span className="font-medium">Enable deferred deeplinking</span>
        </label>
        {deferred && (
          <div>
            <label className="label" htmlFor="deeplink">Deep link</label>
            <input id="deeplink" className="input mono" value={deeplink} onChange={(e) => setDeeplink(e.target.value)} placeholder="https://…" />
          </div>
        )}
      </div>

      <div className="hairline" />

      {/* Custom redirection */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="font-medium">Custom redirection</div>
          {!webRedirect ? (
            <button type="button" className="btn btn-outline ml-auto" onClick={addWebRedirect}><Icon name="plus" size={14} />Add web redirection</button>
          ) : (
            <button type="button" className="btn muted ml-auto" onClick={removeWebRedirect}><Icon name="x" size={14} />Remove</button>
          )}
        </div>

        {webRedirect && (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="desktop">Desktop URL</label>
              <div className="flex items-center gap-2">
                <input id="desktop" className="input mono" value={desktop} onChange={(e) => setDesktop(e.target.value)} />
                {identifier && <span className="badge badge-accent mono" title="Identifier">{identifier}</span>}
                <button type="button" className="btn btn-outline btn-sm whitespace-nowrap" onClick={regenerate} title="Generate a fresh identifier"><Icon name="refresh" size={14} />New code</button>
              </div>
            </div>

            {!showMobile ? (
              <button type="button" className="link text-[13px]" onClick={() => setShowMobile(true)}>Also redirect Android / iOS visitors to a web page…</button>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="android">Android URL <span className="faint font-normal">optional</span></label>
                  <input id="android" className="input mono" value={android} onChange={(e) => setAndroid(e.target.value)} placeholder="Leave blank to send to Play Store" />
                  <button type="button" className="link text-xs mt-1" onClick={() => setAndroid(desktop)}>Same as desktop</button>
                </div>
                <div>
                  <label className="label" htmlFor="ios">iOS URL <span className="faint font-normal">optional</span></label>
                  <input id="ios" className="input mono" value={ios} onChange={(e) => setIos(e.target.value)} placeholder="Leave blank to send to App Store" />
                  <button type="button" className="link text-xs mt-1" onClick={() => setIos(desktop)}>Same as desktop</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="hairline" />

      <div className="flex items-center gap-3">
        <button className="btn btn-primary" onClick={create} disabled={!canCreate}>{pending ? 'Creating…' : 'Create link'}</button>
      </div>
    </div>
  );
}
