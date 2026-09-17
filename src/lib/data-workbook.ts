// The one workbook the coordinator prepares: a Students sheet and a Judges sheet. The column lists below are the only
// place the columns are named. The importer reads them, the template is built from them, and "Download current data"
// writes them, so the three can never disagree. Everything here is pure (no database), so it can be tested; the upload
// itself is applied in data-upload.ts.
//
// Groups come from the Group column and advisers from the Adviser column: there is no Groups or Advisers sheet.
// Every row of one group must name the same adviser (and the same adviser email, when one is given), or that group is
// refused with a message naming it and the rows that disagree.

import ExcelJS from 'exceljs';
import { nameKey } from './seed';

export interface ColumnSpec {
  field: string;
  /** The heading in the template, in messages and in "Download current data". */
  header: string;
  /** Headings accepted for this column, compared ignoring spacing, punctuation and capitals. */
  aliases: string[];
  required: boolean;
  /** The value in the template's example row. Invented. */
  example: string;
  /** Said in the template's instructions. */
  note?: string;
}

export const STUDENTS_SHEET = 'Students';
export const JUDGES_SHEET = 'Judges';

export const STUDENT_COLUMNS: ColumnSpec[] = [
  { field: 'student_number', header: 'Student No.', aliases: ['studentno', 'studentnumber', 'studentid', 'idnumber'], required: true, example: '2027012345' },
  { field: 'surname', header: 'Surname', aliases: ['surname', 'lastname', 'familyname'], required: true, example: 'DELA CRUZ' },
  { field: 'first_name', header: 'First Name', aliases: ['firstname', 'givenname'], required: true, example: 'JUAN' },
  { field: 'middle_name', header: 'Middle Name', aliases: ['middlename'], required: false, example: 'SANTOS' },
  {
    field: 'section',
    header: 'Section',
    aliases: ['section'],
    required: false,
    example: 'Sec - 1',
    note: 'Judging never needs it, but without it the For Encoding grade sheet cannot be organised by section.',
  },
  { field: 'email', header: 'Email', aliases: ['email', 'studentemail', 'emailaddress', 'feuemail'], required: true, example: 'juan.delacruz@example.edu.ph' },
  { field: 'group', header: 'Group', aliases: ['group', 'groupname', 'businessname'], required: true, example: 'SAMPLE GROUP' },
  { field: 'adviser', header: 'Adviser', aliases: ['adviser', 'advisername', 'advisor', 'advisorname'], required: true, example: 'SANTOS, MARIA' },
  {
    field: 'adviser_email',
    header: 'Adviser Email',
    aliases: ['adviseremail', 'advisoremail'],
    required: false,
    example: 'maria.santos@example.edu.ph',
    note: 'Where the adviser’s results email goes. An adviser with no email gets no email. To remove an adviser’s email, clear it in the Data table; emptying the cell here will not do it.',
  },
];

export const JUDGE_COLUMNS: ColumnSpec[] = [
  { field: 'name', header: 'Name', aliases: ['name', 'judge', 'judgename', 'fullname'], required: true, example: 'Dr. Liza Manalo' },
  { field: 'email', header: 'Email', aliases: ['email', 'emailaddress', 'judgeemail', 'login'], required: true, example: 'liza.manalo@example.com' },
  {
    field: 'password',
    header: 'Password',
    aliases: ['password'],
    required: false,
    example: '',
    note: 'Leave it empty and the app makes one for a new judge; an existing judge keeps theirs. A password typed here is used as it is.',
  },
];

export interface StudentValues {
  student_number: string;
  surname: string;
  first_name: string;
  middle_name: string;
  section: string;
  email: string;
  group: string;
  adviser: string;
  adviser_email: string;
}

export interface Line {
  /** The row number in Excel. */
  row: number;
  values: Record<string, string>;
}

export interface ParsedSheet {
  lines: Line[];
  /** The columns this sheet has. A column it lacks is left as it is in the app. */
  columns: Set<string>;
}

export interface ParsedWorkbook {
  students: ParsedSheet | null;
  judges: ParsedSheet | null;
  problems: string[];
}

export class ImportError extends Error {}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
const rowWord = (rows: number[]) => `row${rows.length === 1 ? '' : 's'} ${list(rows.map(String))}`;
export const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** The header row of a worksheet for these columns: the row, among the top 15, with the most known headings. */
function findHeader(ws: ExcelJS.Worksheet, columns: ColumnSpec[]) {
  let best: { row: number; map: Record<string, number> } | null = null;
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const map: Record<string, number> = {};
    ws.getRow(r).eachCell((cell, col) => {
      const h = norm(cell.text ?? '');
      for (const c of columns) if (!(c.field in map) && c.aliases.includes(h)) map[c.field] = col;
    });
    if (Object.keys(map).length > Object.keys(best?.map ?? {}).length) best = { row: r, map };
  }
  return best;
}

function readSheet(ws: ExcelJS.Worksheet, columns: ColumnSpec[], problems: string[]): ParsedSheet | { missing: string[] } {
  const header = findHeader(ws, columns);
  const missing = columns.filter((c) => c.required && !(header && c.field in header.map)).map((c) => c.header);
  if (!header || missing.length) return { missing };
  const lines: Line[] = [];
  for (let r = header.row + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: Record<string, string> = {};
    for (const c of columns) {
      const col = header.map[c.field];
      values[c.field] = col ? String(row.getCell(col).text ?? '').replace(/\s+/g, ' ').trim() : '';
    }
    if (Object.values(values).every((v) => !v)) continue;
    const blank = columns.filter((c) => c.required && !values[c.field]).map((c) => c.header);
    if (blank.length) {
      problems.push(`${ws.name} row ${r} has no ${list(blank)}, so it was skipped.`);
      continue;
    }
    lines.push({ row: r, values });
  }
  return { lines, columns: new Set(Object.keys(header.map)) };
}

/**
 * Reads the workbook. The Students and Judges sheets are found by their names, or failing that by their headings, so
 * a file with only one of the two is fine. Rows missing a required cell are skipped and said.
 */
export async function parseWorkbook(buffer: ArrayBuffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new ImportError('This does not look like an Excel .xlsx file. Open it in Excel, choose Save As → Excel Workbook (.xlsx), and upload that.');
  }
  const problems: string[] = [];
  const pick = (name: string, columns: ColumnSpec[], other: ColumnSpec[]) => {
    const named = wb.worksheets.find((ws) => norm(ws.name) === norm(name));
    if (named) {
      const read = readSheet(named, columns, problems);
      if ('missing' in read) throw new ImportError(`The ${name} sheet has no ${list(read.missing.map((m) => `“${m}”`))} column. Its columns are: ${columns.map((c) => c.header).join(', ')}.`);
      return read;
    }
    // No sheet by that name: a sheet with all the required headings will do, unless it is named as the other sheet or
    // fits the other sheet's headings better.
    const otherName = norm(name === STUDENTS_SHEET ? JUDGES_SHEET : STUDENTS_SHEET);
    for (const ws of wb.worksheets) {
      if (norm(ws.name) === otherName) continue;
      const hits = (cols: ColumnSpec[]) => {
        const h = findHeader(ws, cols);
        return h && cols.every((c) => !c.required || c.field in h.map) ? Object.keys(h.map).length : 0;
      };
      if (!hits(columns) || hits(other) > hits(columns)) continue;
      const read = readSheet(ws, columns, problems);
      if (!('missing' in read)) return read;
    }
    return null;
  };
  const students = pick(STUDENTS_SHEET, STUDENT_COLUMNS, JUDGE_COLUMNS);
  const judges = pick(JUDGES_SHEET, JUDGE_COLUMNS, STUDENT_COLUMNS);
  if (!students && !judges) {
    throw new ImportError(
      `This file has no Students sheet and no Judges sheet. Students needs the columns ${requiredList(STUDENT_COLUMNS)}; Judges needs ${requiredList(JUDGE_COLUMNS)}. ` +
        'Download the template to start from the right columns.',
    );
  }
  return { students, judges, problems };
}

const requiredList = (columns: ColumnSpec[]) => list(columns.filter((c) => c.required).map((c) => c.header));

// ── planning the students ─────────────────────────────────────────

export interface PlannedGroup {
  key: string;
  name: string;
  adviserKey: string;
}

export interface PlannedAdviser {
  key: string;
  name: string;
  /** The email to store, or null to leave the stored email as it is. */
  email: string | null;
}

export interface PlannedStudents {
  students: (StudentValues & { groupKey: string })[];
  groups: PlannedGroup[];
  advisers: PlannedAdviser[];
  problems: string[];
}

/**
 * Turns the Students sheet into students, groups and advisers. A student number twice: the later row is used. A group
 * whose rows name different advisers, or different adviser emails, is refused whole, naming the rows. An email that
 * is not an email skips that row.
 */
export function planStudents(sheet: ParsedSheet): PlannedStudents {
  const problems: string[] = [];
  const byNumber = new Map<string, Line>();
  for (const line of sheet.lines) {
    const num = line.values.student_number.replace(/\s+/g, '');
    const email = line.values.email;
    if (!looksLikeEmail(email)) {
      problems.push(`Students row ${line.row}: “${email}” is not an email address, so the row was skipped.`);
      continue;
    }
    const adviserEmail = line.values.adviser_email ?? '';
    if (adviserEmail && !looksLikeEmail(adviserEmail)) {
      problems.push(`Students row ${line.row}: the adviser email “${adviserEmail}” is not an email address, so the row was skipped.`);
      continue;
    }
    if (!nameKey(line.values.group)) {
      problems.push(`Students row ${line.row}: the group “${line.values.group}” needs at least one letter or number, so the row was skipped.`);
      continue;
    }
    if (!nameKey(line.values.adviser)) {
      problems.push(`Students row ${line.row}: the adviser “${line.values.adviser}” needs at least one letter or number, so the row was skipped.`);
      continue;
    }
    const earlier = byNumber.get(num);
    if (earlier) problems.push(`Student No. ${num} is on rows ${earlier.row} and ${line.row}; row ${line.row} was used.`);
    byNumber.set(num, { row: line.row, values: { ...line.values, student_number: num } });
  }

  const byGroup = new Map<string, Line[]>();
  for (const line of byNumber.values()) {
    const key = nameKey(line.values.group);
    byGroup.set(key, [...(byGroup.get(key) ?? []), line]);
  }

  /** How rows disagree about a value: "rows 4 and 5 say REYES, ANA; row 9 says CRUZ, BEN". */
  const disagreement = (lines: Line[], value: (l: Line) => string, key: (v: string) => string) => {
    const seen = new Map<string, { text: string; rows: number[] }>();
    for (const l of lines) {
      const v = value(l);
      if (!v) continue;
      const k = key(v);
      const entry = seen.get(k) ?? { text: v, rows: [] };
      entry.rows.push(l.row);
      seen.set(k, entry);
    }
    if (seen.size < 2) return null;
    return [...seen.values()].map((e) => `${rowWord(e.rows)} ${e.rows.length === 1 ? 'says' : 'say'} ${e.text}`).join('; ');
  };

  const groups: PlannedGroup[] = [];
  const students: PlannedStudents['students'] = [];
  const adviserEmails = new Map<string, { name: string; emails: Map<string, string> }>();
  for (const [key, lines] of byGroup) {
    lines.sort((a, b) => a.row - b.row);
    const name = lines[0].values.group;
    const advisers = disagreement(lines, (l) => l.values.adviser, nameKey);
    const emails = disagreement(lines, (l) => l.values.adviser_email ?? '', (v) => v.toLowerCase());
    if (advisers || emails) {
      const what = advisers ? `name different advisers (${advisers})` : `give different adviser emails (${emails})`;
      problems.push(
        `Group ${name} was not imported: its rows ${what}. A group has one adviser, so every row of ${name} must name the same one. Correct the rows and upload again; nothing else about ${name} changed.`,
      );
      continue;
    }
    const adviserKey = nameKey(lines[0].values.adviser);
    groups.push({ key, name, adviserKey });
    const adviser = adviserEmails.get(adviserKey) ?? { name: lines[0].values.adviser, emails: new Map<string, string>() };
    const email = lines.map((l) => l.values.adviser_email ?? '').find(Boolean);
    if (email) adviser.emails.set(email.toLowerCase(), email);
    adviserEmails.set(adviserKey, adviser);
    for (const l of lines) students.push({ ...(l.values as unknown as StudentValues), groupKey: key });
  }

  const advisers: PlannedAdviser[] = [];
  for (const [key, a] of adviserEmails) {
    if (a.emails.size > 1) {
      problems.push(`${a.name} is given different emails in different groups (${[...a.emails.values()].join(', ')}), so their email was not changed. Use one email for them on every row.`);
    }
    advisers.push({ key, name: a.name, email: a.emails.size === 1 ? [...a.emails.values()][0] : null });
  }
  return { students, groups, advisers, problems };
}

export interface PlannedJudge {
  name: string;
  email: string;
  password: string;
}

/** The Judges sheet, one judge per email (compared without capitals); an email twice uses the later row. */
export function planJudges(sheet: ParsedSheet): { judges: PlannedJudge[]; problems: string[] } {
  const problems: string[] = [];
  const byEmail = new Map<string, { row: number; judge: PlannedJudge }>();
  for (const line of sheet.lines) {
    const email = line.values.email.toLowerCase();
    const earlier = byEmail.get(email);
    if (earlier) problems.push(`The judge ${email} is on Judges rows ${earlier.row} and ${line.row}; row ${line.row} was used.`);
    // A password is used exactly as typed; only spaces Excel added around it are removed.
    byEmail.set(email, { row: line.row, judge: { name: line.values.name, email, password: line.values.password ?? '' } });
  }
  return { judges: [...byEmail.values()].map((v) => v.judge), problems };
}

// ── writing the workbook ──────────────────────────────────────────

export interface WorkbookData {
  students: StudentValues[];
  judges: PlannedJudge[];
}

/**
 * The workbook to fill in: with `data`, everything currently in the app (Download current data); without it, the
 * empty template with one invented example row per sheet. Passwords are never written: an empty Password leaves every
 * existing judge's password as it is when the file is uploaded again.
 */
export async function buildDataWorkbook(data?: WorkbookData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tambiz';
  const sheet = (name: string, columns: ColumnSpec[], rows: Record<string, string>[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = columns.map((c) => ({ header: c.header, width: Math.max(12, c.header.length + 4, c.example.length + 3) }));
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(columns.map((c) => r[c.field] ?? ''));
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };
  const example = (columns: ColumnSpec[]) => Object.fromEntries(columns.map((c) => [c.field, c.example]));
  sheet(STUDENTS_SHEET, STUDENT_COLUMNS, data ? (data.students as unknown as Record<string, string>[]) : [example(STUDENT_COLUMNS)]);
  sheet(JUDGES_SHEET, JUDGE_COLUMNS, data ? data.judges.map((j) => ({ name: j.name, email: j.email, password: '' })) : [example(JUDGE_COLUMNS)]);

  const help = wb.addWorksheet('How to fill this in');
  help.getColumn(1).width = 120;
  const describe = (name: string, columns: ColumnSpec[], one: string) => [
    `${name} sheet: one row per ${one}.`,
    `  Must be filled in on every row: ${columns.filter((c) => c.required).map((c) => c.header).join(', ')}.`,
    `  May be left empty: ${columns.filter((c) => !c.required).map((c) => c.header).join(', ')}.`,
    ...columns.filter((c) => c.note).map((c) => `  ${c.header}: ${c.note}`),
  ];
  [
    data ? 'This is everything in the app when it was downloaded. Change what you need and upload it again.' : 'The second row of each sheet is an invented example: type over it or delete it.',
    '',
    ...describe(STUDENTS_SHEET, STUDENT_COLUMNS, 'student'),
    '  Groups come from the Group column. Every row of one group must name the same adviser (and the same adviser email), or that group is not imported.',
    '  Group names are compared ignoring spacing, punctuation and capitals, so “Payong Palay” and “PAYONG PALAY” are the same group.',
    '',
    ...describe(JUDGES_SHEET, JUDGE_COLUMNS, 'judge'),
    '',
    'Uploading adds and updates, matched on Student No., judge Email and group name. It never removes anyone and never changes a score.',
    'To remove a student or a judge, do it in the app. Keep the headings as they are; their order does not matter and other columns are ignored.',
    'Save as Excel Workbook (.xlsx), then upload it on the Data tab.',
  ].forEach((line) => help.addRow([line]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
