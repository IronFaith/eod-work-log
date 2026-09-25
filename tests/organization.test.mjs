import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../model.mjs';

const quick = (title, extra = {}) => m.validateTask({ ...m.nextTask({ entryType: 'quick' }), title, ...extra });

test('optional categories, suggestions and natural area groups survive edits and backups', () => {
  const state = m.newState(), day = m.ensureDay(state, '2026-09-24');
  const review = m.createPasteReview([], 'Pull fiber — Row 10\nDress cables — Row 2\nMeeting');
  assert.equal(review.rows[0].category, m.CATEGORIES[0]);
  assert.equal(review.rows[1].category, m.CATEGORIES[1]);
  assert.equal(review.rows[2].category, '');
  assert.equal(m.suggestCategory('Pull fiber then test connections'), '');
  assert.equal(m.suggestCategory('Pull fiber\nPulled 4 bundles; 2 remain.'), m.CATEGORIES[0]);
  assert.equal(m.suggestCategory('TEST-204 — Check link'), '');
  day.tasks = m.applyPasteReview([], review.rows);
  day.tasks[0].area = 'Row 10'; day.tasks[1].area = 'Row 2';
  assert.deepEqual(m.groupTasks(day.tasks, 'area').map(group => group.label), ['Row 2', 'Row 10', 'No row / area']);
  const update = quick('INC-204 — Fix connection', { category: m.CATEGORIES[3], area: 'Rack A' });
  const existing = m.createPasteReview([update], 'INC-204 — Pull replacement cable').rows[0];
  assert.equal(existing.category, update.category);
  assert.equal(existing.area, update.area);
  day.pasteReview = { ...review, rows: [{ ...existing, action: 'update', targetId: update.id }] };
  const restored = m.parseBackup(m.exportBackup(state)).days[day.date];
  assert.equal(restored.tasks[0].category, m.CATEGORIES[0]);
  assert.equal(restored.pasteReview.rows[0].area, 'Rack A');
  const report = m.renderReport(day);
  assert.ok(report.html.indexOf(m.CATEGORIES[0]) < report.html.indexOf(m.CATEGORIES[1]));
  assert.match(report.text, /Uncategorized/);
  assert.match(report.text, /Row 10/);
  assert.doesNotMatch(report.text, /Acting lead/);
});

test('one undo restores a complete log change after reload without overwriting current drafts', () => {
  const state = m.newState(), day = m.ensureDay(state, '2026-09-24');
  day.tasks = [quick('INC-204 — Original', { summary: 'Earlier progress' })];
  const before = structuredClone(day.tasks);
  m.replaceTasks(day, [{ ...day.tasks[0], summary: 'Correction', category: m.CATEGORIES[3] }, quick('Extra')], 'Save pasted updates');
  day.updateTitleDraft = 'Next ticket draft';
  const restored = m.parseBackup(m.exportBackup(state)).days[day.date];
  assert.equal(restored.undo.label, 'Save pasted updates');
  assert.equal(m.undoTasks(restored), true);
  assert.deepEqual(restored.tasks, before);
  assert.equal(restored.updateTitleDraft, 'Next ticket draft');
  assert.equal(m.undoTasks(restored), false);
  assert.throws(() => m.replaceTasks(day, [quick('Valid'), { invalid: true }], 'Invalid save'));
  assert.equal(day.tasks[0].summary, 'Correction');
});

test('explicit carry forward keeps identity but clears production and prevents repeated work', () => {
  const state = m.newState(), source = m.ensureDay(state, '2026-09-23'), target = m.ensureDay(state, '2026-09-24');
  const open = m.validateTask({ ...m.nextTask(), entryType: 'ticket', title: 'Pull fiber', ticketId: 'WO-42', description: 'Original request', notes: 'Yesterday’s work', area: 'Row A', category: m.CATEGORIES[0], quantity: '6', breakdown: [{ length: 11, groups: 2, perGroup: 16 }], status: 'Blocked' });
  const done = m.validateTask({ ...m.nextTask(), title: 'Finished work', status: 'Completed' });
  source.tasks = [open, quick('Dress cables', { summary: 'Yesterday dressed 3 bundles' }), done];
  const before = structuredClone(source.tasks);
  const tasks = m.carryTasks(source, target, [open.id, source.tasks[1].id]);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].ticketId, 'WO-42');
  assert.equal(tasks[0].description, 'Original request');
  assert.equal(tasks[0].area, 'Row A');
  assert.equal(tasks[0].category, m.CATEGORIES[0]);
  assert.equal(tasks[0].notes, '');
  assert.equal(tasks[0].quantity, '');
  assert.deepEqual(tasks[0].breakdown, []);
  assert.equal(tasks[0].status, 'In progress');
  assert.equal(tasks[1].summary, '');
  assert.notEqual(tasks[0].id, open.id);
  assert.deepEqual(source.tasks, before);
  target.tasks = tasks;
  assert.throws(() => m.carryTasks(source, target, [open.id]), /already/i);
  assert.throws(() => m.carryTasks(source, target, [done.id]), /completed/i);
  const restored = m.parseBackup(m.exportBackup({ ...state, days: { [target.date]: target } }));
  assert.equal(restored.days[target.date].tasks[0].carriedFrom, `${source.date}:${open.id}`);
});
