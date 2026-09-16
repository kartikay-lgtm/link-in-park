'use client';

import { useRef, useState, useTransition } from 'react';
import { uploadWebUsersCsvAction } from '@/app/actions';
import Icon from './Icon';

/* "Upload CSV": pick the day's export of the Webflow Users question and it
   is merged into what is already known. */
export default function CsvUpload() {
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function onPick(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set('file', file);
    start(async () => {
      const r = await uploadWebUsersCsvAction(fd);
      setMsg(r.ok
        ? { ok: true, text: `${r.data.rows} rows read · ${r.data.added} new people, ${r.data.updated} updated · ${r.data.total} in total${r.data.firstTouchKept ? ` · first touch kept for ${r.data.firstTouchKept} whose export value had changed` : ''}` }
        : { ok: false, text: r.error });
      if (input.current) input.current.value = '';
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {msg && <span className={`badge ${msg.ok ? 'badge-ok' : 'badge-bad'}`}>{msg.text}</span>}
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
      <button type="button" className="btn btn-outline btn-sm" onClick={() => input.current?.click()} disabled={pending}>
        <Icon name="download" size={14} />{pending ? 'Merging…' : 'Upload CSV'}
      </button>
    </div>
  );
}
