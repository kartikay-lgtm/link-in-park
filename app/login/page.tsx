import LoginForm from '@/components/LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const { error, email } = await searchParams;
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 48px - 56px)' }}>
      <LoginForm error={Boolean(error)} email={email || ''} />
    </div>
  );
}
