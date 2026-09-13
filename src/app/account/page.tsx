import { redirect } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { requireAccount, signOut } from '@/lib/auth';
import { one, query } from '@/lib/db';
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from '@/lib/passwords';

export const dynamic = 'force-dynamic';

async function changePassword(formData: FormData) {
  'use server';
  const acc = await requireAccount();
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const again = String(formData.get('again') ?? '');
  const row = await one<{ password_hash: string }>('SELECT password_hash FROM account WHERE id = $1', [acc.id]);
  if (!row || !(await verifyPassword(current, row.password_hash))) redirect('/account?error=' + encodeURIComponent('Your current password is not right.'));
  if (next.length < MIN_PASSWORD_LENGTH) redirect('/account?error=' + encodeURIComponent(`Use at least ${MIN_PASSWORD_LENGTH} characters. A short phrase works well.`));
  if (next !== again) redirect('/account?error=' + encodeURIComponent('The two new passwords are different.'));
  await query('UPDATE account SET password_hash = $2 WHERE id = $1', [acc.id, await hashPassword(next)]);
  redirect('/account?ok=' + encodeURIComponent('Password changed.'));
}

async function logout() {
  'use server';
  await signOut();
  redirect('/login?signedout=1');
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAccount();
  const sp = await searchParams;
  return (
    <>
      <AppBar subtitle={acc.role === 'admin' ? 'Coordinator' : 'Judge scoring'} account={acc} />
      <main className="page narrow">
        <div className="crumbs">
          <a href="/">‹ Back</a>
        </div>
        <h1 className="page-title">My account</h1>
        <p className="lead">
          {acc.display_name} · {acc.email} · {acc.role === 'admin' ? 'Coordinator' : 'Judge'}
        </p>
        <Notice ok={sp.ok} error={sp.error} />
        <form action={changePassword} className="card form">
          <h3>Change password</h3>
          <div className="field">
            <label htmlFor="current">Current password</label>
            <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
          </div>
          <div className="field">
            <label htmlFor="next">New password</label>
            <input className="input" id="next" name="next" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
            <span className="sub">At least {MIN_PASSWORD_LENGTH} characters. A short phrase such as “judging tambiz this april” is ideal.</span>
          </div>
          <div className="field">
            <label htmlFor="again">New password again</label>
            <input className="input" id="again" name="again" type="password" autoComplete="new-password" required />
          </div>
          <button className="btn" type="submit">
            Change password
          </button>
        </form>
        <form action={logout} className="card">
          <button className="btn secondary block" type="submit">
            Sign out
          </button>
        </form>
      </main>
    </>
  );
}
