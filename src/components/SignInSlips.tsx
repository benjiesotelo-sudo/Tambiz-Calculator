'use client';

// Judges' sign-in details, shown once, laid out to print on one page and hand out at the briefing. The passwords exist
// only here: the app keeps a fingerprint of each, never the password, so they cannot be shown again. A lost slip is
// replaced with Reset password on the Judges tab.

export interface SignInSlip {
  name: string;
  login: string;
  password: string;
}

export function SignInSlips({ slips, eventTitle, onDone }: { slips: SignInSlip[]; eventTitle: string; onDone?: () => void }) {
  if (!slips.length) return null;
  const print = () => {
    document.body.classList.add('printing-slips');
    const done = () => {
      document.body.classList.remove('printing-slips');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };
  const sorted = [...slips].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="notice warn slips-panel" role="alert">
      <p style={{ marginTop: 0 }}>
        <b>Print or write these down now.</b> {sorted.length === 1 ? 'This password is' : `These ${sorted.length} passwords are`} shown only here, once. The app keeps no copy it
        can show again; if a slip is lost, use <b>Reset password</b> on the Judges tab.
      </p>
      <div className="slips">
        <h2 className="slips-title">{eventTitle}: judges’ sign-in</h2>
        <p className="slips-sub">Open the Tambiz app on your phone and sign in with your email and password.</p>
        <table className="slips-table">
          <thead>
            <tr>
              <th>Judge</th>
              <th>Email</th>
              <th>Password</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.login}>
                <td>{s.name}</td>
                <td>{s.login}</td>
                <td className="secret">{s.password}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button className="btn small" type="button" onClick={print}>
          Print this list
        </button>
        {onDone ? (
          <button className="btn small secondary" type="button" onClick={onDone}>
            I have printed or written them down
          </button>
        ) : null}
      </div>
    </div>
  );
}
