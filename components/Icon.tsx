/* A handful of 16px stroke icons, inline so nothing is fetched. */
const PATHS: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.3-4.3',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  check: 'm5 12 5 5L20 7',
  chevron: 'm6 9 6 6 6-6',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5',
  download: 'M12 4v12m0 0 4-4m-4 4-4-4M4 20h16',
  external: 'M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  back: 'M19 12H5m0 0 6 6m-6-6 6-6',
};

export default function Icon({ name, size = 16, className, style }: { name: keyof typeof PATHS; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
      <path d={PATHS[name]} />
    </svg>
  );
}
