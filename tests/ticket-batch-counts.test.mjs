import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../model.mjs';

test('ticket lists split IDs and keep supplied descriptions without dropping unexpected text', () => {
  const review = m.createPasteReview([], 'tk28493 tk83939, tk939393; TK28493', { mode: 'tickets' });
  assert.deepEqual(review.rows.map(row => row.title), ['tk28493', 'tk83939', 'tk939393', 'TK28493']);
  assert.deepEqual(review.rows.map(row => row.action), ['add', 'add', 'add', 'skip']);
  assert.ok(review.rows.every(row => row.summary === ''));
  const described = m.createPasteReview([], 'tk28493 | Checked **both ends**\ntk83939\tPulled 4 bundles\nWO-42, WO43 — Same progress', { mode: 'tickets' });
  assert.deepEqual(described.rows.map(row => row.summary), ['Checked **both ends**', 'Pulled 4 bundles', 'Same progress', 'Same progress']);
  const tasks = m.applyPasteReview([], review.rows);
  assert.equal(tasks.length, 3);
  assert.equal(m.createPasteReview(tasks, 'TK-28493 | New progress', { mode: 'tickets' }).rows[0].action, '');
  assert.throws(() => m.splitQuickNotes('tk28493 unknown words tk83939', { mode: 'tickets' }), /description|IDs/);
  assert.throws(() => m.splitQuickNotes('Row-42', { mode: 'tickets' }), /IDs/);
  assert.deepEqual(m.splitQuickNotes('', { mode: 'tickets' }), []);
  assert.deepEqual(m.splitQuickNotes('tk28493\ttk83939', { mode: 'tickets' }), ['tk28493', 'tk83939']);
});

test('shared batch values fill blanks, preserve individual edits, and survive drafts and backups', () => {
  const state = m.newState(), day = m.ensureDay(state, '2026-09-25');
  day.quickMode = 'tickets'; day.quickDraft = 'tk28493 | Individual note\ntk83939\ntk939393';
  day.pasteReview = m.createPasteReview([], day.quickDraft, { mode: 'tickets' });
  day.pasteReview.rows[0].area = 'Row 1'; day.pasteReview.rows[2].action = 'skip';
  day.pasteReview.shared = { summary: '**Checked**', category: m.CATEGORIES[2], area: 'Row 2' };
  const before = structuredClone(day.pasteReview.rows);
  day.pasteReview.rows = m.fillPasteReview(day.pasteReview.rows, { summary: '**Checked**', category: m.CATEGORIES[2], area: 'Row 2' });
  assert.equal(day.pasteReview.rows[0].summary, 'Individual note');
  assert.equal(day.pasteReview.rows[0].area, 'Row 1');
  assert.equal(day.pasteReview.rows[1].summary, '**Checked**');
  assert.deepEqual(day.pasteReview.rows[2], before[2]);
  const restored = m.parseBackup(m.exportBackup(state)).days[day.date];
  assert.equal(restored.quickMode, 'tickets');
  assert.deepEqual(restored.pasteReview.shared, day.pasteReview.shared);
  assert.deepEqual(restored.pasteReview.rows, day.pasteReview.rows);
  assert.equal(m.applyPasteReview([], restored.pasteReview.rows)[1].category, m.CATEGORIES[2]);
});

test('counts distinguish entries, unique ticket IDs and areas and follow edits, undo and report settings', () => {
  const state = m.newState(), day = m.ensureDay(state, '2026-09-25');
  day.tasks = m.applyPasteReview([], m.createPasteReview([], 'tk28493 tk83939', { mode: 'tickets' }).rows);
  day.tasks[0].category = m.CATEGORIES[2]; day.tasks[0].area = 'Row 2';
  day.tasks[1].category = m.CATEGORIES[2]; day.tasks[1].area = 'row 2';
  day.tasks.push(m.validateTask({ ...m.nextTask(), title: 'TK-28493 — Follow up', area: 'Row 10', status: 'Completed', quantity: '12' }));
  const counts = m.workCounts(day.tasks, 'category');
  assert.equal(counts.entries, 3); assert.equal(counts.tickets, 2); assert.equal(counts.areas, 2);
  assert.deepEqual(counts.rows, [[m.CATEGORIES[2], '2'], ['Uncategorized', '1']]);
  assert.deepEqual(m.workCounts(day.tasks, 'area').rows, [['Row 2', '2'], ['Row 10', '1']]);
  assert.deepEqual(m.workCounts(day.tasks, 'status').rows, [['Completed', '1'], ['No status', '2']]);
  day.countBy = 'area'; day.showCounts = true;
  const restored = m.parseBackup(m.exportBackup(state)).days[day.date];
  assert.equal(restored.countBy, 'area');
  assert.deepEqual(m.reportData(restored).counts.rows, [['Row 2', '2'], ['Row 10', '1']]);
  assert.match(m.renderReport(restored).text, /3 logged entries · 2 unique tickets · 2 rows \/ areas/);
  assert.match(m.renderReport(restored).html, /Work counts/);
  restored.showCounts = false;
  assert.doesNotMatch(m.renderReport(restored).text, /WORK COUNTS/);
  assert.equal(m.reportData(restored).counts, null);
  m.replaceTasks(day, day.tasks.slice(0, 1), 'Remove entries');
  assert.equal(m.workCounts(day.tasks).entries, 1);
  m.undoTasks(day);
  assert.equal(m.workCounts(day.tasks).entries, 3);
  const legacy = { ...state, schema: 7 }; delete legacy.days[day.date].countBy; delete legacy.days[day.date].showCounts;
  assert.equal(m.parseBackup(JSON.stringify(legacy)).days[day.date].countBy, 'category');
  assert.equal(m.workCounts([]).entries, 0);
});
