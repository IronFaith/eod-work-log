export const STORAGE_KEY = 'eod-work-log:v1';
export const KINDS = ['Pulling fiber', 'Rolling / bundling', 'Labeling', 'Dressing fiber', 'Rework', 'Testing', 'Housekeeping', 'Custom task'];
export const UNITS = ['bundles', 'fibers', 'cables', 'connections', 'items'];
export const STATUSES = ['In progress', 'Completed', 'Blocked'];
export const ENTRY_TYPES = ['field', 'ticket', 'general', 'quick'];
const HEADER_KEYS = ['location', 'supervisor', 'lead', 'crew', 'start', 'end'];
export const blankHeader = () => Object.fromEntries(HEADER_KEYS.map(key => [key, '']));
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return !Number.isNaN(parsed.getTime()) && localDate(parsed) === value;
}
export function newState() { return { schema: 3, defaults: blankHeader(), days: {} }; }
export function ensureDay(state, date) {
  if (!validDate(date)) throw new Error('Choose a valid date.');
  if (!Object.hasOwn(state.days, date)) state.days[date] = {
    date, header: { ...state.defaults }, tasks: [], quickDraft: '', blockerState: 'Not reviewed', blockers: '', carryover: '', updatedAt: ''
  };
  return state.days[date];
}
export function nextTask(previous = {}) {
  return { id: crypto.randomUUID(), entryType: ENTRY_TYPES.includes(previous.entryType) ? previous.entryType : 'field', summary: '', title: '', ticketId: '', description: '', kind: KINDS.includes(previous.kind) ? previous.kind : KINDS[0], custom: previous.custom || '', area: '', zEnd: '', quantity: '', unit: UNITS.includes(previous.unit) ? previous.unit : 'bundles', status: previous.entryType === 'quick' ? '' : 'In progress', notes: '', breakdown: [] };
}
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const lines = value => escapeHTML(value).replace(/\n/g, '<br>\n');
export const taskName = task => task.entryType === 'quick' ? task.summary : task.title || (task.kind === 'Custom task' ? task.custom : task.kind);
export function taskDetails(task, { detailed = true } = {}) {
  if (task.entryType === 'quick') return '';
  const parts = [];
  if (detailed && task.description) parts.push(`Description: ${task.description}`);
  if (task.notes) parts.push(detailed ? `Work performed: ${task.notes}` : task.notes);
  if (task.quantity !== '') parts.push(`${task.quantity} ${task.unit}`);
  for (const row of task.breakdown) {
    const groups = Number(row.groups), count = Number(row.perGroup);
    parts.push(`${Number(row.length)} m: ${groups} ${groups === 1 ? 'group' : 'groups'} × ${count} fibers = ${groups * count} fibers`);
  }
  if (task.zEnd) parts.push(`Z-end: ${task.zEnd}`);
  return parts.join('\n');
}
export function quickTasks(source) {
  return textField(source).split(/\r\n|\n|\r/).map(line => line.trim()).filter(Boolean).map(summary => validateTask({ ...nextTask(), entryType: 'quick', summary, status: '' }));
}
export function taskSummary(task) {
  if (task.entryType === 'quick') return task.summary;
  const identity = [taskName(task), task.ticketId, task.area].filter(Boolean).join(' · ');
  return [identity, taskDetails(task, { detailed: false })].filter(Boolean).join('\n');
}
export function reportWarnings(day) {
  const warnings = [];
  if (!day.header.start || !day.header.end) warnings.push('Add shift start and end times.');
  if (!day.header.location.trim()) warnings.push('Add the work location.');
  if (!day.header.supervisor.trim()) warnings.push('Add the supervisor.');
  if (!day.header.crew.trim()) warnings.push('Add your crew.');
  if (!day.tasks.length) warnings.push('Add at least one task.');
  if (day.quickDraft?.trim()) warnings.push('Add your quick notes to the log before sharing.');
  if (day.blockerState === 'Not reviewed') warnings.push('Review blockers: choose None or Reported.');
  if (day.blockerState === 'Reported' && !day.blockers.trim()) warnings.push('Describe the reported blocker.');
  return warnings;
}
function clockLabel(value) {
  if (!value) return 'Not recorded';
  const [hours, minutes] = value.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}
export function reportData(day, { detailed = false } = {}) {
  const dateLabel = new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const heading = `${reportWarnings(day).length ? 'Draft EOD' : 'EOD'} — ${dateLabel}`;
  const header = [['Shift', `${clockLabel(day.header.start)}–${clockLabel(day.header.end)}`], ['Location', day.header.location || 'Not recorded'], ['Supervisor', day.header.supervisor || 'Not recorded'], ['Acting lead', day.header.lead || 'Not recorded'], ['Crew', day.header.crew || 'Not recorded']];
  const hasLocation = day.tasks.some(task => task.area);
  const hasStatus = day.tasks.some(task => task.status);
  const labels = detailed ? ['Work / ticket', ...(hasLocation ? ['Row / location'] : []), 'Description / progress', 'Status'] : ['Production / update', ...(hasStatus ? ['Status'] : [])];
  const taskRows = day.tasks.map(task => detailed ? [[taskName(task), task.ticketId ? `Ticket: ${task.ticketId}` : ''].filter(Boolean).join('\n'), ...(hasLocation ? [task.area || '—'] : []), taskDetails(task) || '—', task.status || '—'] : [taskSummary(task), ...(hasStatus ? [task.status || '—'] : [])]);
  const blockers = day.blockerState === 'None' ? 'None.' : day.blockerState === 'Reported' ? day.blockers || 'Details not recorded.' : 'Not reviewed.';
  return { heading, header, labels, taskRows, blockers, carryover: day.carryover.trim() };
}
export function renderReport(day, options = {}) {
  const { heading, header, labels, taskRows, blockers, carryover } = reportData(day, options);
  const updates = day.tasks.map((task, index) => {
    if (!options.detailed || task.entryType === 'quick') return `${index + 1}. ${taskSummary(task)}${task.status ? `\nStatus: ${task.status}` : ''}`;
    return [`${index + 1}. ${taskName(task)}`, task.ticketId ? `Ticket: ${task.ticketId}` : '', task.area ? `Location: ${task.area}` : '', taskDetails(task), `Status: ${task.status}`].filter(Boolean).join('\n');
  });
  const cell = 'border:1px solid #b5bec7;padding:9px;text-align:left;vertical-align:top;';
  const table = (labels, rows) => `<table border="1" cellpadding="9" cellspacing="0" style="border-collapse:collapse;width:100%;margin:12px 0;font:14px Arial,sans-serif;">\n<thead><tr>${labels.map(label => `<th style="${cell}background:#edf1f5;">${lines(label)}</th>`).join('\t')}</tr></thead>\n<tbody>\n${rows.map(row => `<tr>${row.map(value => `<td style="${cell}">${lines(value)}</td>`).join('\t')}</tr>`).join('\n')}\n</tbody></table>\n`;
  return {
    html: `<div style="font:14px Arial,sans-serif;color:#16283b;"><h1 style="font-size:22px;">${escapeHTML(heading)}</h1>\n<h2 style="font-size:17px;">Shift details</h2>\n${table(['Shift details', 'Information'], header)}<h2 style="font-size:17px;">Production updates</h2>\n${taskRows.length ? table(labels, taskRows) : '<p>No tasks recorded.</p>\n'}<h2 style="font-size:17px;">Blockers</h2>\n<p>${lines(blockers)}</p>\n${carryover ? `<h2 style="font-size:17px;">Carryover / next shift</h2>\n<p>${lines(carryover)}</p>\n` : ''}</div>`,
    text: `${heading}\n\nSHIFT DETAILS\n${header.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nPRODUCTION UPDATES\n${updates.length ? updates.join('\n\n') : 'No tasks recorded.'}\n\nBLOCKERS\n${blockers}${carryover ? `\n\nCARRYOVER / NEXT SHIFT\n${carryover}` : ''}`
  };
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function textField(value, limit = 12000) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > limit) throw new Error('This backup contains an invalid text field.');
  return value;
}
function headerFrom(value) {
  if (!isObject(value)) throw new Error('This backup has invalid shift details.');
  const header = Object.fromEntries(HEADER_KEYS.map(key => [key, textField(value[key])]));
  for (const time of [header.start, header.end]) if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('This backup has an invalid shift time.');
  return header;
}
function positive(value, whole = false) {
  const number = Number(value);
  if (value === '' || value === null || !Number.isFinite(number) || number <= 0 || number > 1e7 || (whole && !Number.isInteger(number))) throw new Error('Enter a positive number for each cable breakdown field.');
  return number;
}
export function validateTask(value) {
  if (!isObject(value) || !KINDS.includes(value.kind) || !UNITS.includes(value.unit) || !(value.entryType === 'quick' ? value.status === '' : STATUSES.includes(value.status)) || !Array.isArray(value.breakdown) || value.breakdown.length > 100) throw new Error('This task contains invalid values.');
  const quantity = String(value.quantity ?? '');
  if (quantity !== '' && (!/^\d+$/.test(quantity) || Number(quantity) > 1e7)) throw new Error('Quantity must be a whole number of zero or more.');
  const task = { id: textField(value.id, 100) || crypto.randomUUID(), kind: value.kind, custom: textField(value.custom, 160), area: textField(value.area, 200), zEnd: textField(value.zEnd, 200), quantity, unit: value.unit, status: value.status, notes: textField(value.notes), breakdown: value.breakdown.map(row => {
    if (!isObject(row)) throw new Error('Invalid cable breakdown.');
    return { length: positive(row.length), groups: positive(row.groups, true), perGroup: positive(row.perGroup, true) };
  }) };
  task.entryType = value.entryType ?? 'field';
  if (!ENTRY_TYPES.includes(task.entryType)) throw new Error('Choose a valid work entry type.');
  task.title = textField(value.title, 200);
  task.ticketId = textField(value.ticketId, 160);
  task.description = textField(value.description);
  task.summary = textField(value.summary);
  if (task.entryType === 'quick' && !task.summary.trim()) throw new Error('Add a short production update.');
  if (['ticket', 'general'].includes(task.entryType) && !task.title.trim()) throw new Error('Add a short title for this work.');
  if (task.entryType === 'field' && task.kind === 'Custom task' && !task.custom.trim()) throw new Error('Give your custom task a name.');
  return task;
}
export function parseBackup(source) {
  if (typeof source !== 'string' || source.length > 5e6) throw new Error('Choose an EOD backup smaller than 5 MB.');
  let raw;
  try { raw = JSON.parse(source); } catch { throw new Error('This file is not a valid JSON backup.'); }
  if (!isObject(raw) || ![1, 2, 3].includes(raw.schema) || !isObject(raw.days) || Object.keys(raw.days).length > 5000) throw new Error('This is not a supported EOD backup.');
  const state = newState();
  state.defaults = headerFrom(raw.defaults);
  for (const [date, value] of Object.entries(raw.days)) {
    if (!validDate(date) || !isObject(value) || value.date !== date || !Array.isArray(value.tasks) || value.tasks.length > 1000 || !['None', 'Reported', 'Not reviewed'].includes(value.blockerState)) throw new Error('This backup contains an invalid day.');
    const tasks = value.tasks.map(validateTask);
    if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('This backup contains duplicate task IDs.');
    state.days[date] = { date, header: headerFrom(value.header), tasks, quickDraft: textField(value.quickDraft), blockerState: value.blockerState, blockers: textField(value.blockers), carryover: textField(value.carryover), updatedAt: textField(value.updatedAt, 100) };
  }
  return state;
}
export const exportBackup = state => JSON.stringify(state, null, 2);
export function hasDayContent(day, defaults) {
  return Boolean(day.updatedAt || day.tasks.length || day.quickDraft || day.blockers || day.carryover || day.blockerState !== 'Not reviewed' || HEADER_KEYS.some(key => day.header[key] !== defaults[key]));
}
export function mergeBackup(current, incoming) {
  const days = { ...incoming.days };
  for (const [date, day] of Object.entries(current.days)) {
    if (!Object.hasOwn(days, date) || hasDayContent(day, current.defaults)) days[date] = day;
  }
  return { schema: 3, defaults: Object.values(current.defaults).some(Boolean) ? { ...current.defaults } : { ...incoming.defaults }, days };
}
