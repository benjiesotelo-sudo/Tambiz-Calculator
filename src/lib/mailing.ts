// The mailing sheet (decision 11): one row per student or adviser with their personal link, as a named Excel table,
// so Microsoft Power Automate's "List rows present in a table" can read it. The app itself never sends email.

import ExcelJS from 'exceljs';

export const MAILING_TABLE = 'Mailing';

export interface MailingRow {
  name: string;
  email: string;
  link: string;
  role: 'Student' | 'Adviser';
}

export async function buildMailingSheet(rows: MailingRow[], eventTitle: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tambiz';
  wb.created = new Date();

  const ws = wb.addWorksheet(MAILING_TABLE);
  ws.addTable({
    name: MAILING_TABLE,
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium7', showRowStripes: true },
    columns: [{ name: 'Name' }, { name: 'Email' }, { name: 'Link' }, { name: 'Role' }],
    // Excel refuses a table with no data rows, so an empty sheet still gets one blank row.
    rows: rows.length ? rows.map((r) => [r.name, r.email, r.link, r.role]) : [['', '', '', '']],
  });
  ws.columns = [{ width: 32 }, { width: 36 }, { width: 70 }, { width: 10 }];

  const help = wb.addWorksheet('Read me');
  help.columns = [{ width: 110 }];
  [
    `${eventTitle}: mailing sheet`,
    `${rows.length} personal link${rows.length === 1 ? '' : 's'}, one per row, in the Excel table named “${MAILING_TABLE}” on the first sheet.`,
    '',
    'Sending with Microsoft Power Automate:',
    '1. Save this file to OneDrive or SharePoint.',
    `2. Add the Excel Online (Business) action “List rows present in a table”, choose this file, and choose the table “${MAILING_TABLE}”.`,
    '3. In that action’s Settings, turn Pagination on and set the threshold to 1000. Without it, only the first 256 rows are read.',
    '4. Add “Apply to each” over the rows, with an Outlook “Send an email (V2)” action using the Email, Name and Link columns.',
    '5. Say in the email what the page will ask for: a student types their student number; an adviser types the code you gave them.',
    '   Never put the student number or the adviser code in the email itself.',
    '',
    'Keep this file private: each link is personal. The links cannot be shown again. If this file is lost, reissue the links from the Release tab.',
    'Links stay open for 30 days from when they were issued. Opening a link does not use it up; five wrong tries lock it until you unlock or reissue it.',
  ].forEach((text, i) => {
    const row = help.addRow([text]);
    if (i === 0) row.getCell(1).font = { bold: true, size: 14 };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
