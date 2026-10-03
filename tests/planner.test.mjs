import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../model.mjs';
import { createShift, assignWork, availableWork, taskTimeline, weekDates, detectPaste } from '../planner.mjs';

test('multiple shifts preserve independent crews, drafts and tasks through migration and backup merge', () => {
  const state = m.newState(), original = m.ensureDay(state, '2026-10-02');
  original.header.crew = 'Example day crew'; original.updatedAt = '2026-10-02T12:00:00Z'; original.updateTitleDraft = 'TK421\nTK422';
  state.schema = 9;
  const restored = m.parseBackup(m.exportBackup(state));
  assert.equal(restored.schema, 10);
  const night = createShift(restored, original.date, { name: 'Night' });
  night.header.crew = 'Example night crew'; night.entryLogged = false;
  night.tasks = m.applyPasteReview([], m.createPasteReview([], 'TK430 TK431', { mode: 'tickets' }).rows, { logged: false });
  const roundTrip = m.parseBackup(m.exportBackup(restored)), merged = m.mergeBackup(roundTrip, m.parseBackup(m.exportBackup(state)));
  assert.equal(Object.keys(merged.days).length, 2);
  assert.equal(merged.days[original.date].header.crew, 'Example day crew');
  assert.equal(merged.days[original.date].updateTitleDraft, 'TK421\nTK422');
  assert.equal(merged.days[night.id].header.crew, 'Example night crew');
  assert.equal(merged.days[night.id].tasks.length, 2);
  assert.equal(merged.days[night.id].entryLogged, false);
  const invalid = JSON.parse(m.exportBackup(restored)); invalid.days[night.id].date = '2026-10-03';
  assert.throws(() => m.parseBackup(JSON.stringify(invalid)));
  assert.deepEqual(weekDates('2027-01-01'), ['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  const fresh = m.newState(); m.ensureDay(fresh, '2026-10-02');
  assert.equal(createShift(fresh, '2026-10-02').id, '2026-10-02');
});

test('continued work keeps its identity and request while shift progress and report counts remain separate', () => {
  const state = m.newState(), first = createShift(state, '2026-10-02', { name: 'Day' }), second = createShift(state, first.date, { name: 'Night' });
  first.tasks = [m.validateTask({ ...m.nextTask(), entryType: 'ticket', title: 'Inspect link', ticketId: 'TK420', description: 'Original request', notes: 'Checked A-end', quantity: '4', status: 'In progress' })];
  const task = first.tasks[0];
  assert.equal(availableWork(state, second.id).length, 1);
  second.tasks = [assignWork(state, first.id, task.id, second.id)];
  assert.equal(second.tasks[0].description, 'Original request');
  assert.equal(second.tasks[0].notes, ''); assert.equal(second.tasks[0].quantity, '');
  assert.equal(second.tasks[0].workId, task.workId);
  assert.equal(task.notes, 'Checked A-end');
  assert.equal(m.reportData(second).taskRows.length, 0);
  assert.equal(m.reportData(second).counts, null);
  for (const detailed of [false, true]) {
    assert.doesNotMatch(m.renderReport(second, { detailed }).html, /Inspect link|Original request/);
    assert.doesNotMatch(m.renderReport(second, { detailed }).text, /Inspect link|Original request/);
  }
  assert.equal(availableWork(state, second.id).length, 0);
  assert.throws(() => assignWork(state, first.id, task.id, second.id), /already/);
  second.tasks[0] = m.validateTask({ ...second.tasks[0], notes: 'Checked B-end', status: 'Completed', logged: true });
  const restored = m.parseBackup(m.exportBackup(state));
  assert.equal(taskTimeline(restored, task.workId).length, 2);
  assert.equal(m.reportData(restored.days[second.id]).counts.entries, 1);
  assert.match(m.renderReport(restored.days[second.id]).text, /Checked B-end/);
  assert.doesNotMatch(m.renderReport(restored.days[second.id]).text, /Checked A-end/);
  assert.throws(() => assignWork(restored, second.id, second.tasks[0].id, first.id), /already|completed/i);
});

test('older bring-forward records migrate to a connected timeline without joining unrelated ticket references', () => {
  const state = m.newState(), first = m.ensureDay(state, '2026-10-01'), second = m.ensureDay(state, '2026-10-02');
  first.tasks = [m.validateTask({ ...m.nextTask({ entryType: 'quick' }), title: 'TK420', summary: 'First progress' })];
  second.tasks = m.carryTasks(first, second, [first.tasks[0].id]);
  second.tasks.push(m.validateTask({ ...m.nextTask({ entryType: 'quick' }), title: 'TK420', summary: 'Independent task' }));
  for (const shift of [first, second]) for (const task of shift.tasks) { delete task.workId; delete task.logged; }
  state.schema = 9;
  const restored = m.parseBackup(m.exportBackup(state)), workId = restored.days[first.date].tasks[0].workId;
  assert.equal(taskTimeline(restored, workId).length, 2);
  assert.equal(m.reportData(restored.days[second.date]).taskRows.length, 2);
  assert.notEqual(restored.days[second.date].tasks[1].workId, workId);
});

test('the unified entry detects ticket lists and spreadsheet paste and preserves review fields and quick statuses', () => {
  assert.deepEqual(detectPaste('tk28493 tk83939 tk939393'), { mode: 'tickets', headers: false });
  assert.deepEqual(detectPaste('Title\tDescription\nTK420\tChecked link'), { mode: 'table', headers: true });
  assert.deepEqual(detectPaste('Title,Description\nTK420,Checked link'), { mode: 'csv', headers: true });
  assert.deepEqual(detectPaste('Inspect rack\nLabel ends'), { mode: 'lines', headers: false });
  assert.equal(detectPaste('Restore rack connection'), null);
  const source = 'TK420 TK421', review = m.createPasteReview([], source, detectPaste(source));
  const rows = m.fillPasteReview(review.rows, { summary: 'Checked links', category: 'Custom category', area: 'Row A' });
  const tasks = m.applyPasteReview([], rows, { logged: false, status: 'In progress' });
  assert.equal(tasks.length, 2); assert.notEqual(tasks[0].workId, tasks[1].workId);
  assert.equal(tasks[1].summary, 'Checked links'); assert.equal(tasks[1].category, 'Custom category');
  const day = m.ensureDay(m.newState(), '2026-10-02'); day.tasks = tasks;
  assert.equal(m.reportData(day).taskRows.length, 0);
  day.tasks[0] = m.validateTask({ ...tasks[0], logged: true, status: 'Completed' });
  assert.equal(m.reportData(day).taskRows.length, 1);
  assert.match(m.renderReport(day).html, /TK420|Completed/);
  assert.doesNotMatch(m.renderReport(day).html, /TK421/);
});
