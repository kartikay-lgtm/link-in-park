export default function LoginForm({ error = false }: { error?: boolean }) {
  return (
    <form method="post" action="/api/login" className="panel p-6 space-y-4 max-w-sm">
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" autoFocus required />
      </div>
      {error && <div className="alert alert-bad">That password is not right.</div>}
      <button className="btn btn-primary" type="submit">Sign in</button>
    </form>
  );
}
