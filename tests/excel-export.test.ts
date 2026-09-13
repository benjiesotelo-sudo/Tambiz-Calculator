// The workbook must show exactly what the screens show (decision 2): the same two-decimal rounding, from one function.
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildWorkbook } from '@/lib/excel-export';
import type { EventReport } from '@/lib/repo';
import { DEFAULT_RUBRIC } from '@/lib/rubric';
import { fmtPct, type GroupResult } from '@/lib/scoring';

function report(overall: number): EventReport {
  const g: GroupResult = {
    id: 'g1', name: 'Kape Kultura', categories: [], defense: overall, booth: overall, defenseComplete: true, boothComplete: true,
    overall, complete: true, accepted: false, overallRank: 1,
  };
  const event = { id: 'e1', year: 2027, title: 'Tambiz 2027', status: 'finalised' as const, rubric: DEFAULT_RUBRIC, created_at: new Date() };
  return {
    event,
    groups: [{ id: 'g1', event_id: 'e1', code: 'G01', name: 'Kape Kultura', section: 'BA-3A', adviser_id: null, adviser_name: null, member_count: 0 }],
    results: { groups: [g], leaderboards: [] },
    resultById: new Map([['g1', g]]),
    grades: [],
    sheets: [],
    sheetValues: new Map(),
    filled: new Map(),
  } as unknown as EventReport;
}

async function open(r: EventReport) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildWorkbook(r)) as unknown as ArrayBuffer);
  return wb;
}

describe('the workbook rounds exactly like the screens', () => {
  it('89.85 is 89.85 in both (the first app showed 89.8 on screen and 89.9 in Excel)', async () => {
    const wb = await open(report(89.85));
    const ws = wb.getWorksheet('Results')!;
    const cell = ws.getRow(2).getCell(5); // Group Code, Group Name, Defense %, Booth %, Overall %
    expect(ws.getRow(1).getCell(5).text).toBe('Overall %');
    expect(cell.value).toBe(89.85);
    expect(cell.numFmt).toBe('0.00');
    expect(`${(cell.value as number).toFixed(2)}%`).toBe(fmtPct(89.85));
  });
  it('an average the computer holds as 89.84499… is 89.85 in both', async () => {
    const avg = (89.84 + 89.85) / 2;
    const wb = await open(report(avg));
    const cell = wb.getWorksheet('Results')!.getRow(2).getCell(5);
    expect(cell.value).toBe(89.85);
    expect(fmtPct(avg)).toBe('89.85%');
  });
});
