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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold">Admin</h1>
        <nav className="seg">
          <Link href="/admin" style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>Users</Link>
          <Link href="/admin/logs" className="on" style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 7, fontSize: 13, fontWeight: 500 }}>Activity log</Link>
          <Link href="/setup" style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>Setup</Link>
        </nav>
      </div>
      <ActivityLog entries={entries} people={users.map((u) => u.name)} />
    </div>
  );
}
