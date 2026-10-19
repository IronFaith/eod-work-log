import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { buildReportPdf } from '../pdf.mjs';
import { newState, ensureDay, nextTask } from '../model.mjs';

export function sampleDay() {
  const day = ensureDay(newState(), '2026-09-24');
  day.header = { start: '06:00', end: '16:00', location: 'Example data center', supervisor: 'Test supervisor', lead: 'Test lead', crew: 'Test technician A\nTest technician B' };
  day.tasks = Array.from({ length: 7 }, (_, i) => ({ ...nextTask(), entryType: i ? 'ticket' : 'field', title: i ? `Investigate connection ${i}` : 'Pulling fiber', ticketId: `TEST-${100 + i}`, area: i % 2 ? '' : `Row ${i + 1}`, status: i % 2 ? 'In progress' : 'Completed', description: i === 2 ? `${'Check patching, trace both endpoints, and record the test result. '.repeat(48)}END OF LONG REQUEST` : 'Inspect the requested connection and record the outcome.', notes: i === 6 ? 'FINAL ENTRY VERIFIED — labels updated; José confirmed completion.' : 'Inspected both ends. Recorded results and updated the ticket.', quantity: i === 0 ? '4' : '', breakdown: i === 0 ? [{ length: 11, groups: 2, perGroup: 16 }] : [] }));
  day.blockerState = 'Reported';
  day.blockers = 'Example blocker: awaiting a replacement cable.\nThe affected ticket remains open.';
  day.carryover = 'Follow up on the open tickets at the start of the next shift.';
  return day;
}

test('PDF export produces multiple pages for long mixed work entries', () => {
  const doc = buildReportPdf(sampleDay(), { jsPDF, autoTable }, { detailed: true });
  assert.ok(doc.getNumberOfPages() > 1);
  const output = doc.output();
  assert.ok(output.startsWith('%PDF-'));
  assert.match(output, /\/BaseFont \/NotoSans/);
});

test('wide imported tables keep every cell within its printed column across pages', () => {
  const day = sampleDay(), overflow = [], seen = new Map();
  day.tasks = day.tasks.slice(0,3);
  day.reportTables = [{ id: 'wide', title: 'Equipment check', headers: ['Asset', ...Array.from({ length: 9 }, (_,i) => `Check ${i+1}`)], rows: Array.from({ length: 12 }, (_,i) => [`Rack ${i+1}`, ...Array.from({ length: 9 }, (_,j) => `Test ${i+1}.${j+1}: verified`)]), include: true }];
  buildReportPdf(day, { jsPDF, autoTable(doc, settings) {
    const draw = settings.didDrawCell;
    return autoTable(doc, { ...settings, didDrawCell(data) {
      draw?.(data);
      if (data.section !== 'body' || !/^Test \d+\.\d+: verified$/.test(data.cell.raw.content)) return;
      const content = data.cell.raw.content;
      seen.set(content, (seen.get(content) || '') + data.cell.text.join(''));
      for (const line of data.cell.text) if (doc.getTextWidth(line) > data.cell.width - data.cell.padding('horizontal') + 0.15) overflow.push(data.cell.raw.content);
    } });
  } });
  assert.equal(seen.size,108);
  for (const [source,printed] of seen) assert.equal(printed.replace(/\s/g,''),source.replace(/\s/g,''));
  assert.deepEqual(overflow,[]);
});
