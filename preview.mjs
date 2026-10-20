import { applyPasteReview, validateTask, nextTask } from './model.mjs?v=5.5';

// Project the current form onto a copy of the log. Previewing never saves work.
export function previewDraft(savedTasks, { task, editingId = null, rows, logged = true, status = '', history = [] } = {}) {
  if (rows) {
    const included = rows.filter(row => ['add', 'update', 'continue'].includes(row.action));
    const allTasks = applyPasteReview(savedTasks, included, { logged, status, history });
    const existing = new Set(savedTasks.map(task => task.id));
    const updated = new Set(included.filter(row => row.action === 'update').map(row => row.targetId));
    const pending = rows.filter(row => !row.action);
    const drafts = pending.map(row => validateTask({ ...nextTask({ entryType: 'quick' }), title: row.title, summary: row.summary, category: row.category || '', area: row.area || '', logged, status: row.status || status }));
    return { tasks: [...allTasks.filter(task => !existing.has(task.id) || updated.has(task.id)), ...drafts], allTasks, pending: pending.length, skipped: rows.filter(row => row.action === 'skip').length };
  }
  if (!task) return { tasks: [], allTasks: savedTasks, pending: 0, skipped: 0 };
  const checked = validateTask(task);
  if (editingId && !savedTasks.some(task => task.id === editingId)) throw new Error('This entry is no longer in the log.');
  const allTasks = editingId ? savedTasks.map(task => task.id === editingId ? checked : task) : [...savedTasks, checked];
  return { tasks: [checked], allTasks, pending: 0, skipped: 0 };
}
