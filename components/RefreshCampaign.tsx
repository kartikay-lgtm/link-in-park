'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { refreshCampaignAction } from '@/app/actions';
import Icon from './Icon';

/* Fresh numbers for this campaign: one request to Linkrunner, taking the
   next free minute slot. */
export default function RefreshCampaign({ displayId }: { displayId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="btn btn-sm btn-outline" disabled={pending} onClick={() => {
        setMsg(null);
        start(async () => {
          const r = await refreshCampaignAction(displayId);
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: r.data.waitedMs > 5000 ? `Updated (waited ${Math.round(r.data.waitedMs / 1000)}s for a free slot)` : 'Updated' });
          router.refresh();
          setTimeout(() => setMsg(null), 4000);
        });
      }} title="Fetch this campaign's numbers from Linkrunner now">
        <Icon name="refresh" size={14} className={pending ? 'animate-spin' : undefined} />{pending ? 'Refreshing…' : 'Refresh now'}
      </button>
      {msg && <span className={`badge ${msg.ok ? 'badge-ok' : 'badge-bad'}`}>{msg.text}</span>}
    </span>
  );
}
