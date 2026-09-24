import { STORAGE_KEY, KINDS, UNITS, STATUSES, localDate, newState, ensureDay, nextTask, escapeHTML as esc, taskName, taskDetails, reportWarnings, renderReport, validateTask, parseBackup, exportBackup, mergeBackup, hasDayContent } from './model.mjs?v=2';
import { buildReportPdf } from './pdf.mjs?v=2';

const $ = id => document.getElementById(id);
let state = newState(), storageLocked = false, activeDate = localDate(), activeTab = 'today', editingTask = null, toastTimer;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) state = parseBackup(saved);
} catch (error) {
  storageLocked = true;
  $('storage-warning').hidden = false;
  $('storage-warning').textContent = 'Saved data could not be opened. It has not been overwritten. Export any work you enter now; use a valid backup to restore your history.';
  $('save-state').textContent = 'Saving unavailable';
  $('save-state').classList.add('failed');
}
const day = () => ensureDay(state, activeDate);
const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
function persist(markDay = true) {
  if (markDay) day().updatedAt = new Date().toISOString();
  if (storageLocked) return false;
  try {
    localStorage.setItem(STORAGE_KEY, exportBackup(state));
    $('save-state').textContent = 'Saved on this device';
    $('save-state').classList.remove('failed');
    $('storage-warning').hidden = true;
    return true;
  } catch {
    $('save-state').textContent = 'Not saved — export backup';
    $('save-state').classList.add('failed');
    $('storage-warning').textContent = 'This browser could not save your latest changes. Keep this page open and use History → Export backup to keep a copy.';
    $('storage-warning').hidden = false;
    return false;
  }
}
function summary() {
  const header = day().header;
  $('shift-summary').textContent = [header.location, header.lead ? `Lead: ${header.lead}` : ''].filter(Boolean).join(' · ') || 'Set up your day';
}
function renderHeader() {
  $('report-date').value = activeDate;
  $('date-caption').textContent = dateLabel(activeDate);
  $('page-title').textContent = activeTab === 'report' ? 'Your EOD report' : activeTab === 'history' ? 'Every day, kept.' : activeDate === localDate() ? 'Today’s work' : 'Day’s work';
  $('day-eyebrow').textContent = activeTab === 'history' ? 'Your work, in order' : 'Your daily record';
}
function fillDay() {
  for (const key of ['start', 'end', 'location', 'supervisor', 'lead', 'crew']) $(`shift-${key}`).value = day().header[key];
  document.querySelectorAll('[name="blocker-state"]').forEach(input => { input.checked = input.value === day().blockerState; });
  $('blockers').value = day().blockers;
  $('blocker-label').hidden = day().blockerState !== 'Reported';
  $('carryover').value = day().carryover;
  summary();
  renderHeader();
  renderTasks();
}
function renderTasks() {
  const tasks = day().tasks;
  const completed = tasks.filter(task => task.status === 'Completed').length;
  $('task-count').textContent = tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} recorded · ${completed} completed` : 'Add a task as you go.';
  $('task-list').innerHTML = tasks.length ? tasks.map(task => {
    const statusClass = task.status === 'Completed' ? 'completed' : task.status === 'Blocked' ? 'blocked' : '';
    const context = [task.ticketId ? `Ticket ${task.ticketId}` : task.entryType === 'ticket' ? 'Ticket' : task.entryType === 'general' ? 'General work' : 'Field work', task.area].filter(Boolean).join(' · ');
    return `<article class="task-card ${statusClass}"><div class="task-content"><div class="task-top"><div><p class="task-kind">${esc(context)}</p><h3>${esc(taskName(task))}</h3></div><span class="status ${statusClass}">${esc(task.status)}</span></div>${taskDetails(task) ? `<p class="task-details">${esc(taskDetails(task))}</p>` : ''}</div><div class="task-actions"><button class="text-button" data-action="edit" data-id="${esc(task.id)}">Edit</button><button class="text-button" data-action="next" data-id="${esc(task.id)}">${task.entryType === 'field' ? 'Next row' : 'Next entry'}</button><button class="text-button" data-action="complete" data-id="${esc(task.id)}">${task.status === 'Completed' ? 'Reopen' : 'Mark complete'}</button><button class="text-button danger-text delete" data-action="delete" data-id="${esc(task.id)}" aria-label="Delete ${esc(taskName(task))}">Delete</button></div></article>`;
  }).join('') : '<div class="empty-state"><div class="empty-icon" aria-hidden="true">+</div><h3>Start with your first entry</h3><p>Add field work, a ticket, or a general task. Record what you did; include rows and quantities when they apply.</p></div>';
}
function renderReportView() {
  const warnings = reportWarnings(day());
  $('report-checks').hidden = !warnings.length;
  $('report-checks').innerHTML = `<strong>A few details still need your review</strong><ul>${warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul><p class="small">Your report is marked Draft until these are filled in.</p>`;
  $('report-preview').innerHTML = renderReport(day()).html;
  $('manual-copy').hidden = true;
  $('share-status').hidden = true;
}
function renderHistory() {
  const days = Object.values(state.days).filter(value => value.updatedAt || value.tasks.length || value.blockers || value.carryover).sort((a, b) => b.date.localeCompare(a.date));
  $('history-list').innerHTML = days.length ? days.map(value => `<button class="history-item" data-date="${esc(value.date)}"><span><strong>${esc(dateLabel(value.date))}</strong><span class="small muted">${esc(value.header.location || 'Location not recorded')} · ${value.tasks.length} ${value.tasks.length === 1 ? 'task' : 'tasks'}</span></span><span class="chevron" aria-hidden="true">›</span></button>`).join('') : '<div class="empty-state"><h3>Your saved days will appear here</h3><p>Start recording work in Today. You can return to any saved day here.</p></div>';
}
function showTab(tab, scroll = true) {
  activeTab = tab;
  for (const name of ['today', 'report', 'history']) $(`${name}-panel`).hidden = name !== tab;
  document.querySelectorAll('[data-tab]').forEach(button => {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  renderHeader();
  if (tab === 'report') renderReportView();
  if (tab === 'history') renderHistory();
  if (scroll) window.scrollTo({ top: 0 });
}
function chooseDate(date) {
  try { ensureDay(state, date); } catch { $('report-date').value = activeDate; return; }
  activeDate = date;
  fillDay();
  if (activeTab === 'history') showTab('today');
  else showTab(activeTab, false);
}

for (const [id, values] of [['task-kind', KINDS], ['task-status', STATUSES], ['task-unit', UNITS]]) $(id).innerHTML = values.map(value => `<option>${esc(value)}</option>`).join('');
const entryType = () => document.querySelector('[name="entry-type"]:checked').value;
function syncCustom() {
  const field = entryType() === 'field';
  const custom = field && $('task-kind').value === 'Custom task';
  $('kind-label').hidden = !field;
  $('task-title').required = !field;
  $('title-optional').hidden = !field;
  $('custom-label').hidden = !custom;
  $('task-custom').required = custom;
}
function collectBreakdown() {
  return [...$('breakdown-list').querySelectorAll('.breakdown-row')].map(row => Object.fromEntries(['length', 'groups', 'perGroup'].map(key => [key, row.querySelector(`[data-field="${key}"]`).value])));
}
function renderBreakdown(rows) {
  $('breakdown-list').innerHTML = rows.map((row, index) => `<div class="breakdown-row"><div class="breakdown-fields"><label>Length (m)<input type="number" min="0.01" max="10000000" step="any" inputmode="decimal" data-field="length" value="${esc(row.length ?? '')}" aria-label="Length in meters, group ${index + 1}" required></label><label>Groups<input type="number" min="1" max="10000000" step="1" inputmode="numeric" data-field="groups" value="${esc(row.groups ?? '')}" aria-label="Groups, group ${index + 1}" required></label><label>Fibers / group<input type="number" min="1" max="10000000" step="1" inputmode="numeric" data-field="perGroup" value="${esc(row.perGroup ?? '')}" aria-label="Fibers per group, group ${index + 1}" required></label></div><div class="breakdown-total"><span class="group-result"></span><button type="button" class="text-button danger-text" data-remove-row="${index}">Remove length</button></div></div>`).join('');
  updateBreakdownTotals();
}
function updateBreakdownTotals() {
  $('breakdown-list').querySelectorAll('.breakdown-row').forEach(row => {
    const groups = Number(row.querySelector('[data-field="groups"]').value), count = Number(row.querySelector('[data-field="perGroup"]').value);
    row.querySelector('.group-result').textContent = groups > 0 && count > 0 && Number.isInteger(groups) && Number.isInteger(count) ? `${groups * count} fibers in this length group` : 'Enter groups and fibers per group';
  });
}
function openTask(task, edit = false) {
  editingTask = edit ? task.id : null;
  $('dialog-title').textContent = edit ? 'Edit task' : 'Add a task';
  $('task-error').hidden = true;
  $('task-form').reset();
  document.querySelectorAll('[name="entry-type"]').forEach(input => { input.checked = input.value === (task.entryType || 'field'); });
  for (const [field, property] of [['title', 'title'], ['ticket', 'ticketId'], ['description', 'description'], ['kind', 'kind'], ['status', 'status'], ['custom', 'custom'], ['area', 'area'], ['zend', 'zEnd'], ['quantity', 'quantity'], ['unit', 'unit'], ['notes', 'notes']]) $(`task-${field}`).value = task[property] || '';
  syncCustom();
  renderBreakdown(task.breakdown);
  $('breakdown-details').open = !!task.breakdown.length;
  $('location-details').open = entryType() === 'field' || !!task.area || !!task.zEnd || task.quantity !== '';
  $('task-dialog').showModal();
  (entryType() === 'field' ? (task.kind === 'Custom task' ? $('task-custom') : $('task-area')) : $('task-title')).focus();
}
function submitTask(event) {
  event.preventDefault();
  try {
    const task = validateTask({ id: editingTask || crypto.randomUUID(), entryType: entryType(), title: $('task-title').value.trim(), ticketId: $('task-ticket').value.trim(), description: $('task-description').value.trim(), kind: $('task-kind').value, custom: $('task-custom').value.trim(), area: $('task-area').value.trim(), zEnd: $('task-zend').value.trim(), quantity: $('task-quantity').value, unit: $('task-unit').value, status: $('task-status').value, notes: $('task-notes').value.trim(), breakdown: collectBreakdown() });
    const index = day().tasks.findIndex(value => value.id === editingTask);
    if (index >= 0) day().tasks[index] = task;
    else day().tasks.push(task);
    const saved = persist();
    $('task-dialog').close();
    renderTasks();
    toast(saved ? 'Task saved' : 'Task added — export a backup to keep it');
  } catch (error) {
    $('task-error').textContent = error.message;
    $('task-error').hidden = false;
    $('task-error').scrollIntoView({ block: 'nearest' });
  }
}
function downloadFile(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function copyReport(rich) {
  const report = renderReport(day());
  $('manual-copy').hidden = true;
  try {
    if (rich) {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Formatted copying unavailable');
      const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>\n${report.html}\n</body></html>`;
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([report.text], { type: 'text/plain' }) })]);
      shareStatus('Formatted report copied. If Teams flattens it, share the PDF to keep the tables or try Copy readable text.');
      return;
    }
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(report.text);
    shareStatus('Readable text copied with numbered entries and line breaks. Review the paste in Teams before sending.');
  } catch {
    if (rich) { shareStatus('This browser could not copy the formatted report. Use Copy readable text or share the PDF.'); return; }
    $('manual-text').value = report.text;
    $('manual-copy').hidden = false;
    $('manual-text').focus();
    $('manual-text').select();
    toast('Select and copy the report text below.');
  }
}
function shareStatus(message) {
  $('share-status').textContent = message;
  $('share-status').hidden = false;
}
async function exportPdf(share = false) {
  try {
    const doc = buildReportPdf(day());
    const name = `EOD-${activeDate}.pdf`;
    const blob = doc.output('blob');
    const file = new File([blob], name, { type: 'application/pdf' });
    if (share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `EOD ${activeDate}` });
      shareStatus('PDF handed to the share sheet. Review the selected destination before sending.');
    } else {
      downloadFile(blob, name, 'application/pdf');
      shareStatus('PDF download requested. Attach it in Teams to keep the tables. On iPhone, find it in Files → Downloads.');
    }
  } catch (error) {
    if (error.name !== 'AbortError') shareStatus('The PDF could not be created or shared. Try Download PDF again, or copy the report text.');
  }
}
async function importFile(file) {
  if (!file) return;
  try {
    if (file.size > 5e6) throw new Error('Choose an EOD backup smaller than 5 MB.');
    const incoming = parseBackup(await file.text());
    const existingCount = Object.values(state.days).filter(value => hasDayContent(value, state.defaults)).length;
    const count = Object.keys(incoming.days).filter(date => !Object.hasOwn(state.days, date) || !hasDayContent(state.days[date], state.defaults)).length;
    if (!window.confirm(`Import ${count} new day${count === 1 ? '' : 's'}? Your ${existingCount} existing day${existingCount === 1 ? '' : 's'} will be kept.${storageLocked ? ' This replaces the unreadable saved data.' : ''}`)) return;
    state = mergeBackup(state, incoming);
    storageLocked = false;
    const saved = persist(false);
    fillDay();
    renderHistory();
    toast(saved ? `Backup imported. ${count} day${count === 1 ? '' : 's'} added.` : 'Backup opened, but storage is unavailable. Export a copy.');
  } catch (error) { toast(error.message); }
  finally { $('backup-file').value = ''; }
}

for (const key of ['start', 'end', 'location', 'supervisor', 'lead', 'crew']) $(`shift-${key}`).addEventListener('input', event => { day().header[key] = event.target.value; persist(); summary(); });
$('save-defaults').addEventListener('click', () => { state.defaults = { ...day().header }; const saved = persist(); toast(saved ? 'Shift details saved for future days' : 'Could not save defaults. Export a backup.'); });
$('report-date').addEventListener('change', event => chooseDate(event.target.value));
document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => showTab(button.dataset.tab)));
$('review-report').addEventListener('click', () => showTab('report'));
$('go-today').addEventListener('click', () => { chooseDate(localDate()); showTab('today'); });
$('history-list').addEventListener('click', event => { const button = event.target.closest('[data-date]'); if (button) chooseDate(button.dataset.date); });
$('add-task').addEventListener('click', () => openTask(nextTask()));
for (const type of ['ticket', 'general']) $(`add-${type}`).addEventListener('click', () => openTask(nextTask({ entryType: type })));
document.querySelectorAll('[data-quick]').forEach(button => button.addEventListener('click', () => openTask(nextTask({ kind: button.dataset.quick }))));
$('task-kind').addEventListener('change', syncCustom);
document.querySelectorAll('[name="entry-type"]').forEach(input => input.addEventListener('change', () => { syncCustom(); $('location-details').open = input.value === 'field' || !!$('task-area').value || !!$('task-quantity').value; }));
$('task-form').addEventListener('submit', submitTask);
for (const id of ['close-task', 'cancel-task']) $(id).addEventListener('click', () => $('task-dialog').close());
$('add-breakdown').addEventListener('click', () => { const rows = collectBreakdown(); if (rows.length >= 100) return toast('Use up to 100 length groups per task.'); rows.push({ length: '', groups: '', perGroup: '' }); renderBreakdown(rows); $('breakdown-details').open = true; $('breakdown-list').lastElementChild.querySelector('input').focus(); });
$('breakdown-list').addEventListener('input', updateBreakdownTotals);
$('breakdown-list').addEventListener('click', event => { const button = event.target.closest('[data-remove-row]'); if (button) { const rows = collectBreakdown(); rows.splice(Number(button.dataset.removeRow), 1); renderBreakdown(rows); } });
$('task-list').addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const task = day().tasks.find(value => value.id === button.dataset.id);
  if (!task) return;
  if (button.dataset.action === 'edit') return openTask(structuredClone(task), true);
  if (button.dataset.action === 'next') return openTask(nextTask(task));
  if (button.dataset.action === 'delete') {
    if (!window.confirm(`Delete ${taskName(task)}${task.area ? ` at ${task.area}` : ''}? This removes it from this day’s report.`)) return;
    day().tasks = day().tasks.filter(value => value.id !== task.id);
  } else if (button.dataset.action === 'complete') task.status = task.status === 'Completed' ? 'In progress' : 'Completed';
  persist(); renderTasks();
});
document.querySelectorAll('[name="blocker-state"]').forEach(input => input.addEventListener('change', () => { day().blockerState = input.value; $('blocker-label').hidden = input.value !== 'Reported'; persist(); }));
for (const key of ['blockers', 'carryover']) $(key).addEventListener('input', event => { day()[key] = event.target.value; persist(); });
$('copy-rich').addEventListener('click', () => copyReport(true));
$('copy-plain').addEventListener('click', () => copyReport(false));
$('share-pdf').hidden = !navigator.share || !navigator.canShare;
$('share-pdf').addEventListener('click', () => exportPdf(true));
$('download-pdf').addEventListener('click', () => exportPdf());
$('export-backup').addEventListener('click', () => { downloadFile(exportBackup(state), `eod-backup-${localDate()}.json`, 'application/json'); toast('Backup download requested. Keep it in a private folder.'); });
$('import-backup').addEventListener('click', () => $('backup-file').click());
$('backup-file').addEventListener('change', event => importFile(event.target.files[0]));
// Pause writes when another tab changes the same records, rather than overwriting them.
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  storageLocked = true;
  $('save-state').textContent = 'Reload before editing';
  $('save-state').classList.add('failed');
  $('storage-warning').textContent = 'Your saved data changed in another tab. Export any unsaved changes here, then reload to use the latest records.';
  $('storage-warning').hidden = false;
});
fillDay();
if (day().header.location && day().header.crew) $('shift-details').open = false;
