// The year's Excel workbook, with the sheets of the coordinator's existing workbook:
// Scores, Booth Scores, Results, Leaderboard, Individual Grades, and For Encoding (the official grade sheet).
// All export code lives here so the library can be swapped without touching the rest of the app.

import ExcelJS from 'exceljs';
import { fullName, rollName, type EventReport } from './repo';
import { criteriaOf, type Half } from './rubric';
import { fmt2, round2 } from './scoring';

const GREEN = 'FF1A6B3C';
const DARK = 'FF0D4F2B';
const GOLD = 'FFF0B429';
/** The same two-decimal rounding as the screens (scoring.round2), stored as a number and shown with two decimals. */
const n2 = (n: number | null) => (n === null ? '' : round2(n));
const TWO_DECIMALS = '0.00';
const twoDecimals = (row: ExcelJS.Row, cols: number[]) =>
  cols.forEach((c) => {
    const cell = row.getCell(c);
    if (typeof cell.value === 'number') cell.numFmt = TWO_DECIMALS;
  });
const judged = (g: { complete: boolean; accepted: boolean }) => (g.complete ? 'Complete' : g.accepted ? 'Finalised incomplete' : 'Incomplete');

function header(ws: ExcelJS.Worksheet, row: ExcelJS.Row, fill = GREEN, font = 'FFFFFFFF') {
  row.eachCell((c) => {
    c.font = { bold: true, color: { argb: font } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    c.alignment = { vertical: 'middle', wrapText: true };
    c.border = { bottom: { style: 'thin', color: { argb: GOLD } } };
  });
  row.height = 30;
  ws.views = [{ state: 'frozen', ySplit: row.number, xSplit: 0 }];
}

export async function buildWorkbook(report: EventReport): Promise<Buffer> {
  const { event, groups, results, grades } = report;
  const rubric = event.rubric;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tambiz';
  wb.created = new Date();

  // Scores / Booth Scores: one row per judge per group, as the old export did.
  const scoreSheet = (half: Half, title: string) => {
    const ws = wb.addWorksheet(title);
    const crits = criteriaOf(rubric, half);
    ws.columns = [
      { header: 'Group Code', width: 11 },
      { header: 'Group Name', width: 26 },
      { header: 'Panelist', width: 22 },
      { header: 'Status', width: 12 },
      ...crits.map((c) => ({ header: `${c.category.name} #${c.index + 1} (/${c.max})`, width: 13 })),
    ];
    header(ws, ws.getRow(1));
    for (const g of groups) {
      const sheets = report.sheets.filter((s) => s.group_id === g.id && s.half === half);
      for (const s of sheets) {
        const vals = report.sheetValues.get(s.id)!;
        ws.addRow([g.code, g.name, s.judge_name, s.status === 'complete' ? 'Complete' : 'In progress', ...crits.map((c) => vals[c.category.key]?.[c.index] ?? null)]);
      }
    }
  };
  scoreSheet('defense', 'Scores');
  scoreSheet('booth', 'Booth Scores');

  // Results, sorted by overall rank.
  {
    const ws = wb.addWorksheet('Results');
    const cats = results.groups[0]?.categories ?? [...rubric.halves.defense.categories.map((c) => ({ name: c.name })), ...rubric.halves.booth.categories.map((c) => ({ name: c.name }))];
    ws.columns = [
      { header: 'Group Code', width: 11 },
      { header: 'Group Name', width: 26 },
      ...cats.flatMap((c) => [
        { header: `${c.name} %`, width: 14 },
        { header: `${c.name} Rank`, width: 12 },
      ]),
      { header: 'Defense %', width: 11 },
      { header: 'Booth %', width: 11 },
      { header: 'Overall %', width: 11 },
      { header: 'Overall Rank', width: 12 },
      { header: 'Judged', width: 20 },
    ];
    header(ws, ws.getRow(1), DARK, GOLD);
    const code = new Map(groups.map((g) => [g.id, g.code]));
    const order = [...results.groups].sort((a, b) => (a.overallRank ?? 1e9) - (b.overallRank ?? 1e9));
    for (const g of order) {
      const row = ws.addRow([
        code.get(g.id),
        g.name,
        ...g.categories.flatMap((c) => [n2(c.pct), c.rank === null ? '' : `Rank ${c.rank}`]),
        n2(g.defense),
        n2(g.booth),
        n2(g.overall),
        g.overallRank === null ? '' : `Rank ${g.overallRank}`,
        judged(g),
      ]);
      twoDecimals(row, Array.from({ length: row.cellCount }, (_, i) => i + 1));
    }
    ws.addRow([]);
    ws.addRow(['A blank score is never counted as zero. A part nobody scored is left empty and left out; incomplete groups have no rank.']);
  }

  // Leaderboard: Position 1-10 down, one column per category.
  {
    const ws = wb.addWorksheet('Leaderboard');
    ws.columns = [{ header: '', width: 12 }, ...results.leaderboards.map((lb) => ({ header: lb.name, width: 30 }))];
    header(ws, ws.getRow(1), DARK, GOLD);
    for (let pos = 0; pos < 10; pos++) {
      ws.addRow([`Position ${pos + 1}`, ...results.leaderboards.map((lb) => (lb.entries[pos] ? `${lb.entries[pos].rank}. ${lb.entries[pos].name}: ${fmt2(lb.entries[pos].score)}%` : ''))]);
    }
  }

  // Individual Grades: one row per member per judge.
  {
    const ws = wb.addWorksheet('Individual Grades');
    ws.columns = [
      { header: 'Group Name', width: 24 },
      { header: 'Member Name', width: 26 },
      { header: 'Student ID', width: 15 },
      { header: 'Section', width: 10 },
      { header: 'Panelist', width: 22 },
      ...rubric.memberFields.map((f) => ({ header: `${f.name} (/${f.max})`, width: 16 })),
      { header: 'Total Score', width: 12 },
      { header: 'Group Overall %', width: 15 },
      { header: 'Final Grade', width: 12 },
      { header: 'Letter Grade', width: 12 },
    ];
    header(ws, ws.getRow(1));
    const sorted = [...grades].sort((a, b) => a.group.code.localeCompare(b.group.code, undefined, { numeric: true }) || a.student.surname.localeCompare(b.student.surname));
    for (const g of sorted) {
      const judges = g.perJudge.length ? g.perJudge : [{ judge: '', set: {} }];
      const nFields = rubric.memberFields.length;
      judges.forEach((p, i) => {
        const row = ws.addRow([
          g.group.name,
          fullName(g.student),
          g.student.student_number,
          g.student.section,
          p.judge,
          ...rubric.memberFields.map((f) => p.set[f.key] ?? null),
          i === 0 ? n2(g.total) : '',
          i === 0 ? n2(g.overall) : '',
          i === 0 ? n2(g.final) : '',
          i === 0 ? (g.letter ?? '') : '',
        ]);
        twoDecimals(row, [6 + nFields, 7 + nFields, 8 + nFields]);
      });
    }
  }

  // For Encoding: the official grade sheet, sorted by section.
  {
    const ws = wb.addWorksheet('For Encoding');
    const lines = ['FAR EASTERN UNIVERSITY', 'Institute of Accounts, Business and Finance', 'Business Administration Department', `MGT1114 Business Plan 2 · ${event.title}`, 'OFFICIAL GRADE SHEET'];
    lines.forEach((text, i) => {
      const row = ws.addRow([text]);
      ws.mergeCells(row.number, 1, row.number, 8);
      row.getCell(1).font = { bold: i === 0 || i === 4, size: i === 0 ? 14 : 11, color: { argb: DARK } };
      row.getCell(1).alignment = { horizontal: 'center' };
    });
    ws.addRow([]);
    const head = ws.addRow(['Member Name', 'STUDENT NAME (per Class Roll)', 'Student ID', 'Section', 'Total Score', 'Group Overall %', 'Final Grade', 'Letter Grade']);
    header(ws, head, DARK, GOLD);
    ws.columns.forEach((c, i) => (c.width = [26, 34, 15, 10, 12, 15, 12, 12][i]));
    const sorted = [...grades].sort(
      (a, b) => a.student.section.localeCompare(b.student.section) || a.student.surname.localeCompare(b.student.surname) || a.student.first_name.localeCompare(b.student.first_name),
    );
    for (const g of sorted) {
      const row = ws.addRow([fullName(g.student), rollName(g.student), g.student.student_number, g.student.section, n2(g.total), n2(g.overall), g.rounded ?? '', g.letter ?? '']);
      twoDecimals(row, [5, 6]);
    }
    ws.addRow([]);
    ws.addRow([`Final Grade is (Total Score + Group Overall %) ÷ 2, rounded up to a whole number. Generated ${new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}.`]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
