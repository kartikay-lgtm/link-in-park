'use client';

import { useState, useTransition } from 'react';
import { createUserAction, setUserActiveAction, setUserPasswordAction, setUserRoleAction } from '@/app/actions';
import CopyButton from './CopyButton';
import Icon from './Icon';

export type UserRow = { id: string; email: string; name: string; role: 'admin' | 'member'; active: boolean; createdAt: string; lastLoginAt: string | null };

function when(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).replace(',', '');
}

/* Create people, reset passwords, disable accounts, promote to super admin.
   A freshly set password is shown once, with a copy button - it is never
   shown again. */
export default function UsersAdmin({ users, meId }: { users: UserRow[]; meId: string | null }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'member' as 'admin' | 'member', password: '' });
  const [reveal, setReveal] = useState<{ id: string; email: string; password: string } | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  function create() {
    setError('');
    start(async () => {
      const r = await createUserAction(form);
      if (!r.ok) return setError(r.error);
      setReveal({ id: r.data.id, email: form.email.trim().toLowerCase(), password: r.data.password });
      setForm({ name: '', email: '', role: 'member', password: '' });
      setCreating(false);
    });
  }
  function resetPassword(u: UserRow) {
    setError('');
    start(async () => {
      const r = await setUserPasswordAction(u.id, resetPw || undefined);
      if (!r.ok) return setError(r.error);
      setReveal({ id: u.id, email: u.email, password: r.data.password });
      setResetFor(null); setResetPw('');
    });
  }
  function toggleActive(u: UserRow) {
    setError('');
    start(async () => { const r = await setUserActiveAction(u.id, !u.active); if (!r.ok) setError(r.error); });
  }
  function toggleRole(u: UserRow) {
    setError('');
    start(async () => { const r = await setUserRoleAction(u.id, u.role === 'admin' ? 'member' : 'admin'); if (!r.ok) setError(r.error); });
  }

  return (
    <div className="space-y-4">
      {error && <div className="alert alert-bad">{error}</div>}
      {reveal && (
        <div className="alert alert-ok flex flex-wrap items-center gap-3">
          <span>Password for <b>{reveal.email}</b>: <span className="mono font-semibold">{reveal.password}</span></span>
          <CopyButton text={`Link-in Park\nhttps://link-in-park-production.up.railway.app\nEmail: ${reveal.email}\nPassword: ${reveal.password}`} label="Copy sign-in details" />
          <span className="text-[12.5px] opacity-80">Shown once — send it to them now.</span>
          <button type="button" className="btn btn-icon ml-auto" onClick={() => setReveal(null)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="section-title">Users <span className="faint font-normal">{users.length}</span></div>
        {!creating && <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} />New user</button>}
      </div>

      {creating && (
        <div className="panel p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label" htmlFor="u-name">Name</label><input id="u-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
            <div><label className="label" htmlFor="u-email">Email</label><input id="u-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@grapevine.in" /></div>
            <div>
              <label className="label" htmlFor="u-role">Role</label>
              <select id="u-role" className="select w-full" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'member' })}>
                <option value="member">Member — creates and manages links</option>
                <option value="admin">Super admin — also manages users and sees the log</option>
              </select>
            </div>
            <div><label className="label" htmlFor="u-pw">Password <span className="faint font-normal">leave blank to generate one</span></label><input id="u-pw" className="input mono" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={create} disabled={pending || !form.name.trim() || !form.email.trim()}>{pending ? 'Creating…' : 'Create user'}</button>
            <button type="button" className="btn" onClick={() => { setCreating(false); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="panel overflow-x-auto">
        <table className="table table-tight">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={u.active ? undefined : { color: 'var(--ink-3)' }}>
                <td className="font-medium whitespace-nowrap">{u.name}{u.id === meId && <span className="faint text-xs ml-1.5">you</span>}</td>
                <td className="whitespace-nowrap">{u.email}</td>
                <td><span className={`badge ${u.role === 'admin' ? 'badge-accent' : 'badge-muted'}`}>{u.role === 'admin' ? 'Super admin' : 'Member'}</span></td>
                <td>{u.active ? <span className="badge badge-ok">Active</span> : <span className="badge badge-bad">Disabled</span>}</td>
                <td className="whitespace-nowrap muted text-[12.5px]">{when(u.lastLoginAt)}</td>
                <td className="whitespace-nowrap muted text-[12.5px]">{when(u.createdAt)}</td>
                <td>
                  <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                    {resetFor === u.id ? (
                      <span className="inline-flex items-center gap-1">
                        <input className="input mono" style={{ width: 200, height: 28 }} placeholder="New password (blank = generate)" value={resetPw} onChange={(e) => setResetPw(e.target.value)} autoFocus />
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => resetPassword(u)} disabled={pending}>Set</button>
                        <button type="button" className="btn btn-sm" onClick={() => { setResetFor(null); setResetPw(''); }}>Cancel</button>
                      </span>
                    ) : (
                      <>
                        <button type="button" className="btn btn-sm" onClick={() => setResetFor(u.id)}>Reset password</button>
                        <button type="button" className="btn btn-sm" onClick={() => toggleRole(u)} disabled={pending || u.id === meId} title={u.id === meId ? 'You cannot change your own role' : ''}>{u.role === 'admin' ? 'Make member' : 'Make super admin'}</button>
                        <button type="button" className={`btn btn-sm ${u.active ? 'btn-danger' : ''}`} onClick={() => toggleActive(u)} disabled={pending || u.id === meId} title={u.id === meId ? 'You cannot disable yourself' : ''}>{u.active ? 'Disable' : 'Enable'}</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
