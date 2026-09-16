import type { ReactNode } from 'react';

/* A headline number without a box. Several in a row make a `.hero`. */
export function Hero({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

export function n(v: number | null | undefined): string {
  if (v === null || v === undefined) return '–';
  return v.toLocaleString('en-IN');
}

export function when(d: Date | string | null | undefined): string {
  if (!d) return '–';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '–';
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ago(d: Date | string | null | undefined): string {
  if (!d) return 'never';
  const t = typeof d === 'string' ? new Date(d).getTime() : d.getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/* One quiet line explaining why a number is missing. */
export function SourceNote({ name, configured, error, setupHref = '/setup' }: { name: string; configured: boolean; error: string | null; setupHref?: string }) {
  if (!configured) return <span className="badge badge-muted" title={`${name} is not connected`}>{name} not connected · <a className="underline" href={setupHref}>set up</a></span>;
  if (error) return <span className="badge badge-bad" title={error}>{name}: error</span>;
  return <span className="badge badge-ok">{name} connected</span>;
}
