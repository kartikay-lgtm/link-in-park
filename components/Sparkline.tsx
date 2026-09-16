/* A small inline chart - no library, renders on the server. */
export default function Sparkline({ points, label }: { points: Array<{ x: string; y: number }>; label: string }) {
  if (points.length < 2) return <p className="muted text-xs">Not enough history yet - {label} builds up with each refresh.</p>;
  const w = 560, h = 80, pad = 4;
  const ys = points.map((p) => p.y);
  const max = Math.max(...ys, 1), min = Math.min(...ys, 0);
  const sx = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1);
  const sy = (y: number) => h - pad - ((y - min) * (h - pad * 2)) / (max - min || 1);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={label}>
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
        <circle cx={sx(points.length - 1)} cy={sy(points[points.length - 1].y)} r="3" fill="var(--accent)" />
      </svg>
      <div className="flex justify-between text-xs muted"><span>{points[0].x}</span><span>{points[points.length - 1].x}</span></div>
    </div>
  );
}
