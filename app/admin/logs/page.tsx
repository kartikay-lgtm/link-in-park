import Link from 'next/link';
import ActivityLog from '@/components/ActivityLog';
import { requireAdminPage } from '@/lib/admin-guard';
import { listActivity, listUsers } from '@/lib/users';

export const dynamic = 'force-dynamic';

export default async function LogsPage() {
  await requireAdminPage();
  const [rows, users] = await Promise.all([listActivity(2000), listUsers()]);
  const entries = rows.map((r) => ({ id: r.id, at: r.at.toISOString(), userName: r.userName, action: r.action, target: r.target, summary: r.summary, details: r.details || null }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2 pb-2">
        <div><div className="text-[14px] muted mb-0.5">Users, access and activity</div><h1 className="text-[30px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>Admin</h1></div>
        <nav className="seg">
          <Link href="/admin">Users</Link>
          <Link href="/admin/logs" className="on">Activity log</Link>
          <Link href="/setup">Setup</Link>
        </nav>
      </div>
      <ActivityLog entries={entries} people={users.map((u) => u.name)} />
    </div>
  );
}
