// The email file handed over when the event closes: one row per recipient with Email, Name and Message, in an Excel
// table that Microsoft Power Automate's "List rows present in a table" reads. Students first, one row each; then
// advisers, one row each however many groups they hold. The app itself never sends email. Wording is in messages.ts.

import ExcelJS from 'exceljs';
import { adviserMessage, studentMessage } from './messages';
import { fullName, type EventReport } from './repo';
import { fmtPct, topTenPlacings } from './scoring';

export const EMAIL_TABLE = 'Emails';

export interface EmailRow {
  email: string;
  name: string;
  message: string;
}

export interface Recipients {
  students: EmailRow[];
  advisers: EmailRow[];
  /** Who gets no email, and why, for the Close screen. */
  nobody: string[];
}

export interface AdviserContact {
  id: string;
  name: string;
  email: string;
}

/** The rows of the email file for an event, from the same report as the workbook, so the two always agree. */
export function emailRecipients(report: EventReport, advisers: AdviserContact[]): Recipients {
  const { event } = report;
  const nobody: string[] = [];
  const students: EmailRow[] = [];
  const grades = [...report.grades].sort((a, b) => a.student.surname.localeCompare(b.student.surname) || a.student.first_name.localeCompare(b.student.first_name));
  for (const g of grades) {
    const name = fullName(g.student);
    if (!g.letter || g.overall === null) {
      nobody.push(`${name} (${g.group.name}) has no grade yet, so gets no email.`);
      continue;
    }
    students.push({
      email: g.student.email,
      name,
      message: studentMessage({ firstName: g.student.first_name, eventTitle: event.title, groupName: g.group.name, letter: g.letter, groupPercent: fmtPct(g.overall) }),
    });
  }

  const rows: EmailRow[] = [];
  for (const a of [...advisers].sort((x, y) => x.name.localeCompare(y.name))) {
    const groups = report.groups.filter((g) => g.adviser_id === a.id);
    if (!groups.length) continue;
    if (!a.email.trim()) {
      nobody.push(`${a.name}, adviser of ${groups.map((g) => g.name).join(', ')}, has no email, so gets no email. Add an Adviser Email on the Data tab.`);
      continue;
    }
    rows.push({
      email: a.email.trim(),
      name: a.name,
      message: adviserMessage({
        adviserName: a.name,
        eventTitle: event.title,
        groups: groups.map((g) => {
          const r = report.resultById.get(g.id);
          return { name: g.name, percent: r?.overall == null ? null : fmtPct(r.overall), topTen: r ? topTenPlacings(r) : [] };
        }),
      }),
    });
  }
  return { students, advisers: rows, nobody };
}

export async function buildEmailFile(recipients: Recipients, eventTitle: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tambiz';
  wb.created = new Date();
  const all = [...recipients.students, ...recipients.advisers];

  const ws = wb.addWorksheet(EMAIL_TABLE);
  ws.addTable({
    name: EMAIL_TABLE,
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium7', showRowStripes: true },
    columns: [{ name: 'Email' }, { name: 'Name' }, { name: 'Message' }],
    // Excel refuses a table with no data rows, so an empty file still gets one blank row.
    rows: all.length ? all.map((r) => [r.email, r.name, r.message]) : [['', '', '']],
  });
  ws.columns = [{ width: 36 }, { width: 32 }, { width: 100 }];

  const help = wb.addWorksheet('Read me');
  help.columns = [{ width: 120 }];
  [
    `${eventTitle}: email file`,
    `${recipients.students.length} student${recipients.students.length === 1 ? '' : 's'} and ${recipients.advisers.length} adviser${recipients.advisers.length === 1 ? '' : 's'}, one per row, in the Excel table named “${EMAIL_TABLE}” on the first sheet. Students come first, then advisers.`,
    'Each Message is the whole email, written in HTML. A student’s gives their letter grade and their group’s percentage; an adviser’s lists their groups.',
    '',
    'Sending with Microsoft Power Automate:',
    '1. Save this file to OneDrive or SharePoint.',
    `2. Add the Excel Online (Business) action “List rows present in a table”, choose this file, and choose the table “${EMAIL_TABLE}”.`,
    '3. In that action’s Settings, turn Pagination on and set the threshold to 1000. Without it, only the first 256 rows are read.',
    '4. Add “Apply to each” over the rows, with an Outlook “Send an email (V2)” action: To is Email, Body is Message, and type your own Subject.',
    '   The Body box of “Send an email (V2)” sends HTML as it is, so the message arrives formatted.',
    '5. Send it to yourself first: put your own address in To, run the flow on a copy of this file with one row, and read the email.',
    '',
    'Keep this file private: it holds every student’s grade.',
  ].forEach((text, i) => {
    const row = help.addRow([text]);
    if (i === 0) row.getCell(1).font = { bold: true, size: 14 };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
