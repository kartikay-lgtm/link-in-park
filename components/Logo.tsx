/* eslint-disable @next/next/no-img-element */

/* The Link-in Park mark (public/logo.png, supplied by the user) and the
   wordmark. The image is black-on-white, so it sits in a rounded square. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <img src="/logo.png" alt="" width={size} height={size} aria-hidden="true"
      style={{ display: 'block', borderRadius: Math.round(size * 0.28), background: '#000' }} />
  );
}

export default function Logo({ size = 24, wordmark = true }: { size?: number; wordmark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <LogoMark size={size} />
      {wordmark && <span>Link<span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>-in</span> Park</span>}
    </span>
  );
}
