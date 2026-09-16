import Link from 'next/link';
import CreateFlow from '@/components/CreateFlow';
import { configured, env } from '@/lib/env';
import { listFolders } from '@/lib/folders';

export const maxDuration = 60;

export const dynamic = 'force-dynamic';

export default async function NewLinkPage({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const { folder = '' } = await searchParams;
  const folderRows = await listFolders();
  const folders = folderRows.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, path: f.path, depth: f.depth }));
  const initialFolderId = folders.some((f) => f.id === folder) ? folder : '';
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold">New link</h1>
      </div>
      {!configured.linkrunner && (
        <div className="alert alert-warn">Linkrunner is not connected, so nothing can be created yet. <Link className="underline" href="/setup">Setup</Link></div>
      )}
      <CreateFlow defaultBaseUrl={env.redirectBaseUrl} param={env.redirectParam} extraParams={env.redirectExtraParams} disabled={!configured.linkrunner} folders={folders} initialFolderId={initialFolderId} />
    </div>
  );
}
