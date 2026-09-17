'use client';

import { useState } from 'react';
import Icon from './Icon';
import { LogoMark } from './Logo';

export default function LoginForm({ error = false, email = '' }: { error?: boolean; email?: string }) {
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <form method="post" action="/api/login" className="panel p-8 w-full max-w-[360px] space-y-6" onSubmit={() => setPending(true)}
      style={{ boxShadow: 'var(--shadow)' }}>
      <div className="flex flex-col items-center gap-3 text-center">
        <LogoMark size={44} />
        <div className="text-[20px] font-semibold tracking-tight">Link<span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>-in</span> Park</div>
      </div>
      <div className="space-y-3">
        <input name="email" type="email" className="input" style={{ height: 40 }} placeholder="Email" defaultValue={email} autoFocus={!email} required autoComplete="username" aria-label="Email" />
        <div className="relative">
          <input name="password" type={show ? 'text' : 'password'} className="input" style={{ height: 40, paddingRight: 40 }}
            placeholder="Password" autoFocus={Boolean(email)} required autoComplete="current-password" aria-label="Password" />
          <button type="button" className="btn btn-icon absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
            <Icon name={show ? 'eyeOff' : 'eye'} size={16} />
          </button>
        </div>
        {error && <div className="alert alert-bad text-[13px]">That email or password is not right.</div>}
        <button className="btn btn-primary w-full justify-center" style={{ height: 40 }} type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      </div>
    </form>
  );
}
