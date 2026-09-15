// The download templates are built from the importers' own column lists, so they can never drift from what the import reads.
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { ADVISER_COLUMNS, buildTemplate, parseWorkbook, ROLL_COLUMNS, templateColumns, TEMPLATES } from '@/lib/excel-import';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

describe('download templates', () => {
  for (const [kind, template] of Object.entries(TEMPLATES)) {
    it(`the ${kind} template has every column the importer reads, in its order, and no Group Code, and imports as its one example row`, async () => {
      const buf = await buildTemplate(template);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const headings: string[] = [];
      wb.worksheets[0].getRow(1).eachCell((c) => headings.push(String(c.value)));
      expect(headings).toEqual(templateColumns(template).map((c) => c.header));
      expect(headings).not.toContain('Group Code');

      const parsed = await parseWorkbook(buf as unknown as ArrayBuffer, template.columns, kind);
      expect(parsed.problems).toEqual([]);
      expect(parsed.rows.map((r) => [r.sheet, r.values])).toEqual([[template.sheet, Object.fromEntries(template.columns.map((c) => [c.field, c.ignored ? '' : c.example]))]]);
    });
  }

  it('every heading is one the importer itself recognises, so a template cannot ask for a column it ignores', () => {
    for (const c of [...ROLL_COLUMNS, ...ADVISER_COLUMNS]) expect(c.aliases).toContain(norm(c.header));
  });
});
