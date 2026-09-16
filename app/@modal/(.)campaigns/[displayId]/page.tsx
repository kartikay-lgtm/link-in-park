import CampaignDetail from '@/components/CampaignDetail';
import Modal from '@/components/Modal';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Intercepts /campaigns/<id> when reached from the list, so the campaign
   opens as a pop-up over the list. A direct visit renders the full page. */
export default async function CampaignModal({ params }: { params: Promise<{ displayId: string }> }) {
  const { displayId } = await params;
  const id = decodeURIComponent(displayId);
  return (
    <Modal fullHref={`/campaigns/${encodeURIComponent(id)}`}>
      <CampaignDetail displayId={id} inModal />
    </Modal>
  );
}
