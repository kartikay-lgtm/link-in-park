'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Series } from '@/lib/signups';

type Range = 30 | 90 | 0; // 0 = all

/* Multi-series line chart, plain SVG.
   - one y axis; recessive 1px grid; 2px round-joined lines; 8px end markers
     with a surface ring; series identity in the legend and end labels
   - a crosshair that snaps to the nearest day, with one tooltip for all series
   - a range filter row and a table view of the same numbers */
export default function TimeSeriesChart({ series, title, note, defaultRange = 30 }: { series: Series[]; title: string; note?: string; defaultRange?: Range }) {
  const [range, setRange] = useState<Range>(defaultRange);
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const view = useMemo(() => {
    const all = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.date)))).sort();
    let dates = all;
    if (range && all.length) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - range);
      const key = cutoff.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      dates = all.filter((d) => d >= key);
    }
    const rows = series.map((s) => {
      const m = new Map(s.points.map((p) => [p.date, p.value]));
      return { ...s, values: dates.map((d) => m.get(d) ?? null) };
    });
    const max = Math.max(1, ...rows.flatMap((r) => r.values.filter((v): v is number => v !== null)));
    return { dates, rows, max: niceMax(max) };
  }, [series, range]);

  const H = 240, padL = 44, padR = 56, padT = 12, padB = 28;
  const innerW = Math.max(10, width - padL - padR), innerH = H - padT - padB;
  const n = view.dates.length;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v: number) => padT + innerH - (v / view.max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * view.max);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = n <= 1 ? 0 : Math.round(((px - padL) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  // End labels: nudge apart when two series finish at almost the same value.
  const endLabelY = useMemo(() => {
    const ends = view.rows.map((r, si) => {
      const idx = r.values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop();
      return idx === undefined ? null : { si, y: y(r.values[idx] as number) };
    }).filter((e): e is { si: number; y: number } => e !== null).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12;
    const m = new Map<number, number>();
    for (const e of ends) m.set(e.si, e.y);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, width]);

  const ranges: Array<[Range, string]> = [[30, '30d'], [90, '90d'], [0, 'All']];
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const xLabelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 90))));

  return (
    <div className="panel p-4" ref={wrap}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="section-title">{title}</div>
        <div className="ml-auto flex items-center gap-1">
          <div className="seg">
            {ranges.map(([r, label]) => (
              <button key={r} type="button" className={range === r ? 'on' : ''} onClick={() => setRange(r)}>{label}</button>
            ))}
          </div>
          <button type="button" className={`btn btn-sm ${table ? 'btn-active' : 'muted'}`} onClick={() => setTable((t) => !t)}>{table ? 'Chart' : 'Table'}</button>
        </div>
      </div>

      {series.length >= 2 && (
        <div className="flex flex-wrap gap-4 text-xs mb-2">
          {view.rows.map((r) => (
            <span key={r.name} className="inline-flex items-center gap-1.5">
              <span style={{ display: 'inline-block', width: 14, height: 2, background: r.color, borderRadius: 1 }} />
              {r.name}
            </span>
          ))}
        </div>
      )}

      {n === 0 ? (
        <p className="muted text-sm py-8 text-center">No data in this range yet.</p>
      ) : table ? (
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="table">
            <thead><tr><th>Date</th>{view.rows.map((r) => <th key={r.name} className="num">{r.name}</th>)}</tr></thead>
            <tbody>
              {view.dates.map((d, i) => (
                <tr key={d}><td>{fmt(d)}</td>{view.rows.map((r) => <td key={r.name} className="num">{r.values[i] ?? '–'}</td>)}</tr>
              )).reverse()}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg width={width} height={H} role="img" aria-label={title} onPointerMove={onMove} onPointerLeave={() => setHover(null)} style={{ display: 'block', maxWidth: '100%' }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={padL + innerW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
                <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{compact(t)}</text>
              </g>
            ))}
            {view.dates.map((d, i) => (i === n - 1 || (i % xLabelEvery === 0 && n - 1 - i >= Math.ceil(xLabelEvery / 2))) && (
              <text key={d} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{fmt(d)}</text>
            ))}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke="var(--muted)" strokeWidth="1" />}
            {view.rows.map((r, si) => {
              const pts = r.values.map((v, i) => (v === null ? null : [x(i), y(v)] as const));
              const d = pts.map((p, i) => (p ? `${i === 0 || !pts[i - 1] ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}` : '')).join(' ');
              const lastIdx = r.values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop();
              const last = lastIdx === undefined ? null : pts[lastIdx];
              return (
                <g key={r.name}>
                  <path d={d} fill="none" stroke={r.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {last && (
                    <>
                      <circle cx={last[0]} cy={last[1]} r="6" fill="var(--panel)" />
                      <circle cx={last[0]} cy={last[1]} r="4" fill={r.color} />
                      <text x={last[0] + 9} y={(endLabelY.get(si) ?? last[1]) + 4} fontSize="11" fill="var(--ink)" fontWeight="600">{compact(r.values[lastIdx!] as number)}</text>
                    </>
                  )}
                  {hover !== null && pts[hover] && (
                    <>
                      <circle cx={pts[hover]![0]} cy={pts[hover]![1]} r="6" fill="var(--panel)" />
                      <circle cx={pts[hover]![0]} cy={pts[hover]![1]} r="4" fill={r.color} />
                    </>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div className="menu px-3 py-2 text-xs absolute pointer-events-none"
              style={{ left: Math.min(x(hover) + 12, width - 170), top: 8, minWidth: 140 }}>
              <div className="font-semibold mb-1">{fmt(view.dates[hover])}</div>
              {view.rows.map((r) => (
                <div key={r.name} className="flex items-center gap-2">
                  <span style={{ display: 'inline-block', width: 12, height: 2, background: r.color }} />
                  <span className="font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.values[hover] ?? '–'}</span>
                  <span className="muted">{r.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {note && <p className="help">{note}</p>}
    </div>
  );
}

function niceMax(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return nice * p;
}

function compact(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v * 10) / 10);
}
