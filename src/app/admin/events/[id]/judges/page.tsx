import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AppBar, Notice } from '@/components/AppBar';
import { EventHeader } from '@/components/EventNav';
import { requireAdmin } from '@/lib/auth';
import { eventJudges, getEvent } from '@/lib/repo';
import { createJudge, removeJudge, resetJudgePassword } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function JudgesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const acc = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const event = await getEvent(id);
  if (!event) notFound();
  const judges = await eventJudges(id);
  let flash: { email: string; password: string } | null = null;
  try {
    const raw = (await cookies()).get('tambiz_flash')?.value;
    flash = raw ? JSON.parse(raw) : null;
  } catch {
    flash = null;
  }

  return (
    <>
      <AppBar subtitle="Coordinator" account={acc} home="/admin" />
      <main className="page">
        <EventHeader event={event} tab="judges" title="Judges" />
        <Notice ok={sp.ok} error={sp.error} />
        {flash && sp.ok ? (
          <div className="notice warn">
            <b>Write this down now.</b> It is shown only for the next two minutes.
            <div style={{ marginTop: 6 }}>
              Sign in at this site with <span className="secret">{flash.email}</span> and password <span className="secret">{flash.password}</span>
            </div>
          </div>
        ) : null}

        <ul className="list">
          {judges.map((j) => (
            <li key={j.id} style={{ flexWrap: 'wrap' }}>
              <span className="grow-1" style={{ minWidth: 180 }}>
                <span className="title">{j.display_name}</span>
                <span className="sub" style={{ display: 'block', overflowWrap: 'anywhere' }}>
                  {j.email}
                </span>
              </span>
              <form action={resetJudgePassword}>
                <input type="hidden" name="eventId" value={id} />
                <input type="hidden" name="accountId" value={j.id} />
                <button className="btn small secondary" type="submit">
                  Reset password
                </button>
              </form>
              <form action={removeJudge}>
                <input type="hidden" name="eventId" value={id} />
                <input type="hidden" name="accountId" value={j.id} />
                <button className="btn small danger" type="submit">
                  Remove
                </button>
              </form>
            </li>
          ))}
          {!judges.length ? <li className="sub">No judges yet.</li> : null}
        </ul>

        <div className="section-title">Add a judge</div>
        <form action={createJudge} className="card form">
          <input type="hidden" name="eventId" value={id} />
          <div className="row2">
            <div className="field">
              <label htmlFor="name">Name as judges see it</label>
              <input className="input" id="name" name="name" placeholder="Dr. Liza Manalo" required />
            </div>
            <div className="field">
              <label htmlFor="email">Email or short login</label>
              <input className="input" id="email" name="email" placeholder="lmanalo@feu.edu.ph" autoCapitalize="none" required />
            </div>
          </div>
          <span className="sub">The app makes a temporary password and shows it once. Judges can change it under Account.</span>
          <button className="btn" type="submit">
            Create judge account
          </button>
        </form>
      </main>
    </>
  );
}
