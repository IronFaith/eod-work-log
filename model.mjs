import { escapeHTML, richText, readableText, displayText, teamsDestination } from './links.mjs?v=3.8';
export { escapeHTML };
export const STORAGE_KEY = 'eod-work-log:v1';
export const KINDS = ['Pulling fiber', 'Rolling / bundling', 'Labeling', 'Dressing fiber', 'Rework', 'Testing', 'Housekeeping', 'Custom task'];
export const UNITS = ['bundles', 'fibers', 'cables', 'connections', 'items'];
export const STATUSES = ['In progress', 'Completed', 'Blocked'];
export const ENTRY_TYPES = ['field', 'ticket', 'general', 'quick'];
export const QUICK_MODES = ['lines', 'single', 'blocks', 'table'];
export const CATEGORIES = ['Pulling / installation', 'Dressing / bundling', 'Labeling / testing', 'Rework / troubleshooting', 'General / support'];
export function suggestCategory(text) {
  text = displayText(text).replace(/\b[A-Z][A-Z0-9]{1,11}-\d+\b/gi, '');
  const patterns = [/\b(pull(?:ing|ed)?|install(?:ing|ed|ation)?)\b/i, /\b(dress(?:ing|ed)?|bundl(?:ed|ing)|roll(?:ing|ed)?)\b|\bbundle\s+(?:cables?|fibers?)\b/i, /\b(label(?:s|ing|ed)?|test(?:s|ing|ed)?)\b/i, /\b(rework|troubleshoot(?:ing)?|repair(?:ing|ed)?)\b/i, /\b(housekeeping|cleanup|cleaning|support)\b/i];
  const matches = CATEGORIES.filter((_, index) => patterns[index].test(text));
  return matches.length === 1 ? matches[0] : '';
}
export function groupTasks(tasks, view = 'category') {
  if (view === 'all') return [{ label: '', tasks }];
  const groups = new Map();
  for (const task of tasks) {
    const label = (view === 'area' ? task.area : task.category)?.trim() || '';
    const key = label.toLocaleLowerCase();
    if (!groups.has(key)) groups.set(key, { label, tasks: [] });
    groups.get(key).tasks.push(task);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.label) return 1;
    if (!b.label) return -1;
    return view === 'category' ? CATEGORIES.indexOf(a.label) - CATEGORIES.indexOf(b.label) : a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
  }).map(group => ({ ...group, label: group.label || (view === 'area' ? 'No row / area' : 'Uncategorized') }));
}
export function replaceTasks(day, tasks, label) {
  if (tasks.length > 1000) throw new Error('Use up to 1,000 entries per day.');
  const checked = tasks.map(validateTask);
  if (new Set(checked.map(task => task.id)).size !== checked.length) throw new Error('Each entry must have its own ID.');
  day.undo = { label, tasks: structuredClone(day.tasks) };
  day.tasks = checked;
}
export function undoTasks(day) {
  if (!day.undo) return false;
  day.tasks = day.undo.tasks;
  day.undo = null;
  return true;
}
export function carryTasks(source, target, ids) {
  if (source.date >= target.date) throw new Error('Choose an earlier work day.');
  const result = [...target.tasks];
  for (const id of new Set(ids)) {
    const task = source.tasks.find(task => task.id === id);
    if (!task || task.status === 'Completed') throw new Error('This entry is missing or completed.');
    const carriedFrom = `${source.date}:${id}`;
    if (result.some(item => item.carriedFrom === carriedFrom) || ticketMatches(result, task).length) throw new Error('This work is already in the selected day’s log.');
    // A legacy note needs a title before its old production text can be cleared.
    if (task.entryType === 'quick' && !task.title) throw new Error('Give this older update a short title before bringing it forward.');
    result.push(validateTask({ ...task, id: crypto.randomUUID(), carriedFrom, summary: '', notes: '', quantity: '', breakdown: [], status: task.entryType === 'quick' ? '' : 'In progress' }));
  }
  if (result.length > 1000) throw new Error('Use up to 1,000 entries per day.');
  return result;
}
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
export function newState() { return { schema: 7, defaults: blankHeader(), pastePreferences: null, teamsTarget: '', days: {} }; }
export function ensureDay(state, date) {
  if (!validDate(date)) throw new Error('Choose a valid date.');
  if (!Object.hasOwn(state.days, date)) state.days[date] = {
    date, header: { ...state.defaults }, tasks: [], undo: null, updateCategoryDraft: 'auto', updateAreaDraft: '', updateTitleDraft: '', updateDescriptionDraft: '', quickDraft: '', pasteReview: null, quickMode: state.pastePreferences?.mode || 'lines', quickTableHeaders: state.pastePreferences?.headers !== false, blockerState: 'Not reviewed', blockers: '', carryover: '', updatedAt: ''
  };
  return state.days[date];
}
export function nextTask(previous = {}) {
  return { id: crypto.randomUUID(), entryType: ENTRY_TYPES.includes(previous.entryType) ? previous.entryType : 'field', summary: '', title: '', ticketId: '', description: '', kind: KINDS.includes(previous.kind) ? previous.kind : KINDS[0], custom: previous.custom || '', category: previous.category || '', carriedFrom: '', area: '', zEnd: '', quantity: '', unit: UNITS.includes(previous.unit) ? previous.unit : 'bundles', status: previous.entryType === 'quick' ? '' : 'In progress', notes: '', breakdown: [] };
}
const lines = richText;
export const taskName = task => task.entryType === 'quick' ? task.title || task.summary : task.title || (task.kind === 'Custom task' ? task.custom : task.kind);
export function taskDetails(task, { detailed = true } = {}) {
  if (task.entryType === 'quick') return task.title ? task.summary : '';
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
function pastedTable(source) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') quoted = true;
    else if (char === '\t' || char === '\n') {
      row.push(cell.trim()); cell = '';
      if (char === '\n') { rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error('A table cell has an unclosed quote. Copy the complete rows, or choose One whole ticket / note.');
  row.push(cell.trim()); rows.push(row);
  return rows.filter(values => values.some(Boolean));
}
export function splitQuickNotes(source, { mode = 'lines', headers = false } = {}) {
  const text = textField(source).replace(/\r\n|\r/g, '\n');
  if (!QUICK_MODES.includes(mode)) throw new Error('Choose how to separate your pasted updates.');
  if (mode === 'table') {
    const rows = pastedTable(text);
    const names = headers ? rows.shift() || [] : [];
    return rows.map(row => row.map((value, index) => value ? (headers ? `${names[index] || `Column ${index + 1}`}: ${value}` : value) : '').filter(Boolean).join(headers ? '\n' : ' · '));
  }
  const parts = mode === 'single' ? [text] : text.split(mode === 'blocks' ? /\n[\t ]*\n+/ : /\n/);
  return parts.map(part => part.trim()).filter(Boolean);
}
export function quickTasks(source, options = {}) {
  return splitQuickNotes(source, options).map(summary => validateTask({ ...nextTask(), entryType: 'quick', summary, status: '' }));
}
export function taskSummary(task) {
  if (task.entryType === 'quick') return [[task.title, task.area].filter(Boolean).join(' · '), task.summary].filter(Boolean).join('\n');
  const identity = [taskName(task), task.ticketId, task.area].filter(Boolean).join(' · ');
  return [identity, taskDetails(task, { detailed: false })].filter(Boolean).join('\n');
}
function ticketKey(task) {
  const identity = displayText(task.ticketId || task.title || (task.summary || '').split('\n')[0]);
  const refs = identity.match(/\b(?:INC|REQ|RITM|SCTASK|TASK|CHG|SR|WO)[ -]?\d+\b|\b[A-Z][A-Z0-9]{1,11}-\d+\b/gi) || [];
  const keys = [...new Set(refs.filter(ref => !/^(ROW|RACK|ROOM)-/i.test(ref)).map(ref => ref.toUpperCase().replace(/[ -]/g, '')))];
  return keys.length === 1 ? keys[0] : '';
}
export function ticketMatches(tasks, update) {
  const key = ticketKey(update);
  return key ? tasks.filter(task => ticketKey(task) === key) : [];
}
export function createPasteReview(tasks, source, { mode = 'lines', headers = false } = {}) {
  const summaries = splitQuickNotes(source, { mode, headers });
  if (summaries.length > 1000) throw new Error('Review up to 1,000 updates at a time.');
  const seen = new Set(), existing = new Set(tasks.map(task => (task.entryType === 'quick' ? [task.title, task.summary].filter(Boolean).join('\n') : taskSummary(task)).trim()));
  const rows = summaries.map(text => {
    const [first, ...rest] = text.split('\n');
    const row = { title: first.length <= 200 ? first : '', summary: first.length <= 200 ? rest.join('\n').trim() : text, action: 'add', targetId: '' };
    const matches = ticketMatches(tasks, row);
    row.category = matches.length === 1 ? matches[0].category || '' : suggestCategory(text);
    row.area = matches.length === 1 ? matches[0].area : '';
    const key = ticketKey(row) || text;
    if (existing.has(text) || seen.has(key)) row.action = 'skip';
    else if (matches.length) row.action = '';
    seen.add(key);
    return row;
  });
  return { source, mode, headers, rows };
}
export function applyPasteReview(tasks, rows) {
  const result = [...tasks], updated = new Set();
  for (const row of rows) {
    if (row.action === 'skip') continue;
    if (!['add', 'update'].includes(row.action)) throw new Error('Choose how to save each matching ticket.');
    if (!row.title.trim()) throw new Error('Add a short title for each included update.');
    const title = row.title.trim(), summary = row.summary.trim();
    if (row.action === 'add') result.push(validateTask({ ...nextTask(), entryType: 'quick', title, summary, category: row.category || '', area: row.area || '', status: '' }));
    else {
      const index = tasks.findIndex(task => task.id === row.targetId);
      if (index < 0 || !ticketMatches(tasks, row).some(task => task.id === row.targetId)) throw new Error('The selected entry no longer matches this ticket. Review your choice.');
      if (updated.has(row.targetId)) throw new Error('Update each existing entry only once per batch. Skip or add the other update separately.');
      updated.add(row.targetId);
      const original = tasks[index];
      result[index] = validateTask({ ...original, title, category: row.category ?? original.category, area: row.area ?? original.area, ...(original.entryType === 'quick' ? { summary } : { notes: summary }) });
    }
  }
  if (result.length > 1000) throw new Error('Use up to 1,000 entries per day.');
  return result;
}
export function reportWarnings(day) {
  const warnings = [];
  if (!day.header.start || !day.header.end) warnings.push('Add shift start and end times.');
  if (!day.header.location.trim()) warnings.push('Add the work location.');
  if (!day.header.supervisor.trim()) warnings.push('Add the supervisor.');
  if (!day.header.crew.trim()) warnings.push('Add your crew.');
  if (!day.tasks.length) warnings.push('Add at least one task.');
  if (day.updateTitleDraft?.trim() || day.updateDescriptionDraft?.trim()) warnings.push('Add your draft update to the log before sharing.');
  if (day.quickDraft?.trim() || day.pasteReview?.rows.length) warnings.push('Add your quick notes to the log before sharing.');
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
  const header = [['Shift', `${clockLabel(day.header.start)}–${clockLabel(day.header.end)}`], ['Location', day.header.location || 'Not recorded'], ['Supervisor', day.header.supervisor || 'Not recorded'], ...(day.header.lead.trim() ? [['Acting lead', day.header.lead.trim()]] : []), ['Crew', day.header.crew || 'Not recorded']];
  const production = productionData(day.tasks, { detailed });
  const blockers = day.blockerState === 'None' ? 'None.' : day.blockerState === 'Reported' ? day.blockers || 'Details not recorded.' : 'Not reviewed.';
  return { heading, header, ...production, blockers, carryover: day.carryover.trim() };
}
function productionData(tasks, { detailed = false, columnTasks = tasks } = {}) {
  const hasLocation = columnTasks.some(task => task.area);
  const hasStatus = columnTasks.some(task => task.status);
  const labels = detailed ? ['Work / ticket', ...(hasLocation ? ['Row / location'] : []), 'Description / progress', 'Status'] : ['Production / update', ...(hasStatus ? ['Status'] : [])];
  const taskGroups = groupTasks(tasks).map(group => ({ ...group, rows: group.tasks.map(task => detailed ? [[taskName(task), task.ticketId ? `Ticket: ${task.ticketId}` : ''].filter(Boolean).join('\n'), ...(hasLocation ? [task.area || '—'] : []), taskDetails(task) || '—', task.status || '—'] : [taskSummary(task), ...(hasStatus ? [task.status || '—'] : [])]) }));
  const taskRows = taskGroups.flatMap(group => group.rows);
  return { labels, taskRows, taskGroups };
}
function tableHTML(labels, rows) {
  const cell = 'border:1px solid #b5bec7;padding:9px;text-align:left;vertical-align:top;';
  return `<table border="1" cellpadding="9" cellspacing="0" style="border-collapse:collapse;width:100%;margin:12px 0;font:14px Arial,sans-serif;">\n<thead><tr>${labels.map(label => `<th style="${cell}background:#edf1f5;">${lines(label)}</th>`).join('\t')}</tr></thead>\n<tbody>\n${rows.map(row => `<tr>${row.map(value => `<td style="${cell}">${lines(value)}</td>`).join('\t')}</tr>`).join('\n')}\n</tbody></table>\n`;
}
export function renderProductionTables(tasks, options = {}) {
  const { labels, taskGroups } = productionData(tasks, options);
  return taskGroups.map(group => `<h3 style="font-size:15px;margin-top:18px;">${escapeHTML(group.label)}</h3>\n${tableHTML(labels, group.rows)}`).join('');
}
export function renderReport(day, options = {}) {
  const { heading, header, taskRows, taskGroups, blockers, carryover } = reportData(day, options);
  let index = 0;
  const updates = taskGroups.map(group => `${group.label}\n${group.tasks.map(task => {
    index++;
    if (!options.detailed || task.entryType === 'quick') return `${index}. ${taskSummary(task)}${task.status ? `\nStatus: ${task.status}` : ''}`;
    return [`${index}. ${taskName(task)}`, task.ticketId ? `Ticket: ${task.ticketId}` : '', task.area ? `Location: ${task.area}` : '', taskDetails(task), `Status: ${task.status}`].filter(Boolean).join('\n');
  }).join('\n\n')}`);
  return {
    html: `<div style="font:14px Arial,sans-serif;color:#16283b;"><h1 style="font-size:22px;">${escapeHTML(heading)}</h1>\n<h2 style="font-size:17px;">Shift details</h2>\n${tableHTML(['Shift details', 'Information'], header)}<h2 style="font-size:17px;">Production updates</h2>\n${taskRows.length ? renderProductionTables(day.tasks, options) : '<p>No tasks recorded.</p>\n'}<h2 style="font-size:17px;">Blockers</h2>\n<p>${lines(blockers)}</p>\n${carryover ? `<h2 style="font-size:17px;">Carryover / next shift</h2>\n<p>${lines(carryover)}</p>\n` : ''}</div>`,
    text: readableText(`${heading}\n\nSHIFT DETAILS\n${header.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nPRODUCTION UPDATES\n${updates.length ? updates.join('\n\n') : 'No tasks recorded.'}\n\nBLOCKERS\n${blockers}${carryover ? `\n\nCARRYOVER / NEXT SHIFT\n${carryover}` : ''}`)
  };
}
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function textField(value, limit = 12000) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > limit) throw new Error('This backup contains an invalid text field.');
  return value;
}
function reviewFrom(value) {
  if (value == null) return null;
  if (!isObject(value) || !QUICK_MODES.includes(value.mode) || typeof value.headers !== 'boolean' || !Array.isArray(value.rows) || value.rows.length > 1000) throw new Error('This backup has an invalid paste review.');
  return { source: textField(value.source), mode: value.mode, headers: value.headers, rows: value.rows.map(row => {
    if (!isObject(row) || !['', 'add', 'skip', 'update'].includes(row.action)) throw new Error('This backup has an invalid review choice.');
    return { title: textField(row.title, 200), summary: textField(row.summary), category: categoryFrom(row.category), area: textField(row.area, 200), action: row.action, targetId: textField(row.targetId, 100) };
  }) };
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
function categoryFrom(value) {
  if (value == null || value === '') return '';
  if (!CATEGORIES.includes(value)) throw new Error('Choose a valid category.');
  return value;
}
function undoFrom(value) {
  if (value == null) return null;
  if (!isObject(value) || !Array.isArray(value.tasks) || value.tasks.length > 1000) throw new Error('Invalid undo record.');
  const tasks = value.tasks.map(validateTask);
  if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('Invalid undo task IDs.');
  return { label: textField(value.label, 100), tasks };
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
  task.category = categoryFrom(value.category);
  task.carriedFrom = textField(value.carriedFrom, 120);
  if (task.entryType === 'quick' && !task.title.trim() && !task.summary.trim()) throw new Error('Add a short production update.');
  if (['ticket', 'general'].includes(task.entryType) && !task.title.trim()) throw new Error('Add a short title for this work.');
  if (task.entryType === 'field' && task.kind === 'Custom task' && !task.custom.trim()) throw new Error('Give your custom task a name.');
  return task;
}
export function parseBackup(source) {
  if (typeof source !== 'string' || source.length > 5e6) throw new Error('Choose an EOD backup smaller than 5 MB.');
  let raw;
  try { raw = JSON.parse(source); } catch { throw new Error('This file is not a valid JSON backup.'); }
  if (!isObject(raw) || ![1, 2, 3, 4, 5, 6, 7].includes(raw.schema) || !isObject(raw.days) || Object.keys(raw.days).length > 5000) throw new Error('This is not a supported EOD backup.');
  const state = newState();
  state.defaults = headerFrom(raw.defaults);
  state.teamsTarget = textField(raw.teamsTarget, 4000);
  teamsDestination(state.teamsTarget);
  if (raw.pastePreferences != null) {
    if (!isObject(raw.pastePreferences) || !QUICK_MODES.includes(raw.pastePreferences.mode) || typeof raw.pastePreferences.headers !== 'boolean') throw new Error('This backup has invalid paste preferences.');
    state.pastePreferences = { mode: raw.pastePreferences.mode, headers: raw.pastePreferences.headers };
  }
  for (const [date, value] of Object.entries(raw.days)) {
    if (!validDate(date) || !isObject(value) || value.date !== date || !Array.isArray(value.tasks) || value.tasks.length > 1000 || !['None', 'Reported', 'Not reviewed'].includes(value.blockerState)) throw new Error('This backup contains an invalid day.');
    const tasks = value.tasks.map(validateTask);
    if (new Set(tasks.map(task => task.id)).size !== tasks.length) throw new Error('This backup contains duplicate task IDs.');
    state.days[date] = { date, header: headerFrom(value.header), tasks, updateTitleDraft: textField(value.updateTitleDraft, 200), updateDescriptionDraft: textField(value.updateDescriptionDraft), quickDraft: textField(value.quickDraft), pasteReview: reviewFrom(value.pasteReview), quickMode: QUICK_MODES.includes(value.quickMode) ? value.quickMode : 'lines', quickTableHeaders: value.quickTableHeaders !== false, blockerState: value.blockerState, blockers: textField(value.blockers), carryover: textField(value.carryover), updatedAt: textField(value.updatedAt, 100) };
    Object.assign(state.days[date], { undo: undoFrom(value.undo), updateCategoryDraft: value.updateCategoryDraft == null || value.updateCategoryDraft === 'auto' ? 'auto' : categoryFrom(value.updateCategoryDraft), updateAreaDraft: textField(value.updateAreaDraft, 200) });
  }
  return state;
}
export const exportBackup = state => JSON.stringify(state, null, 2);
export function hasDayContent(day, defaults) {
  return Boolean(day.updatedAt || day.tasks.length || day.updateTitleDraft || day.updateDescriptionDraft || day.quickDraft || day.pasteReview?.rows.length || day.blockers || day.carryover || day.blockerState !== 'Not reviewed' || HEADER_KEYS.some(key => day.header[key] !== defaults[key]));
}
export function mergeBackup(current, incoming) {
  const days = { ...incoming.days };
  for (const [date, day] of Object.entries(current.days)) {
    if (!Object.hasOwn(days, date) || hasDayContent(day, current.defaults)) days[date] = day;
  }
  return { schema: 7, defaults: Object.values(current.defaults).some(Boolean) ? { ...current.defaults } : { ...incoming.defaults }, pastePreferences: current.pastePreferences || incoming.pastePreferences || null, teamsTarget: current.teamsTarget || incoming.teamsTarget || '', days };
}
