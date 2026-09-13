import { redirect } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { currentAccount, signIn } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function login(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const res = await signIn(email, password);
  if (!res.ok) redirect(`/login?error=${encodeURIComponent(res.message)}&email=${encodeURIComponent(email)}`);
  redirect(res.account.role === 'admin' ? '/admin' : '/judge');
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string; signedout?: string }> }) {
  const sp = await searchParams;
  if (await currentAccount()) redirect('/');
  return (
    <>
      <AppBar subtitle="FEU Manila · MGT1114" />
      <main className="page narrow">
        <div className="login-hero">
          <h1>Tambiz</h1>
          <p>Judging, results and grades</p>
        </div>
        <Notice error={sp.error} ok={sp.signedout ? 'You are signed out.' : undefined} />
        <form action={login} className="card form">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="username" required defaultValue={sp.email ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn block" type="submit">
            Sign in
          </button>
        </form>
        <p className="note">Judges: use the email and password the coordinator gave you.</p>
        <p className="note">Students and advisers: open the personal link in your email.</p>
      </main>
    </>
  );
}
