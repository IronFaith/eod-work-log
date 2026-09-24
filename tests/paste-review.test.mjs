import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../model.mjs';

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
