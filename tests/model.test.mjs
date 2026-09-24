import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, ensureDay, nextTask, renderReport, exportBackup, parseBackup, mergeBackup } from '../model.mjs';

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
