import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../model.mjs';
import { previewDraft } from '../preview.mjs';

test('pasted tickets offer explicit choices for earlier shifts without mixing unrelated references', () => {
  const state = model.newState(), shift = model.ensureDay(state, '2026-10-14');
  const task = model.validateTask({ ...model.nextTask(), entryType: 'ticket', title: 'Check link', ticketId: 'TK420', description: 'Original request', notes: 'Earlier progress', category: 'Repairs', area: 'Row 2', status: 'Completed' });
  shift.tasks = [task];
  const history = [{ shift, task }];
  const review = model.createPasteReview([], 'tk420\nTK4200\nRow 420', { history });
  assert.equal(review.rows[0].action, '');
  assert.equal(review.rows[0].category, 'Repairs');
  assert.equal(review.rows[0].area, 'Row 2');
  assert.equal(review.rows[0].summary, '');
  assert.equal(review.rows[1].action, 'add');
  assert.equal(review.rows[2].action, 'add');
  assert.equal(model.createPasteReview([], 'TK420 TK421', { mode: 'single', history }).rows[0].action, 'add');
});

test('continuing a pasted ticket preserves its request and history with only the new shift progress', () => {
  const state = model.newState(), source = model.ensureDay(state, '2026-10-14'), target = model.ensureDay(state, '2026-10-15');
  const task = model.validateTask({ ...model.nextTask(), entryType: 'ticket', title: 'Check link', ticketId: 'TK420', description: 'Original request', notes: 'Earlier progress', quantity: '4', breakdown: [{ length: '10', groups: '2', perGroup: '12' }], status: 'Completed' });
  source.tasks = [task];
  const history = [{ shift: source, task }], before = structuredClone(source);
  target.pasteReview = model.createPasteReview([], 'TK420', { history });
  const row = Object.assign(target.pasteReview.rows[0], { action: 'continue', targetId: task.id, sourceShiftId: source.id, summary: 'Checked replacement' });
  const preview = previewDraft([], { rows: [row], history });
  const result = model.applyPasteReview([], [row], { history });
  assert.equal(result.length, 1);
  assert.notEqual(result[0].id, task.id);
  for (const key of ['workId', 'ticketId', 'description']) assert.equal(result[0][key], task[key]);
  assert.equal(result[0].notes, 'Checked replacement');
  assert.equal(result[0].quantity, '');
  assert.deepEqual(result[0].breakdown, []);
  assert.equal(result[0].status, 'In progress');
  assert.equal(preview.tasks[0].notes, result[0].notes);
  assert.deepEqual(source, before);
  assert.equal(model.parseBackup(model.exportBackup(state)).days[target.id].pasteReview.rows[0].sourceShiftId, source.id);
  assert.throws(() => model.applyPasteReview([], [row, row], { history }), /already|once/i);
  assert.throws(() => model.applyPasteReview(result, [row], { history }), /already/i);
  assert.throws(() => model.applyPasteReview([], [{ ...row, title: 'TK421' }], { history }), /match/i);
  assert.throws(() => model.applyPasteReview([], [row]), /match|available/i);
  assert.equal(model.applyPasteReview([], [row], { history, logged: false })[0].logged, false);
});

test('new days inherit paste preferences and review edits survive a backup', () => {
  const state = model.newState();
  state.pastePreferences = { mode: 'blocks', headers: false };
  const day = model.ensureDay(state, '2026-09-25');
  assert.equal(day.quickMode, 'blocks');
  assert.equal(day.quickTableHeaders, false);
  day.quickDraft = 'INC-204 — Check link\nOriginal note';
  day.pasteReview = model.createPasteReview([], day.quickDraft, { mode: 'single', headers: false });
  day.pasteReview.rows[0].summary = 'Edited result';
  const restored = model.parseBackup(model.exportBackup(state));
  assert.equal(restored.days[day.date].pasteReview.rows[0].summary, 'Edited result');
  assert.equal(model.ensureDay(restored, '2026-09-26').quickMode, 'blocks');
  assert.equal(model.mergeBackup(model.newState(), restored).pastePreferences.mode, 'blocks');
});

test('paste review suggests lossless fields and requires a decision for exact ticket matches', () => {
  const existing = model.quickTasks('INC-204 — Working on link\nNotes for another task', { mode: 'single' });
  const review = model.createPasteReview(existing, 'inc204 — Check link\nRestored link.\n\nINC-2040 — New work\nVerified.', { mode: 'blocks' });
  assert.equal(review.rows[0].title, 'inc204 — Check link');
  assert.equal(review.rows[0].summary, 'Restored link.');
  assert.equal(review.rows[0].action, '');
  assert.deepEqual(model.ticketMatches(existing, review.rows[0]).map(task => task.id), [existing[0].id]);
  assert.equal(review.rows[1].action, 'add');
  assert.equal(model.ticketMatches(existing, { title: 'Row 204', summary: 'See INC-204' }).length, 0);
  assert.equal(model.ticketMatches(existing, { title: 'INC-204 / INC-205', summary: '' }).length, 0);
  const long = 'x'.repeat(240);
  const longRow = model.createPasteReview([], long, { mode: 'single' }).rows[0];
  assert.equal(longRow.title, '');
  assert.equal(longRow.summary, long);
  const repeated = model.createPasteReview([], 'WO-42 — Checked\n\nWO42 — Fixed', { mode: 'blocks' });
  assert.equal(repeated.rows[1].action, 'skip');
});

test('review applies explicit updates atomically while preserving detailed ticket fields', () => {
  const original = model.validateTask({ ...model.nextTask(), entryType: 'ticket', title: 'Check link', ticketId: 'INC-204', description: 'Original request', notes: 'Old result', quantity: '4', status: 'In progress' });
  const tasks = [original];
  const row = { title: 'INC-204 — Check link', summary: 'Link stable', action: 'update', targetId: original.id };
  const result = model.applyPasteReview(tasks, [row]);
  assert.equal(result.length, 1);
  assert.equal(result[0].notes, 'Link stable');
  for (const key of ['id', 'ticketId', 'description', 'quantity', 'status']) assert.equal(result[0][key], original[key]);
  assert.equal(original.notes, 'Old result');
  const separate = model.applyPasteReview(tasks, [{ ...row, action: 'add', targetId: '' }]);
  assert.equal(separate.length, 2);
  assert.equal(separate[1].summary, 'Link stable');
  assert.throws(() => model.applyPasteReview(tasks, [row, row]), /once/i);
  assert.throws(() => model.applyPasteReview(tasks, [{ ...row, title: 'INC-205 — Different ticket' }]), /match/i);
  assert.throws(() => model.applyPasteReview(tasks, [{ ...row, action: '' }]), /choose/i);
  assert.equal(tasks[0].notes, 'Old result');
  assert.deepEqual(model.applyPasteReview(tasks, [{ ...row, action: 'skip' }]), tasks);
});
