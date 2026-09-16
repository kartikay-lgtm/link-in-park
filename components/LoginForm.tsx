'use client';

import { useActionState, useEffect } from 'react';
import { loginAction } from '@/app/actions';

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, null);
  useEffect(() => { if (state?.ok) window.location.assign('/'); }, [state]);
  return (
    <form action={action} className="panel p-6 space-y-4 max-w-sm">
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" autoFocus required />
      </div>
      {state?.error && <div className="alert alert-bad">{state.error}</div>}
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? 'Checking…' : 'Sign in'}</button>
    </form>
  );
}
