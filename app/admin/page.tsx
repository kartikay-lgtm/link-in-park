import Link from 'next/link';
import UsersAdmin from '@/components/UsersAdmin';
import { requireAdminPage } from '@/lib/admin-guard';
import { listUsers } from '@/lib/users';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const me = await requireAdminPage();
  const users = (await listUsers()).map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role as 'admin' | 'member', active: u.active, createdAt: u.createdAt.toISOString(), lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2 pb-2">
        <div><div className="text-[14px] muted mb-0.5">Users, access and activity</div><h1 className="text-[30px] font-semibold leading-tight" style={{ letterSpacing: '-0.02em' }}>Admin</h1></div>
        <nav className="seg">
          <Link href="/admin" className="on">Users</Link>
          <Link href="/admin/logs">Activity log</Link>
          <Link href="/setup">Setup</Link>
        </nav>
      </div>
      <UsersAdmin users={users} meId={me.id} />
    </div>
  );
}
