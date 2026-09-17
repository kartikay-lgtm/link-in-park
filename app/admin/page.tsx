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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold">Admin</h1>
        <nav className="seg">
          <Link href="/admin" className="on" style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 7, fontSize: 13, fontWeight: 500 }}>Users</Link>
          <Link href="/admin/logs" style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>Activity log</Link>
          <Link href="/setup" style={{ display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 10px', borderRadius: 7, fontSize: 13, fontWeight: 500, color: 'var(--ink-2)' }}>Setup</Link>
        </nav>
      </div>
      <UsersAdmin users={users} meId={me.id} />
    </div>
  );
}
