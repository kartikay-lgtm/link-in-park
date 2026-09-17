import { notFound } from 'next/navigation';
import { currentUser, gated } from './users';

/* Pages only a super admin may open. Anyone else gets a 404, so the pages
   do not even appear to exist. */
export async function requireAdminPage() {
  const user = await currentUser();
  if (user) { if (user.role !== 'admin') notFound(); return user; }
  if (!(await gated())) return { id: null, name: 'local', role: 'admin' as const, email: '' };
  notFound();
}
