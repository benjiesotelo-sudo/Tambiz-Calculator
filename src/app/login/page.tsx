import { redirect } from 'next/navigation';
import Image from 'next/image';
import { Notice } from '@/components/AppBar';
import { SubmitButton } from '@/components/SubmitButton';
import crest from '@/assets/brand/iabf-crest.png';
import seal from '@/assets/brand/feu-seal.webp';
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
    <main className="signin">
      <div className="signin-card">
        <div className="mark">
          <span className="goldrule" aria-hidden="true" />
          <h1>Tambiz</h1>
        </div>
        <p className="signin-sub">Business Plan 2 · IABF · FEU Manila</p>
        <Notice error={sp.error} ok={sp.signedout ? 'You are signed out.' : undefined} />
        <form action={login} className="form">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" autoComplete="username" required defaultValue={sp.email ?? ''} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <SubmitButton className="btn block" busy="Signing in…">
            Sign in
          </SubmitButton>
        </form>
        <p className="signin-help">Judges: use the email and password on the slip you were handed at the briefing.</p>
        <div className="crest">
          <Image src={seal} alt="Far Eastern University seal" height={32} />
          <Image src={crest} alt="Institute of Accounts, Business and Finance crest" height={32} />
          <small>
            Far Eastern University
            <br />
            Institute of Accounts, Business and Finance
          </small>
        </div>
      </div>
    </main>
  );
}
