import Link from 'next/link';
import CampaignDetail from '@/components/CampaignDetail';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function CampaignPage({ params }: { params: Promise<{ displayId: string }> }) {
  const { displayId } = await params;
  return (
    <div className="space-y-4">
      <Link href="/" className="btn btn-sm muted" style={{ marginLeft: -10 }}>← All campaigns</Link>
      <CampaignDetail displayId={decodeURIComponent(displayId)} />
    </div>
  );
}
