// Reading the registrar's class roll and the adviser list from Excel.
// Columns are found by their header text, in any order; extra columns are ignored.

import ExcelJS from 'exceljs';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface ColumnSpec {
  field: string;
  /** The header as it appears in the official file, used in error messages and in the download template. */
  header: string;
  aliases: string[];
  required: boolean;
  /** The value in the download template's example row. Invented. */
  example: string;
  /** Recognised in a file only so the import can say it is no longer used; never in the download template. */
  ignored?: true;
}

export const ROLL_COLUMNS: ColumnSpec[] = [
  { field: 'student_number', header: 'Student No.', aliases: ['studentno', 'studentnumber', 'studentid', 'idnumber'], required: true, example: '2027012345' },
  { field: 'email', header: 'Student Email', aliases: ['studentemail', 'email', 'emailaddress', 'feuemail'], required: true, example: 'juan.delacruz@feu.edu.ph' },
  { field: 'surname', header: 'Surname', aliases: ['surname', 'lastname', 'familyname'], required: true, example: 'Dela Cruz' },
  { field: 'first_name', header: 'First Name', aliases: ['firstname', 'givenname'], required: true, example: 'Juan' },
  { field: 'section', header: 'Section', aliases: ['section'], required: true, example: 'BA-3A' },
  { field: 'middle_name', header: 'Middle Name', aliases: ['middlename'], required: false, example: 'Santos' },
  { field: 'sex', header: 'Sex', aliases: ['sex', 'gender'], required: false, example: 'M' },
  { field: 'program_code', header: 'Program Code', aliases: ['programcode'], required: false, example: 'BSBA-MM' },
  { field: 'course_code', header: 'Course Code', aliases: ['coursecode'], required: false, example: 'MGT1114' },
  { field: 'faculty', header: 'Faculty', aliases: ['faculty'], required: false, example: 'IABF' },
];

export const ADVISER_COLUMNS: ColumnSpec[] = [
  { field: 'name', header: 'Adviser', aliases: ['adviser', 'advisername', 'advisor', 'advisorname', 'name', 'facultyname'], required: true, example: 'Prof. Maria Santos' },
  { field: 'email', header: 'Email', aliases: ['email', 'adviseremail', 'advisoremail', 'emailaddress'], required: false, example: 'msantos@feu.edu.ph' },
  { field: 'group_name', header: 'Group Name', aliases: ['groupname', 'group', 'businessname'], required: false, example: 'Kape Kultura' },
  { field: 'link_code', header: 'Adviser Code', aliases: ['advisercode', 'linkcode', 'accesscode', 'checkcode'], required: false, example: 'K7Q-4MP' },
  // Groups are matched by name. A Group Code column from an older file is accepted and ignored, and the import says so.
  { field: 'group_code', header: 'Group Code', aliases: ['groupcode', 'groupno', 'groupnumber'], required: false, example: '', ignored: true },
];

/** Headings, normalised, that could mean more than one column. A file with one is refused rather than guessed. */
export type AmbiguousHeadings = Record<string, (heading: string) => string>;

export const ADVISER_AMBIGUOUS: AmbiguousHeadings = {
  code: (h) => `The column headed "${h}" could mean the group code or the adviser's access code. Rename it to "Group Code" or "Adviser Code" and import again.`,
};

export interface Template {
  columns: ColumnSpec[];
  /** The name of the sheet to fill in. */
  sheet: string;
  file: string;
  /** What one row is, for the instructions. */
  row: string;
  /** Where it is imported. */
  tab: string;
}

/** The download templates, one per importer, keyed as in their address. */
export const TEMPLATES: Record<'roll' | 'advisers', Template> = {
  roll: { columns: ROLL_COLUMNS, sheet: 'Class roll', file: 'Tambiz class roll template.xlsx', row: 'student', tab: 'Class roll' },
  advisers: { columns: ADVISER_COLUMNS, sheet: 'Advisers', file: 'Tambiz adviser list template.xlsx', row: 'adviser (one more row for each further group they advise)', tab: 'Advisers' },
};

/** The columns a template asks for: every column the importer reads, less the ones it only accepts and ignores. */
export const templateColumns = (t: Template) => t.columns.filter((c) => !c.ignored);

/**
 * A spreadsheet to fill in and import: its headings are the importer's own column list, so the template can never ask
 * for a column the importer does not read. One example row, and a second sheet saying what to do.
 */
export async function buildTemplate(t: Template): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tambiz';
  const columns = templateColumns(t);
  const ws = wb.addWorksheet(t.sheet);
  ws.columns = columns.map((c) => ({ header: c.header, width: Math.max(12, c.header.length + 4, c.example.length + 3) }));
  ws.getRow(1).font = { bold: true };
  ws.addRow(columns.map((c) => c.example));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const help = wb.addWorksheet('How to fill this in');
  help.getColumn(1).width = 110;
  const list = (required: boolean) => columns.filter((c) => c.required === required).map((c) => c.header).join(', ');
  [
    `One row per ${t.row}. The second row is an invented example: type over it or delete it before importing.`,
    `These columns must be filled in on every row: ${list(true)}.`,
    `These columns may be left empty: ${list(false)}.`,
    'Keep the headings as they are. Their order does not matter, and any other columns are ignored.',
    `Save as Excel Workbook (.xlsx), then import it on the ${t.tab} tab.`,
  ].forEach((line) => help.addRow([line]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface ParsedSheet {
  rows: { rowNumber: number; sheet: string; values: Record<string, string> }[];
  problems: string[];
}

export class ImportError extends Error {}

export async function parseWorkbook(buffer: ArrayBuffer, columns: ColumnSpec[], fileLabel: string, ambiguous: AmbiguousHeadings = {}): Promise<ParsedSheet> {
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
    ws.getRow(headerRow).eachCell((cell) => {
      const heading = (cell.text ?? '').trim();
      const refuse = Object.hasOwn(ambiguous, norm(heading)) ? ambiguous[norm(heading)] : null;
      if (refuse) throw new ImportError(refuse(heading));
    });
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
