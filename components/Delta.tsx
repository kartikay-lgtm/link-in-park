/* "▲ 15.3% vs previous 30 days" under a KPI. Hidden when there is nothing
   to compare against yet. */
export default function Delta({ now, before, days = 7, label }: { now: number; before: number | null | undefined; days?: number; label?: string }) {
  label = label || `vs ${days} day${days === 1 ? '' : 's'} ago`;
  if (before === null || before === undefined) return null;
  const diff = now - before;
  if (before === 0 && diff === 0) return <div className="delta flat">— {label}</div>;
  const pctVal = before > 0 ? (100 * diff) / before : null;
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
  const text = pctVal === null ? `+${diff.toLocaleString('en-IN')}` : `${Math.abs(pctVal).toFixed(1)}%`;
  return <div className={`delta ${dir}`} title={`${diff >= 0 ? '+' : ''}${diff.toLocaleString('en-IN')} ${label}`}>{arrow} {text} <span className="faint font-medium">{label}</span></div>;
}
