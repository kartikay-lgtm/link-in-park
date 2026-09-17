'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { importAction, refreshMineAction, syncReportingAction } from '@/app/actions';
import Icon from './Icon';

type Msg = { kind: 'ok' | 'warn' | 'bad' | 'info'; text: string };

/* Import = pull the campaign list from Linkrunner (fast, no rate limit).
   Refresh mine = put your active campaigns at the front of the numbers
   queue and run it: five requests, one a minute. The background loop does
   this on its own every few minutes; the button just does it now. */
export default function SyncButtons({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg | null>(null);
  const [running, setRunning] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function runImport() {
    start(async () => {
      setMsg({ kind: 'info', text: 'Importing campaigns from Linkrunner…' });
      const r = await importAction();
      if (!r.ok) return setMsg({ kind: 'bad', text: r.error });
      setMsg({ kind: 'ok', text: `Imported ${r.data.total} campaigns (${r.data.added} new, ${r.data.updated} updated${r.data.removed ? `, ${r.data.removed} deleted in Linkrunner` : ''}).` });
      router.refresh();
    });
  }

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRunning(false);
  }

  function step(first: boolean) {
    start(async () => {
      const r = first ? await refreshMineAction() : await syncReportingAction();
      if (!r.ok) { stop(); return setMsg({ kind: 'bad', text: r.error }); }
      const d = r.data;
      if (d.status === 'error') { stop(); return setMsg({ kind: 'bad', text: `${d.message} (retry in ${d.retryInSeconds}s)` }); }
      if (d.status === 'waiting') {
        setMsg({ kind: 'info', text: d.reason === 'rate-limited' ? `Linkrunner's minute is taken - retrying in ${d.retryInSeconds}s…` : `Next request in ${d.retryInSeconds}s…` });
        timer.current = setTimeout(() => step(false), (d.retryInSeconds + 2) * 1000);
        return;
      }
      router.refresh();
      // The hot set is the first five steps of the plan; stop once it is done.
      if (d.label && !d.label.startsWith('all campaigns') && d.page >= d.pages) {
        stop();
        return setMsg({ kind: 'ok', text: 'Your campaigns are up to date.' });
      }
      if (d.label && d.label.startsWith('all campaigns')) { stop(); return setMsg({ kind: 'ok', text: 'Your campaigns are up to date.' }); }
      setMsg({ kind: 'info', text: `${d.label || 'page'} done (${d.page} of ${d.pages}) - next in a minute…` });
      timer.current = setTimeout(() => step(false), 61_000);
    });
  }

  const badge = msg ? (msg.kind === 'ok' ? 'badge-ok' : msg.kind === 'warn' ? 'badge-warn' : msg.kind === 'bad' ? 'badge-bad' : 'badge-accent') : '';

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {msg && <span className={`badge ${badge}`}>{msg.text}</span>}
      <button className="btn btn-sm" onClick={runImport} disabled={disabled || pending || running} title="Pull the campaign list from Linkrunner"><Icon name="download" size={14} />Import</button>
      {running ? (
        <button className="btn btn-sm btn-active" onClick={stop}><Icon name="refresh" size={14} />Refreshing… stop</button>
      ) : (
        <button className="btn btn-sm" onClick={() => { setRunning(true); step(true); }} disabled={disabled || pending} title="Refresh your active campaigns now (about 5 minutes)"><Icon name="refresh" size={14} />Refresh mine now</button>
      )}
    </div>
  );
}
