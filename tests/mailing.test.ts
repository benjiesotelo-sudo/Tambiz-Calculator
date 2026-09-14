// Decision 11: the mailing sheet is a named Excel table that Power Automate can list rows from.
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildMailingSheet, MAILING_TABLE } from '@/lib/mailing';

describe('mailing sheet', () => {
  it('is an Excel table named Mailing with Name, Email, Link and Role', async () => {
    const buf = await buildMailingSheet(
      [
        { name: 'Andrea Dela Cruz', email: 'andrea@feu.edu.ph', link: 'https://example.test/r/abc', role: 'Student' },
        { name: 'Prof. Maria Santos', email: 'msantos@feu.edu.ph', link: 'https://example.test/r/def', role: 'Adviser' },
      ],
      'Tambiz 2027',
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet(MAILING_TABLE)!;
    expect(ws.getRow(1).values).toEqual([, 'Name', 'Email', 'Link', 'Role']);
    expect(ws.getRow(3).getCell(3).value).toBe('https://example.test/r/def');

    // The table definition itself, as Excel and Power Automate see it.
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const tableFile = Object.keys(zip.files).find((f) => /^xl\/tables\/table\d+\.xml$/.test(f))!;
    const xml = await zip.file(tableFile)!.async('string');
    expect(xml).toMatch(/name="Mailing"/);
    expect(xml).toMatch(/ref="A1:D3"/);
  });
});
