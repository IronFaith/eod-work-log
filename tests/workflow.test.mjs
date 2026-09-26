import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../model.mjs';

const task = (title, category, area = '') => m.validateTask({ ...m.nextTask({ entryType: 'quick' }), title, category, area });
test('custom categories remain reusable through batch edits, grouping, backups and merges', () => {
  const state = m.newState(), day = m.ensureDay(state, '2026-10-02');
  day.tasks = [task('TK420', '  Rack   audits  '), task('TK421', 'rack audits'), task('TK422', 'Cabling QA')];
  assert.equal(day.tasks[0].category, 'Rack audits');
  state.categories = m.categoryNames([...state.categories, ...day.tasks.map(item => item.category)]);
  assert.equal(state.categories.filter(name => name.toLowerCase() === 'rack audits').length, 1);
  day.pasteReview = m.createPasteReview(day.tasks, 'TK423', { mode: 'tickets' });
  day.pasteReview.rows[0].category = 'Custom staging';
  const restored = m.parseBackup(m.exportBackup(state));
  assert.equal(restored.days[day.date].pasteReview.rows[0].category, 'Custom staging');
  assert.deepEqual(m.workCounts(day.tasks).rows, [['Cabling QA', '1'], ['Rack audits', '2']]);
  assert.match(m.renderReport(day).html, /Rack audits/);
  assert.ok(m.mergeBackup(m.newState(), restored).categories.includes('Rack audits'));
  assert.throws(() => task('Too long', 'x'.repeat(81)), /category/i);
  day.updateCategoryDraft = 'auto'; day.updateCategoryAuto = false;
  const customAuto = m.parseBackup(m.exportBackup(state)).days[day.date];
  assert.equal(customAuto.updateCategoryDraft, 'auto');
  assert.equal(customAuto.updateCategoryAuto, false);
});

test('shift presets calculate end times across midnight and preserve crew and duration in backups', () => {
  assert.deepEqual(m.shiftEnd('18:30', 12), { end: '06:30', overnight: true });
  assert.deepEqual(m.shiftEnd('06:00', 8), { end: '14:00', overnight: false });
  assert.deepEqual(m.shiftEnd('14:00', 10), { end: '00:00', overnight: true });
  assert.throws(() => m.shiftEnd('26:00', 12));
  assert.throws(() => m.shiftEnd('06:00', 0));
  const state = m.newState(), day = m.ensureDay(state, '2026-10-02');
  const header = { ...m.blankHeader(), start: '18:00', end: '06:00', crew: 'Test technician', location: 'Test site' };
  state.shiftPresets = [m.shiftPreset({ id: 'night', name: '12-hour nights', duration: '12', header })];
  state.defaults = { ...header }; state.defaultShiftDuration = '12'; day.header = { ...header }; day.shiftDuration = '12';
  const restored = m.parseBackup(m.exportBackup(state));
  assert.deepEqual(restored.shiftPresets, state.shiftPresets);
  assert.equal(restored.days[day.date].shiftDuration, '12');
  const next = m.ensureDay(restored, '2026-10-03');
  assert.equal(next.shiftDuration, '12'); assert.equal(next.header.crew, 'Test technician'); assert.equal(next.tasks.length, 0);
  assert.match(m.reportData(day).header[0][1], /next day.*12 hours/);
  const legacy = { ...state, schema: 8 }; delete legacy.shiftPresets; delete legacy.defaultShiftDuration;
  assert.deepEqual(m.parseBackup(JSON.stringify(legacy)).shiftPresets, []);
  assert.equal(m.mergeBackup(m.newState(), restored).shiftPresets[0].name, '12-hour nights');
});

test('work search and category filters find matching entries without changing report counts', () => {
  const tasks = [task('**TK420** — Inspect rack', 'Rack audits', 'Row 2'), task('TK421 — Restore link', 'Repair', 'Row 10'), task('Meeting', '')];
  tasks[0].summary = 'Checked both ends';
  assert.deepEqual(m.filterTasks(tasks, { query: 'tk420 row 2' }), [tasks[0]]);
  assert.deepEqual(m.filterTasks(tasks, { query: 'both ends', category: 'rack AUDITS' }), [tasks[0]]);
  assert.deepEqual(m.filterTasks(tasks, { category: '' }), [tasks[2]]);
  assert.deepEqual(m.filterTasks(tasks, { query: 'missing' }), []);
  assert.equal(m.workCounts(tasks).entries, 3);
});
