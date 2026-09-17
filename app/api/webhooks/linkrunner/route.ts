import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getDb, schema } from '@/lib/db';
import { env } from '@/lib/env';
import { resolveCampaign } from '@/lib/live';

/* Linkrunner posts here on every install and sign-up (Settings → Data
   Export → Webhooks in their dashboard). The `linkrunner-key` header must
   match our key. Everything is stored raw as well, so a payload shape we
   did not expect is never lost. */
function keyMatches(header: string | null): boolean {
  if (!env.linkrunnerKey || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(env.linkrunnerKey);
  return a.length === b.length && timingSafeEqual(a, b);
}

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export async function POST(request: NextRequest) {
  if (!keyMatches(request.headers.get('linkrunner-key'))) return NextResponse.json({ error: 'bad key' }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: 'expected JSON' }, { status: 400 }); }

  // Payloads may nest the interesting bits under `data`; look in both.
  const d = (body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : body);
  const user = (d.user_data && typeof d.user_data === 'object' ? (d.user_data as Record<string, unknown>) : d);
  const typeHint = str(body.event || body.type || body.event_type || d.event || d.type || d.event_type).toLowerCase();
  const kind = /test/.test(typeHint) ? 'test'
    : /sign|conversion/.test(typeHint) ? 'signup'
    : /install/.test(typeHint) ? 'install'
    : str(user.user_id || user.id || user.name || user.phone) ? 'signup'
    : d.installed_at || d.attributed_on ? 'install'
    : 'unknown';
  const ref = str(d.campaign_id || d.campaign_display_id || d.display_id || (d.campaign && typeof d.campaign === 'object' ? (d.campaign as Record<string, unknown>).id : ''));
  const name = str(d.campaign_name || (d.campaign && typeof d.campaign === 'object' ? (d.campaign as Record<string, unknown>).name : ''));
  const displayId = kind === 'test' ? null : await resolveCampaign(ref, name);

  const db = await getDb();
  await db.insert(schema.lrEvents).values({
    kind, campaignRef: ref || null, campaignName: name || null, campaignDisplayId: displayId,
    userName: str(user.name) || null, phone: str(user.phone) || null, email: str(user.email) || null,
    raw: body,
  });
  return NextResponse.json({ ok: true, kind, campaign: displayId });
}

export async function GET() {
  return NextResponse.json({ ok: true, note: 'POST Linkrunner webhook events here' });
}
