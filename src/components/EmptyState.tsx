// A list with nothing in it yet: what is missing, and the next thing to do about it.

const ICONS = {
  table: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M4 9h16" />
      <path d="M9 9v10" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  compass: (
    <>
      <path d="M12 3v18" />
      <path d="M4 12h16" />
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20h16" />
      <path d="M7 16v-5" />
      <path d="M12 16V7" />
      <path d="M17 16v-8" />
    </>
  ),
} as const;

export function EmptyState({ icon, title, children, action, flat }: { icon: keyof typeof ICONS; title: string; children: React.ReactNode; action?: React.ReactNode; flat?: boolean }) {
  return (
    <div className={`empty${flat ? ' flat' : ''}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {ICONS[icon]}
      </svg>
      <h3>{title}</h3>
      <p>{children}</p>
      {action ?? null}
    </div>
  );
}
