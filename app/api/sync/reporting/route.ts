import { NextResponse, type NextRequest } from 'next/server';
import { invalidateAnalyticsCache } from '@/lib/analytics';
import { importFromLinkrunner, syncReportingPage } from '@/lib/campaigns';
import { configured, env } from '@/lib/env';

export const maxDuration = 60;

/* For schedulers. One call = (optionally) import the campaign list, then
   fetch one Reporting page. Safe to call every minute; the sync refuses to
   exceed Linkrunner's limit on its own.

     GET /api/sync/reporting?secret=<SYNC_SECRET>[&import=1]  */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret') || req.headers.get('x-sync-secret') || '';
  if (!env.syncSecret || secret !== env.syncSecret) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  if (!configured.linkrunner) return NextResponse.json({ error: 'Linkrunner not configured' }, { status: 503 });

  const out: Record<string, unknown> = {};
  if (req.nextUrl.searchParams.get('import') === '1') out.import = await importFromLinkrunner();
  out.reporting = await syncReportingPage();
  invalidateAnalyticsCache();
  return NextResponse.json(out);
}
