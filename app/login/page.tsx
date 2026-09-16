import LoginForm from '@/components/LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="max-w-sm space-y-4">
      <h1 className="text-[22px] font-semibold">Sign in</h1>
      <LoginForm error={Boolean(error)} />
    </div>
  );
}
