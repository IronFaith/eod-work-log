import { ensureDay, localDate, validDate, validateTask } from './model.mjs?v=5.1';

export function weekDates(date) {
  if (!validDate(date)) throw new Error('Choose a valid date.');
  const first = new Date(`${date}T12:00:00`);
  first.setDate(first.getDate() - (first.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, index) => { const day = new Date(first); day.setDate(first.getDate() + index); return localDate(day); });
}

export function createShift(state, date, { name = '', presetId = '' } = {}) {
  if (!validDate(date)) throw new Error('Choose a valid date.');
  if (typeof name !== 'string' || name.length > 80) throw new Error('Use a shift name of up to 80 characters.');
  const preset = presetId ? state.shiftPresets.find(item => item.id === presetId) : null;
  if (presetId && !preset) throw new Error('Choose a saved shift preset.');
  if (Object.keys(state.days).length >= 5000) throw new Error('Keep up to 5,000 shifts in this planner.');
  const existing = state.days[date];
  const occupied = existing && (existing.updatedAt || existing.tasks.length || existing.shiftName || existing.updateTitleDraft || existing.updateDescriptionDraft || existing.quickDraft || existing.pasteReview || existing.blockers || existing.carryover);
  const id = occupied ? `${date}~${crypto.randomUUID()}` : date;
  const shift = ensureDay(state, date, id);
  shift.shiftName = name.trim();
  if (preset) { shift.header = { ...preset.header }; shift.shiftDuration = preset.duration; shift.crewMembers = structuredClone(preset.crewMembers); if (!shift.shiftName) shift.shiftName = preset.name; }
  shift.updatedAt = new Date().toISOString();
  return shift;
}

export function taskTimeline(state, workId) {
  return Object.values(state.days).flatMap(shift => shift.tasks.filter(task => task.workId === workId).map(task => ({ shift, task })))
    .sort((a, b) => a.shift.date.localeCompare(b.shift.date) || a.shift.header.start.localeCompare(b.shift.header.start) || a.shift.id.localeCompare(b.shift.id));
}

export function availableWork(state, targetId) {
  const latest = new Map(), target = state.days[targetId];
  for (const shift of Object.values(state.days).filter(shift => shift.id !== targetId && shift.date <= target.date).sort((a, b) => a.date.localeCompare(b.date) || a.header.start.localeCompare(b.header.start))) {
    for (const task of shift.tasks) latest.set(task.workId, { shift, task });
  }
  return [...latest.values()].filter(({ task }) => task.status !== 'Completed' && (task.title || task.entryType !== 'quick') && !target.tasks.some(item => item.workId === task.workId));
}

export function assignWork(state, sourceId, taskId, targetId) {
  const source = state.days[sourceId], target = state.days[targetId], task = source?.tasks.find(item => item.id === taskId);
  if (!source || !target || !task) throw new Error('This work or shift is no longer available.');
  if (sourceId === targetId || target.tasks.some(item => item.workId === task.workId)) throw new Error('This work is already on the selected shift.');
  if (task.status === 'Completed') throw new Error('Reopen completed work before assigning it to another shift.');
  if (!task.title && task.entryType === 'quick') throw new Error('Give this older update a short title before continuing it.');
  if (target.tasks.length >= 1000) throw new Error('Use up to 1,000 entries per shift.');
  return validateTask({ ...task, id: crypto.randomUUID(), logged: false, summary: '', notes: '', quantity: '', breakdown: [], status: 'In progress', carriedFrom: '' });
}

export function detectPaste(source) {
  const text = source.trim();
  if (!text) return null;
  const ids = text.split(/[\s,;]+/);
  if (ids.length > 1 && ids.every(id => /^(?:(?:TK|INC|REQ|RITM|SCTASK|TASK|CHG|SR|WO)-?\d+|[A-Z][A-Z0-9]{1,11}-\d+)$/i.test(id) && !/^(ROW|RACK|ROOM)-/i.test(id))) return { mode: 'tickets', headers: false };
  if (/\t/.test(text)) return { mode: 'table', headers: /^(title|ticket|work|task|description|category|area)\b/i.test(text) };
  if (/^(title|ticket|work|task),/i.test(text)) return { mode: 'csv', headers: true };
  if (/\n/.test(text)) return { mode: 'lines', headers: false };
  return null;
}
