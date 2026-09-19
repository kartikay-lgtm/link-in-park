import LoginForm from '@/components/LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; login?: string }> }) {
  const { error, login } = await searchParams;
  return (
    <div className="flex items-center justify-center py-16">
      <LoginForm error={Boolean(error)} login={login || ''} />
    </div>
  );
}
