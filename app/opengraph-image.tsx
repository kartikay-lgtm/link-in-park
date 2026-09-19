import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

/* The card WhatsApp, Slack, iMessage and the rest show when the link is
   shared: the site's own look - peach-to-sky gradient, frosted shell, logo,
   name, tagline. Served at /opengraph-image; Next wires the meta tags. */
export const alt = 'Link-in Park — Eat. Sleep. Growth. Repeat.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const dynamic = 'force-static';

export default async function Image() {
  const [logo, bold, medium] = await Promise.all([
    readFile(path.join(process.cwd(), 'public', 'logo.png')).then((b) => `data:image/png;base64,${b.toString('base64')}`).catch(() => null),
    readFile(path.join(process.cwd(), 'assets', 'fonts', 'Montserrat-Bold.ttf')).catch(() => null),
    readFile(path.join(process.cwd(), 'assets', 'fonts', 'Montserrat-Medium.ttf')).catch(() => null),
  ]);
  const fonts = [
    ...(bold ? [{ name: 'Montserrat', data: new Uint8Array(bold).buffer as ArrayBuffer, weight: 700 as const, style: 'normal' as const }] : []),
    ...(medium ? [{ name: 'Montserrat', data: new Uint8Array(medium).buffer as ArrayBuffer, weight: 500 as const, style: 'normal' as const }] : []),
  ];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(118deg, #f9d9bd 0%, #f2e5dc 22%, #e9eef5 48%, #d6e3f5 74%, #bcd3f3 100%)', fontFamily: 'Montserrat, sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 1060, height: 490, borderRadius: 40, background: 'rgba(255,255,255,0.72)', border: '2px solid rgba(255,255,255,0.9)', boxShadow: '0 30px 80px rgba(23,25,28,0.12)' }}>
          {logo ? <img src={logo} width={128} height={128} style={{ borderRadius: 32 }} alt="" /> : <div style={{ width: 128, height: 128, borderRadius: 32, background: '#17191c' }} />}
          <div style={{ display: 'flex', marginTop: 34, fontSize: 72, fontWeight: 700, color: '#17191c', letterSpacing: -2 }}>
            <span>Link</span><span style={{ color: '#9aa1ab', fontWeight: 500 }}>-in</span><span style={{ marginLeft: 18 }}>Park</span>
          </div>
          <div style={{ display: 'flex', marginTop: 16, fontSize: 30, fontWeight: 500, color: '#5f6570', letterSpacing: 2 }}>Eat. Sleep. Growth. Repeat.</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
