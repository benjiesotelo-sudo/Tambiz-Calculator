// Reading the registrar's class roll and the adviser list from Excel.
// Columns are found by their header text, in any order; extra columns are ignored.

import ExcelJS from 'exceljs';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

interface ColumnSpec {
  field: string;
  /** The header as it appears in the official file, used in error messages. */
  header: string;
  aliases: string[];
  required: boolean;
}

export const ROLL_COLUMNS: ColumnSpec[] = [
  { field: 'student_number', header: 'Student No.', aliases: ['studentno', 'studentnumber', 'studentid', 'idnumber'], required: true },
  { field: 'email', header: 'Student Email', aliases: ['studentemail', 'email', 'emailaddress', 'feuemail'], required: true },
  { field: 'surname', header: 'Surname', aliases: ['surname', 'lastname', 'familyname'], required: true },
  { field: 'first_name', header: 'First Name', aliases: ['firstname', 'givenname'], required: true },
  { field: 'section', header: 'Section', aliases: ['section'], required: true },
  { field: 'middle_name', header: 'Middle Name', aliases: ['middlename'], required: false },
  { field: 'sex', header: 'Sex', aliases: ['sex', 'gender'], required: false },
  { field: 'program_code', header: 'Program Code', aliases: ['programcode'], required: false },
  { field: 'course_code', header: 'Course Code', aliases: ['coursecode'], required: false },
  { field: 'faculty', header: 'Faculty', aliases: ['faculty'], required: false },
];

export const ADVISER_COLUMNS: ColumnSpec[] = [
  { field: 'name', header: 'Adviser', aliases: ['adviser', 'advisername', 'advisor', 'advisorname', 'name', 'facultyname'], required: true },
  { field: 'email', header: 'Email', aliases: ['email', 'adviseremail', 'advisoremail', 'emailaddress'], required: false },
  { field: 'group_code', header: 'Group Code', aliases: ['groupcode', 'code', 'groupno', 'groupnumber'], required: false },
  { field: 'group_name', header: 'Group Name', aliases: ['groupname', 'group', 'businessname'], required: false },
];

export interface ParsedSheet {
  rows: { rowNumber: number; sheet: string; values: Record<string, string> }[];
  problems: string[];
}

export class ImportError extends Error {}

export async function parseWorkbook(buffer: ArrayBuffer, columns: ColumnSpec[], fileLabel: string): Promise<ParsedSheet> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new ImportError(`This does not look like an Excel .xlsx file. Open it in Excel, choose Save As → Excel Workbook (.xlsx), and upload that.`);
  }
  const rows: ParsedSheet['rows'] = [];
  const problems: string[] = [];
  let bestMissing: string[] | null = null;
  let found = false;

  wb.eachSheet((ws) => {
    // The header row is the first of the top 15 rows that contains the most known column names.
    let headerRow = -1;
    let headerMap: Record<string, number> = {};
    let bestHits = 0;
    for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
      const map: Record<string, number> = {};
      ws.getRow(r).eachCell((cell, col) => {
        const h = norm(cell.text ?? '');
        for (const c of columns) if (!(c.field in map) && c.aliases.includes(h)) map[c.field] = col;
      });
      const hits = Object.keys(map).length;
      if (hits > bestHits) {
        bestHits = hits;
        headerRow = r;
        headerMap = map;
      }
    }
    if (headerRow < 0) return;
    const missing = columns.filter((c) => c.required && !(c.field in headerMap)).map((c) => c.header);
    if (missing.length) {
      if (!bestMissing || missing.length < bestMissing.length) bestMissing = missing;
      return;
    }
    found = true;
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const values: Record<string, string> = {};
      for (const c of columns) {
        const col = headerMap[c.field];
        values[c.field] = col ? String(row.getCell(col).text ?? '').trim() : '';
      }
      if (Object.values(values).every((v) => !v)) continue;
      const blank = columns.filter((c) => c.required && !values[c.field]).map((c) => c.header);
      if (blank.length) {
        problems.push(`Sheet “${ws.name}” row ${r}: no ${blank.join(', ')}. Row skipped.`);
        continue;
      }
      rows.push({ rowNumber: r, sheet: ws.name, values });
    }
  });

  if (!found) {
    const missing: string[] = bestMissing ?? columns.filter((c) => c.required).map((c) => c.header);
    throw new ImportError(
      `This file does not fit the ${fileLabel}. It has no ${missing.map((m) => `“${m}”`).join(', ')} column${missing.length === 1 ? '' : 's'}. ` +
        `The file needs these columns: ${columns.filter((c) => c.required).map((c) => c.header).join(', ')}.`,
    );
  }
  return { rows, problems };
}
