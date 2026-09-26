import { applyPasteReview, validateTask } from './model.mjs?v=4.0';

// Project the current form onto a copy of the log. Previewing never saves work.
export function previewDraft(savedTasks, { task, editingId = null, rows } = {}) {
  if (rows) {
    const included = rows.filter(row => row.action === 'add' || row.action === 'update');
    const allTasks = applyPasteReview(savedTasks, included);
    const existing = new Set(savedTasks.map(task => task.id));
    const updated = new Set(included.filter(row => row.action === 'update').map(row => row.targetId));
    return { tasks: allTasks.filter(task => !existing.has(task.id) || updated.has(task.id)), allTasks, pending: rows.filter(row => !row.action).length, skipped: rows.filter(row => row.action === 'skip').length };
  }
  if (!task) return { tasks: [], allTasks: savedTasks, pending: 0, skipped: 0 };
  const checked = validateTask(task);
  if (editingId && !savedTasks.some(task => task.id === editingId)) throw new Error('This entry is no longer in the log.');
  const allTasks = editingId ? savedTasks.map(task => task.id === editingId ? checked : task) : [...savedTasks, checked];
  return { tasks: [checked], allTasks, pending: 0, skipped: 0 };
}
