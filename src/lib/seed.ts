// Sample data so the app can be opened and presented straight after it deploys.
// Every business, person, student number and email here is invented. Runs only when there are no accounts.

import { DEFAULT_RUBRIC, criteriaOf, type Half } from './rubric';
import { hashPassword, verifyPassword } from './passwords';
import type { Row, Statement } from './db';

type Db = { query: (text: string, params?: unknown[]) => Promise<Row[]>; transaction: (s: Statement[]) => Promise<void> };

export const DEMO_PASSWORD = 'tambiz-demo-2027';
export const DEMO_ADMIN_EMAIL = 'admin@tambiz.demo';

export const nameKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

let counter = 0;
const id = (p: string) => `${p}-${(++counter).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function insertMany(table: string, cols: string[], rows: unknown[][]): Statement[] {
  const out: Statement[] = [];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const params: unknown[] = [];
    const values = chunk.map((r) => `(${r.map((v) => (params.push(v), `$${params.length}`)).join(', ')})`);
    out.push({ text: `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${values.join(', ')}`, params });
  }
  return out;
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const SURNAMES = ['Dela Cruz', 'Santos', 'Reyes', 'Garcia', 'Mendoza', 'Bautista', 'Villanueva', 'Ramos', 'Aquino', 'Navarro', 'Castillo', 'Torres', 'Flores', 'Rivera', 'Gonzales', 'Lopez', 'Pascual', 'Manalo', 'Soriano', 'Salazar', 'Domingo', 'Mercado', 'Aguilar', 'Valdez', 'Ocampo', 'Tolentino', 'Cabrera', 'Galang', 'Samonte', 'Lacson'];
const FIRST = ['Andrea', 'Miguel', 'Bea', 'Joshua', 'Kristine', 'Paolo', 'Nicole', 'Carlo', 'Patricia', 'Rafael', 'Angelica', 'Mark', 'Jasmine', 'Gabriel', 'Camille', 'Joaquin', 'Denise', 'Enzo', 'Trisha', 'Luis', 'Bianca', 'Nathan', 'Sofia', 'Adrian', 'Maxine', 'Ivan', 'Alyssa', 'Kyle', 'Janelle', 'Marco'];
const MIDDLE = ['Cruz', 'Lim', 'Tan', 'Uy', 'Sy', 'Ong', 'Chua', 'Go', 'Yu', 'Co'];

const GROUPS: [string, string, number, number][] = [
  // name, section, adviser index, quality (0-1)
  ['Kape Kultura', 'BA-3A', 0, 0.91],
  ['Banig & Co.', 'BA-3A', 0, 0.86],
  ['Sari-Sari Smart', 'BA-3B', 1, 0.83],
  ['Halo-Halo Hub', 'BA-3B', 1, 0.78],
  ['Bayong Bags', 'BA-3C', 2, 0.88],
  ['Kalamansi Glow', 'BA-3C', 2, 0.74],
  ['Pandesal Plus', 'BA-3D', 3, 0.81],
  ['Abaca Threads', 'BA-3D', 3, 0.69],
];
const ADVISERS = ['Prof. Maria Lourdes Santos', 'Prof. Ramon Villareal', 'Prof. Teresita Uy', 'Prof. Danilo Ocampo'];
/** Sample adviser codes, typed to open an adviser's private link. */
const ADVISER_CODES = ['K7Q-4MP', 'R3V-8XD', 'T9U-2HW', 'D5C-6NA'];
const JUDGES = [
  ['judge1@tambiz.demo', 'Dr. Liza Manalo'],
  ['judge2@tambiz.demo', 'Mr. Paolo Dizon'],
  ['judge3@tambiz.demo', 'Ms. Carmela Yap'],
];

/** Which judge scored what: [judge index, half, group indexes complete, group index partly done or -1]. */
const PLAN: [number, Half, number[], number][] = [
  [0, 'defense', [0, 1, 2, 3, 4], 5],
  [1, 'defense', [0, 1, 2, 4], 3],
  [2, 'booth', [0, 1, 2, 3, 4, 5], 6],
  [0, 'booth', [0, 2, 4], -1],
  [1, 'booth', [1, 3], -1],
];

/**
 * Keeps the sample accounts' stored passwords in step with SEED_ADMIN_PASSWORD and SEED_JUDGE_PASSWORD.
 * Runs on every server start. While a variable is set, it wins: a differing stored password is replaced,
 * lockouts are cleared and that account is signed out everywhere. Accounts created in the app are never touched.
 * Returns the emails whose password was changed.
 */
export async function syncSeedPasswords(db: Db): Promise<string[]> {
  const wanted = new Map<string, string>();
  if (process.env.SEED_ADMIN_PASSWORD) wanted.set(DEMO_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  if (process.env.SEED_JUDGE_PASSWORD) for (const [email] of JUDGES) wanted.set(email, process.env.SEED_JUDGE_PASSWORD);
  if (!wanted.size) return [];

  const rows = await db.query('SELECT id, email, password_hash FROM account WHERE lower(email) = ANY($1::text[])', [[...wanted.keys()]]);
  const updates = (
    await Promise.all(
      rows.map(async (r) => {
        const password = wanted.get(String(r.email).toLowerCase())!;
        if (await verifyPassword(password, String(r.password_hash))) return null;
        return { id: String(r.id), email: String(r.email), hash: await hashPassword(password) };
      }),
    )
  ).filter((u): u is { id: string; email: string; hash: string } => u !== null);

  if (updates.length) {
    await db.transaction(
      updates.flatMap((u) => [
        { text: 'UPDATE account SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1', params: [u.id, u.hash] },
        { text: 'DELETE FROM session WHERE account_id = $1', params: [u.id] },
      ]),
    );
  }
  return updates.map((u) => u.email);
}

export async function seedIfEmpty(db: Db) {
  const existing = await db.query('SELECT count(*)::int AS n FROM account');
  if (Number(existing[0]?.n) > 0) return;

  const adminHash = await hashPassword(process.env.SEED_ADMIN_PASSWORD || DEMO_PASSWORD);
  const judgeHash = await hashPassword(process.env.SEED_JUDGE_PASSWORD || DEMO_PASSWORD);
  const rand = rng(2027);
  const s: Statement[] = [];

  const adminId = id('acc');
  const judgeIds = JUDGES.map(() => id('acc'));
  s.push(
    ...insertMany('account', ['id', 'email', 'display_name', 'role', 'password_hash'], [
      [adminId, DEMO_ADMIN_EMAIL, 'Tambiz Coordinator', 'admin', adminHash],
      ...JUDGES.map(([email, name], i) => [judgeIds[i], email, name, 'judge', judgeHash]),
    ]),
  );

  const eventId = id('evt');
  s.push({ text: `INSERT INTO event (id, year, title, status, rubric) VALUES ($1, 2027, 'Tambiz 2027', 'judging', $2::jsonb)`, params: [eventId, JSON.stringify(DEFAULT_RUBRIC)] });
  s.push(...insertMany('event_judge', ['event_id', 'account_id'], judgeIds.map((j) => [eventId, j])));

  const adviserIds = ADVISERS.map(() => id('adv'));
  s.push(
    ...insertMany(
      'adviser',
      ['id', 'event_id', 'name', 'name_key', 'email', 'link_code'],
      ADVISERS.map((n, i) => [adviserIds[i], eventId, n, nameKey(n), `adviser${i + 1}@tambiz.demo`, ADVISER_CODES[i]]),
    ),
  );

  // Class roll: 6 students per group, plus 3 not yet in any group so the roster check has something to show.
  const students: { id: string; section: string; group: number }[] = [];
  const studentRows: unknown[][] = [];
  let n = 0;
  const addStudent = (section: string, group: number) => {
    const sid = id('stu');
    const surname = SURNAMES[(n * 7) % SURNAMES.length];
    const first = FIRST[(n * 11) % FIRST.length];
    const num = `2023${(10457 + n * 37).toString().padStart(6, '0')}`;
    // The email must not contain the student number, which is what a student types to open their private link.
    const email = `${first}.${surname}.${n + 1}@tambiz.demo`.toLowerCase().replace(/\s+/g, '');
    studentRows.push([sid, eventId, num, email, surname, first, MIDDLE[n % MIDDLE.length], section, n % 2 ? 'M' : 'F', 'BSBA-MM', 'MGT1114']);
    students.push({ id: sid, section, group });
    n++;
  };
  GROUPS.forEach(([, section], gi) => {
    const size = 5 + (gi % 3);
    for (let k = 0; k < size; k++) addStudent(section, gi);
  });
  addStudent('BA-3A', -1);
  addStudent('BA-3C', -1);
  addStudent('BA-3D', -1);
  s.push(...insertMany('student', ['id', 'event_id', 'student_number', 'email', 'surname', 'first_name', 'middle_name', 'section', 'sex', 'program_code', 'course_code'], studentRows));

  const groupIds = GROUPS.map(() => id('grp'));
  s.push(
    ...insertMany(
      'tgroup',
      ['id', 'event_id', 'name', 'name_key', 'section', 'adviser_id'],
      GROUPS.map(([name, section, adv], gi) => [groupIds[gi], eventId, name, nameKey(name), section, adviserIds[adv]]),
    ),
  );
  s.push(...insertMany('group_member', ['event_id', 'group_id', 'student_id'], students.filter((x) => x.group >= 0).map((x) => [eventId, groupIds[x.group], x.id])));

  const sheetRows: unknown[][] = [];
  const valueRows: unknown[][] = [];
  const memberRows: unknown[][] = [];
  const score = (max: number, q: number, step: number) => {
    const raw = max * Math.min(1, Math.max(0.35, q + (rand() - 0.5) * 0.18));
    return Math.min(max, Math.round(raw / step) * step);
  };
  for (const [ji, half, complete, partial] of PLAN) {
    const targets = [...complete.map((g) => [g, true] as const), ...(partial >= 0 ? [[partial, false] as const] : [])];
    for (const [gi, done] of targets) {
      const sheetId = id('sht');
      sheetRows.push([sheetId, eventId, groupIds[gi], half, judgeIds[ji], done ? 'complete' : 'in_progress', done ? new Date().toISOString() : null]);
      const q = GROUPS[gi][3] + (ji - 1) * 0.02;
      const crits = criteriaOf(DEFAULT_RUBRIC, half);
      crits.forEach((c, ci) => {
        if (!done && ci >= Math.floor(crits.length * 0.55)) return;
        valueRows.push([sheetId, c.key, score(c.max, q, 1)]);
      });
      if (half === 'defense') {
        const members = students.filter((x) => x.group === gi);
        members.forEach((m, mi) => {
          if (!done && mi >= 2) return;
          const mq = q + ((mi % 3) - 1) * 0.04;
          DEFAULT_RUBRIC.memberFields.forEach((f) => memberRows.push([sheetId, m.id, f.key, score(f.max, mq, 0.5)]));
        });
      }
    }
  }
  s.push(...insertMany('score_sheet', ['id', 'event_id', 'group_id', 'half', 'judge_id', 'status', 'completed_at'], sheetRows));
  s.push(...insertMany('score_value', ['sheet_id', 'criterion_key', 'value'], valueRows));
  s.push(...insertMany('member_score', ['sheet_id', 'student_id', 'field', 'value'], memberRows));

  try {
    await db.transaction(s);
  } catch (e) {
    // Another server instance seeded at the same moment; its data stands.
    const again = await db.query('SELECT count(*)::int AS n FROM account');
    if (Number(again[0]?.n) === 0) throw e;
  }
}
