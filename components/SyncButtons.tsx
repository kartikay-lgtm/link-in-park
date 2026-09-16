'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { importAction, refreshAnalyticsAction, syncReportingAction } from '@/app/actions';
import Icon from './Icon';

type Msg = { kind: 'ok' | 'warn' | 'bad' | 'info'; text: string };

/* Import = pull the campaign list from Linkrunner (fast, no rate limit).
   Refresh numbers = walk the Reporting API page by page. Linkrunner allows
   one page a minute, so with ~1,100 campaigns a full pass is ~12 minutes;
   this keeps going on its own while the tab is open and shows progress. */
export default function SyncButtons({ disabled }: { disabled?: boolean }) {
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
    });
  }

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRunning(false);
  }

  function step(auto: boolean) {
    start(async () => {
      const r = await syncReportingAction();
      if (!r.ok) { stop(); return setMsg({ kind: 'bad', text: r.error }); }
      const d = r.data;
      if (d.status === 'error') { stop(); return setMsg({ kind: 'bad', text: `${d.message} (retry in ${d.retryInSeconds}s)` }); }
      if (d.status === 'waiting') {
        const why = d.reason === 'rate-limited'
          ? `Linkrunner says the key is busy (something else is using its one-call-a-minute budget) - retrying in ${d.retryInSeconds}s`
          : `Linkrunner allows one page a minute - next page in ${d.retryInSeconds}s`;
        if (!auto) return setMsg({ kind: 'warn', text: why + '.' });
        setMsg({ kind: 'info', text: why + '…' });
        timer.current = setTimeout(() => step(true), (d.retryInSeconds + 2) * 1000);
        return;
      }
      await refreshAnalyticsAction();
      if (d.complete) {
        stop();
        return setMsg({ kind: 'ok', text: `All numbers refreshed (${d.pages} page${d.pages === 1 ? '' : 's'}).` });
      }
      const left = d.pages - d.page;
      setMsg({ kind: 'info', text: `Page ${d.page} of ${d.pages} done - about ${left} min left. You can keep using the console.` });
      timer.current = setTimeout(() => step(true), 61_000);
    });
  }

  function runRefresh() {
    setRunning(true);
    step(true);
  }

  const badge = msg ? (msg.kind === 'ok' ? 'badge-ok' : msg.kind === 'warn' ? 'badge-warn' : msg.kind === 'bad' ? 'badge-bad' : 'badge-accent') : '';

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {msg && <span className={`badge ${badge}`}>{msg.text}</span>}
      <button className="btn btn-sm" onClick={runImport} disabled={disabled || pending || running} title="Pull the campaign list from Linkrunner"><Icon name="download" size={14} />Import</button>
      {running ? (
        <button className="btn btn-sm btn-active" onClick={stop}><Icon name="refresh" size={14} />Refreshing… stop</button>
      ) : (
        <button className="btn btn-sm" onClick={runRefresh} disabled={disabled || pending} title="Fetch clicks / installs / sign-ups from Linkrunner"><Icon name="refresh" size={14} />Refresh numbers</button>
      )}
    </div>
  );
}
