import test from 'node:test';
import assert from 'node:assert/strict';
import { previewDraft } from '../preview.mjs';
import { newState, ensureDay, nextTask, validateTask, createPasteReview, renderReport, renderProductionTables } from '../model.mjs';

test('field drafts preview the same compact and full-detail tables without saving them', () => {
  const day = ensureDay(newState(), '2026-09-25');
  const task = { ...nextTask(), area: 'Row A', quantity: '4', description: 'Original request', notes: 'Pulled <4> bundles', breakdown: [{ length: 11, groups: 2, perGroup: 16 }] };
  const preview = previewDraft(day.tasks, { task });
  assert.equal(day.tasks.length, 0);
  assert.equal(preview.tasks.length, 1);
  for (const detailed of [false, true]) {
    const table = renderProductionTables(preview.tasks, { detailed, columnTasks: preview.allTasks });
    assert.ok(renderReport({ ...day, tasks: preview.allTasks }, { detailed }).html.includes(table));
    assert.match(table, /32 fibers/);
    assert.match(table, /Pulled &lt;4&gt; bundles/);
    assert.equal(table.includes('Original request'), detailed);
    assert.equal(table.includes('Row / location'), detailed);
  }
});

test('batch preview respects grouping, saved ticket details, skipped rows and pending choices', () => {
  const original = validateTask({ ...nextTask(), entryType: 'ticket', title: 'Pull fiber', ticketId: 'WO-42', notes: 'Old progress', quantity: '4', area: 'Row A' });
  const saved = [original], before = structuredClone(saved);
  const review = createPasteReview(saved, 'WO-42 — Pull fiber\nNew progress\n\nDress cables\nBundled 2 runs.\n\nSkip this', { mode: 'blocks' });
  review.rows[2].action = 'skip';
  let preview = previewDraft(saved, { rows: review.rows });
  assert.equal(preview.pending, 1);
  assert.equal(preview.skipped, 1);
  assert.equal(preview.tasks.length, 1);
  assert.match(renderProductionTables(preview.tasks, { columnTasks: preview.allTasks }), /Status/);
  Object.assign(review.rows[0], { action: 'update', targetId: original.id });
  preview = previewDraft(saved, { rows: review.rows });
  assert.equal(preview.tasks.length, 2);
  assert.equal(preview.allTasks.length, 2);
  assert.equal(preview.tasks[0].quantity, '4');
  assert.equal(preview.tasks[0].notes, 'New progress');
  assert.deepEqual(saved, before);
  const tableRows = createPasteReview([], 'Ticket\tProgress\nWO-51\tChecked\nWO-52\tInstalled', { mode: 'table', headers: true }).rows;
  assert.equal(previewDraft([], { rows: tableRows }).tasks.length, 2);
});

test('inline preview replaces only the selected entry and invalid drafts leave the log intact', () => {
  const original = validateTask({ ...nextTask({ entryType: 'quick' }), title: 'Original title', summary: 'Old progress' });
  const saved = [original], before = structuredClone(saved);
  const preview = previewDraft(saved, { editingId: original.id, task: { ...original, summary: 'Edited progress', area: 'Row 2' } });
  assert.equal(preview.allTasks.length, 1);
  assert.equal(preview.allTasks[0].summary, 'Edited progress');
  assert.equal(preview.allTasks[0].area, 'Row 2');
  assert.throws(() => previewDraft(saved, { task: { ...nextTask(), breakdown: [{ length: '', groups: 2, perGroup: 16 }] } }), /positive number/);
  assert.throws(() => previewDraft(saved, { task: original, editingId: 'missing' }), /no longer/);
  assert.deepEqual(saved, before);
});
