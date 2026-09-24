import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, ensureDay, nextTask, quickTasks, renderReport, reportWarnings, exportBackup, parseBackup, mergeBackup, validateTask } from '../model.mjs';

test('pasted tickets stay together when grouped as blocks or one note', () => {
  const source = 'INC-204\r\nChecked both ends; stable\r\n \r\nRow B\nDressed 3 bundles';
  assert.deepEqual(quickTasks(source, { mode: 'blocks' }).map(task => task.summary), ['INC-204\nChecked both ends; stable', 'Row B\nDressed 3 bundles']);
  const single = quickTasks(source, { mode: 'single' });
  assert.equal(single.length, 1);
  assert.equal(single[0].summary, 'INC-204\nChecked both ends; stable\n \nRow B\nDressed 3 bundles');
  assert.equal(single[0].status, '');
  assert.equal(single[0].ticketId, '');
});

test('spreadsheet paste keeps quoted multiline cells and labels attached to their rows', () => {
  const source = 'Ticket\tProgress\tStatus\r\nINC-204\t"Checked both ends\nLink stable"\tDone\r\nINC-205\t"Replaced ""A"" cable"\t\r\n';
  assert.deepEqual(quickTasks(source, { mode: 'table', headers: true }).map(task => task.summary), ['Ticket: INC-204\nProgress: Checked both ends\nLink stable\nStatus: Done', 'Ticket: INC-205\nProgress: Replaced "A" cable']);
  assert.deepEqual(quickTasks('Row A\t4 bundles\r\nRow B\t3 bundles', { mode: 'table' }).map(task => task.summary), ['Row A · 4 bundles', 'Row B · 3 bundles']);
  assert.throws(() => quickTasks('Ticket\tProgress\nINC-204\t"Unfinished', { mode: 'table', headers: true }), /quote/i);
});

test('paste preferences survive reloads and old backups default to separate lines', () => {
  const state = newState();
  const day = ensureDay(state, '2026-09-24');
  day.quickMode = 'table';
  day.quickTableHeaders = false;
  day.quickDraft = 'Row A\t4 bundles';
  const restored = parseBackup(exportBackup(state)).days[day.date];
  assert.equal(restored.quickMode, 'table');
  assert.equal(restored.quickTableHeaders, false);
  assert.equal(restored.quickDraft, 'Row A\t4 bundles');
  delete day.quickMode;
  delete day.quickTableHeaders;
  const legacy = parseBackup(exportBackup(state)).days[day.date];
  assert.equal(legacy.quickMode, 'lines');
  assert.equal(legacy.quickTableHeaders, true);
});

test('a quick update survives backup without requiring or inventing ticket fields', () => {
  const state = newState();
  const day = ensureDay(state, '2026-09-24');
  day.tasks = quickTasks('INC-204 — restored link; complete\r\n\r\n  Row B — dressed 3 bundles; 1 remaining  ');
  assert.equal(day.tasks.length, 2);
  assert.equal(day.tasks[1].summary, 'Row B — dressed 3 bundles; 1 remaining');
  assert.notEqual(day.tasks[0].id, day.tasks[1].id);
  day.quickDraft = 'Row A — pulled 4 bundles; 2 remaining';
  const restored = parseBackup(exportBackup(state)).days[day.date];
  assert.equal(restored.tasks[0].summary, 'INC-204 — restored link; complete');
  assert.equal(restored.tasks[0].status, '');
  assert.equal(restored.tasks[0].ticketId, '');
  assert.equal(restored.quickDraft, 'Row A — pulled 4 bundles; 2 remaining');
  const report = renderReport(restored);
  assert.match(report.text, /INC-204 — restored link; complete/);
  assert.doesNotMatch(report.text, /Pulling fiber|In progress|Quantity not recorded/);
  assert.throws(() => validateTask({ ...nextTask(), entryType: 'quick', summary: '  ', status: '' }));
});

test('supervisor summary omits ticket requests while preserving production and optional full details', () => {
  const day = ensureDay(newState(), '2026-09-24');
  day.tasks = [{ ...nextTask(), entryType: 'ticket', title: 'Inspect cross-connect', ticketId: 'REQ-008', description: 'LONG ORIGINAL REQUEST', notes: 'Labeled both ends', quantity: '4', unit: 'connections', area: 'Row A', status: 'Completed' }];
  const compact = renderReport(day);
  for (const value of ['REQ-008', 'Labeled both ends', '4 connections', 'Row A', 'Completed']) assert.ok(compact.text.includes(value));
  assert.doesNotMatch(compact.text, /LONG ORIGINAL REQUEST|Description:|Work performed:/);
  assert.match(renderReport(day, { detailed: true }).text, /LONG ORIGINAL REQUEST/);
  assert.equal(day.tasks[0].description, 'LONG ORIGINAL REQUEST');
});

test('unadded quick notes keep a report in draft and are preserved when backups merge', () => {
  const state = newState();
  const day = ensureDay(state, '2026-09-24');
  day.header = { start: '06:00', end: '16:00', location: 'Test site', supervisor: 'Test supervisor', lead: '', crew: 'Test crew' };
  day.blockerState = 'None';
  day.tasks = [{ ...nextTask(), quantity: '4' }];
  day.quickDraft = 'Pending production update';
  assert.ok(reportWarnings(day).some(warning => /quick notes/i.test(warning)));
  assert.match(renderReport(day).text, /^Draft EOD/);
  assert.equal(mergeBackup(newState(), parseBackup(exportBackup(state))).days[day.date].quickDraft, 'Pending production update');
  assert.equal(ensureDay(state, '2026-09-25').quickDraft, '');
});

test('ticket descriptions survive saving and a row is not required for a complete report', () => {
  const state = newState();
  const day = ensureDay(state, '2026-09-24');
  day.header = { start: '06:00', end: '16:00', location: 'Test site', supervisor: 'Test supervisor', lead: '', crew: 'Test crew' };
  day.blockerState = 'None';
  day.tasks = [validateTask({ ...nextTask(), entryType: 'ticket', title: 'Investigate link alarms', ticketId: 'INC-204', description: 'Intermittent link alarms reported', notes: 'Checked patching and confirmed stable link', area: '', status: 'Completed' })];
  const restored = parseBackup(exportBackup(state)).days[day.date];
  assert.equal(restored.tasks[0].ticketId, 'INC-204');
  assert.equal(restored.tasks[0].description, 'Intermittent link alarms reported');
  assert.equal(restored.tasks[0].notes, 'Checked patching and confirmed stable link');
  assert.deepEqual(reportWarnings(restored), []);
  const next = nextTask(restored.tasks[0]);
  assert.equal(next.entryType, 'ticket');
  assert.equal(next.ticketId, '');
  assert.equal(next.description, '');
  assert.equal(next.title, '');
  const legacy = JSON.parse(exportBackup(state));
  legacy.schema = 1;
  delete legacy.days[day.date].tasks[0].entryType;
  delete legacy.days[day.date].tasks[0].ticketId;
  delete legacy.days[day.date].tasks[0].title;
  delete legacy.days[day.date].tasks[0].description;
  assert.equal(parseBackup(JSON.stringify(legacy)).days[day.date].tasks[0].notes, 'Checked patching and confirmed stable link');
});

test('readable report output keeps ticket identity, request, and work performed in separate lines', () => {
  const day = ensureDay(newState(), '2026-09-24');
  day.tasks = [{ ...nextTask(), entryType: 'ticket', title: 'Inspect cross-connect', ticketId: 'REQ-008', description: 'Check the new connection', notes: 'Inspected and labeled both ends', status: 'Completed' }];
  const report = renderReport(day, { detailed: true });
  assert.match(report.text, /1\. Inspect cross-connect/);
  assert.match(report.text, /\nTicket: REQ-008\n/);
  assert.match(report.text, /\nDescription: Check the new connection\n/);
  assert.match(report.text, /\nWork performed: Inspected and labeled both ends\n/);
  assert.match(report.text, /\nStatus: Completed/);
  assert.doesNotMatch(report.text, /Quantity not recorded|Location: Not recorded.*Inspect/);
});

test('a new day and next row retain reusable choices without carrying work totals', () => {
  const state = newState();
  state.defaults = { location: 'Test building', supervisor: 'Test supervisor', lead: '', crew: 'Test crew', start: '06:00', end: '16:00' };
  const oldDay = ensureDay(state, '2026-09-23');
  oldDay.tasks.push({ id: 'one', kind: 'Pulling fiber', area: 'Test row', quantity: '4', unit: 'bundles', status: 'Completed', notes: 'Finished', breakdown: [{ length: 11, groups: 2, perGroup: 16 }] });
  oldDay.blockerState = 'Reported';
  oldDay.blockers = 'Missing cable';
  oldDay.carryover = 'Resume here';
  const fresh = ensureDay(state, '2026-09-24');
  assert.equal(fresh.header.location, 'Test building');
  assert.deepEqual(fresh.tasks, []);
  assert.equal(fresh.blockerState, 'Not reviewed');
  assert.equal(fresh.blockers, '');
  assert.equal(fresh.carryover, '');
  const next = nextTask(oldDay.tasks[0]);
  assert.equal(next.kind, 'Pulling fiber');
  assert.equal(next.status, 'In progress');
  assert.equal(next.area, '');
  assert.equal(next.quantity, '');
  assert.deepEqual(next.breakdown, []);
  fresh.header.crew = 'Changed';
  assert.equal(state.defaults.crew, 'Test crew');
  assert.equal(oldDay.tasks.length, 1);
});

test('the report separates quantities from lengths and escapes user-entered HTML', () => {
  const day = ensureDay(newState(), '2026-09-24');
  day.header.location = '<img src=x onerror=alert(1)>';
  day.tasks = [
    { id: 'a', kind: 'Pulling fiber', area: 'Row A', quantity: '4', unit: 'bundles', status: 'Completed', notes: '', breakdown: [{ length: 11, groups: 2, perGroup: 16 }] },
    { id: 'b', kind: 'Dressing fiber', area: 'Row A', quantity: '4', unit: 'bundles', status: 'In progress', notes: '', breakdown: [] },
    { id: 'c', kind: 'Custom task', custom: 'Housekeeping', area: 'Staging', quantity: '', unit: 'items', status: 'Completed', notes: 'Organized material', breakdown: [] }
  ];
  day.blockerState = 'Reported';
  day.blockers = '8 m — 16 fibers missing\n12 m — 16 fibers missing';
  const report = renderReport(day);
  assert.match(report.text, /11 m: 2 groups × 16 fibers = 32 fibers/);
  assert.match(report.text, /4 bundles/);
  assert.doesNotMatch(report.text, /8 bundles|64 fibers|16 m/);
  assert.match(report.text, /Housekeeping/);
  assert.match(report.text, /12 m — 16 fibers missing/);
  assert.doesNotMatch(report.html, /<img/);
  assert.match(report.html, /&lt;img/);
  assert.match(report.html, /<table/);
});

test('backup round-trip validates records and preserves existing dates when merged', () => {
  const state = newState();
  ensureDay(state, '2026-09-23').header.location = 'Original';
  const restored = parseBackup(exportBackup(state));
  assert.equal(restored.days['2026-09-23'].header.location, 'Original');
  const current = newState();
  ensureDay(current, '2026-09-23').header.location = 'Newer local edit';
  ensureDay(current, '2026-09-24');
  const merged = mergeBackup(current, restored);
  assert.equal(merged.days['2026-09-23'].header.location, 'Newer local edit');
  assert.equal(Object.keys(merged.days).length, 2);
  const freshBrowser = newState();
  ensureDay(freshBrowser, '2026-09-23');
  assert.equal(mergeBackup(freshBrowser, restored).days['2026-09-23'].header.location, 'Original');
  assert.throws(() => parseBackup('{"schema":1,"days":{"2026-02-31":{}},"defaults":{}}'));
  assert.throws(() => parseBackup('{"schema":99,"days":{},"defaults":{}}'));
  assert.throws(() => parseBackup('{"schema":1,"days":{"__proto__":{}},"defaults":{}}'));
  const invalid = structuredClone(state);
  invalid.days['2026-09-23'].tasks.push({ id: 'bad', kind: 'Pulling fiber', area: 'Row', quantity: '-4', unit: 'bundles', status: 'Completed', notes: '', breakdown: [] });
  assert.throws(() => parseBackup(JSON.stringify(invalid)));
});
