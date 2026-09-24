import { STORAGE_KEY, KINDS, UNITS, STATUSES, localDate, newState, ensureDay, nextTask, escapeHTML as esc, taskName, taskDetails, taskSummary, splitQuickNotes, reportWarnings, renderReport, validateTask, parseBackup, exportBackup, mergeBackup, hasDayContent } from './model.mjs?v=3.4';
import { buildReportPdf } from './pdf.mjs?v=3.4';

const $ = id => document.getElementById(id);
let state = newState(), storageLocked = false, activeDate = localDate(), activeTab = 'today', editingTask = null, toastTimer, pdfExporting = false;
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
const reportOptions = () => ({ detailed: $('report-detail').checked });
const quickOptions = () => ({ mode: document.querySelector('[name="quick-mode"]:checked').value, headers: $('quick-table-headers').checked });
const repeatKey = text => text.replace(/\r\n|\r/g, '\n').trim();
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
  $('shift-summary').textContent = [header.location, header.lead.trim() ? `Lead: ${header.lead.trim()}` : ''].filter(Boolean).join(' · ') || 'Set up your day';
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
  $('update-title').value = day().updateTitleDraft;
  $('update-description').value = day().updateDescriptionDraft;
  updateTitleButton();
  $('quick-notes').value = day().quickDraft;
  document.querySelectorAll('[name="quick-mode"]').forEach(input => { input.checked = input.value === day().quickMode; });
  $('quick-table-headers').checked = day().quickTableHeaders;
  updateQuickButton();
  summary();
  renderHeader();
  renderTasks();
}
function renderTasks() {
  const tasks = day().tasks;
  $('task-count').textContent = tasks.length ? `${tasks.length} ${tasks.length === 1 ? 'entry' : 'entries'} in your report` : 'Your updates will appear here.';
  $('task-list').innerHTML = tasks.length ? tasks.map(task => {
    if (task.entryType === 'quick') return `<article class="task-card quick-card">${task.title ? `<div class="quick-update titled-update"><h3>${esc(task.title)}</h3>${task.summary ? `<p>${esc(task.summary)}</p>` : ''}</div>` : `<p class="quick-update">${esc(task.summary)}</p>`}<div class="task-actions"><button class="text-button" data-action="edit" data-id="${esc(task.id)}">Edit</button><button class="text-button danger-text delete" data-action="delete" data-id="${esc(task.id)}">Delete</button></div></article>`;
    const statusClass = task.status === 'Completed' ? 'completed' : task.status === 'Blocked' ? 'blocked' : '';
    const context = [task.ticketId ? `Ticket ${task.ticketId}` : task.entryType === 'ticket' ? 'Ticket' : task.entryType === 'general' ? 'General work' : 'Field work', task.area].filter(Boolean).join(' · ');
    return `<article class="task-card ${statusClass}"><div class="task-content"><div class="task-top"><div><p class="task-kind">${esc(context)}</p><h3>${esc(taskName(task))}</h3></div><span class="status ${statusClass}">${esc(task.status)}</span></div>${taskDetails(task) ? `<p class="task-details">${esc(taskDetails(task))}</p>` : ''}</div><div class="task-actions"><button class="text-button" data-action="edit" data-id="${esc(task.id)}">Edit</button><button class="text-button" data-action="next" data-id="${esc(task.id)}">${task.entryType === 'field' ? 'Next row' : 'Next entry'}</button><button class="text-button" data-action="complete" data-id="${esc(task.id)}">${task.status === 'Completed' ? 'Reopen' : 'Mark complete'}</button><button class="text-button danger-text delete" data-action="delete" data-id="${esc(task.id)}" aria-label="Delete ${esc(taskName(task))}">Delete</button></div></article>`;
  }).join('') : '';
}
function updateTitleButton() {
  $('save-update').disabled = !$('update-title').value.trim();
  $('update-error').hidden = true;
}
function addTitledUpdate(event) {
  event.preventDefault();
  try {
    const title = $('update-title').value.trim();
    if (!title) throw new Error('Enter a ticket or task title. A description is optional.');
    if (day().tasks.length >= 1000) throw new Error('Use up to 1,000 entries per day.');
    const task = validateTask({ ...nextTask(), entryType: 'quick', title, summary: $('update-description').value.trim(), status: '' });
    day().tasks.push(task);
    day().updateTitleDraft = '';
    day().updateDescriptionDraft = '';
    const saved = persist();
    $('update-form').reset();
    updateTitleButton(); renderTasks();
    $('update-title').focus();
    toast(saved ? 'Update added' : 'Update added — export a backup to keep it');
  } catch (error) { $('update-error').textContent = error.message; $('update-error').hidden = false; }
}
function updateQuickButton() {
  const mode = quickOptions().mode;
  $('table-header-option').hidden = mode !== 'table';
  const tips = {
    lines: 'Paste with Ctrl+V or Cmd+V. Each line becomes an update.',
    single: 'Paste one ticket or note. Its lines stay together; trim the details in the next step.',
    blocks: 'Leave a blank line between tickets or notes. Lines within each block stay together.',
    table: 'Copy cells from Excel or a tab-separated table. Each row becomes an update. Check whether you copied column names.'
  };
  $('quick-help').textContent = tips[mode];
  $('quick-error').hidden = true;
  try {
    const count = splitQuickNotes($('quick-notes').value, quickOptions()).length;
    $('save-quick').disabled = !count;
    $('save-quick').textContent = count > 1 ? `Review ${count} updates` : mode !== 'lines' ? 'Review update' : 'Add to log';
    if (!count && mode === 'table' && $('quick-notes').value.trim() && $('quick-table-headers').checked) $('quick-help').textContent = 'Only a header row was found. If you copied a data row without column names, uncheck First row contains column names.';
  } catch (error) {
    $('save-quick').disabled = true;
    $('save-quick').textContent = 'Review updates';
    $('quick-error').textContent = error.message;
    $('quick-error').hidden = false;
  }
}
function saveQuickUpdates(summaries) {
  const tasks = summaries.map(summary => validateTask({ ...nextTask(), entryType: 'quick', summary: summary.trim(), status: '' }));
  if (day().tasks.length + tasks.length > 1000) throw new Error('Use up to 1,000 entries per day.');
  day().tasks.push(...tasks);
  day().quickDraft = '';
  const saved = persist();
  $('quick-notes').value = '';
  updateQuickButton(); renderTasks();
  toast(saved ? `${tasks.length === 1 ? 'Update' : `${tasks.length} updates`} added` : 'Updates added — export a backup to keep them');
}
function updatePasteButton() {
  const count = $('paste-list').querySelectorAll('input:checked').length;
  $('save-paste').disabled = !count;
  $('save-paste').textContent = count ? `Add ${count} ${count === 1 ? 'update' : 'updates'}` : 'Select updates to add';
  $('paste-error').hidden = true;
}
function addQuickUpdates(event) {
  event.preventDefault();
  try {
    const summaries = splitQuickNotes($('quick-notes').value, quickOptions());
    if (!summaries.length) return;
    if (summaries.length > 1000) throw new Error('Review up to 1,000 updates at a time.');
    const existing = new Set(day().tasks.map(task => repeatKey(taskSummary(task))));
    if (summaries.length === 1 && quickOptions().mode === 'lines' && !existing.has(repeatKey(summaries[0]))) return saveQuickUpdates(summaries);
    const seen = new Set();
    $('paste-list').innerHTML = summaries.map((summary, index) => {
      const key = repeatKey(summary);
      const warning = existing.has(key) ? 'Already in this day’s log' : seen.has(key) ? 'Repeated in this paste' : '';
      seen.add(key);
      return `<div class="paste-entry"><label class="paste-select"><input type="checkbox" ${warning ? '' : 'checked'} aria-controls="paste-text-${index}">Include update ${index + 1}</label>${warning ? `<p class="paste-repeat small">${warning} — unchecked. Select it if this is separate work.</p>` : ''}<label class="sr-only" for="paste-text-${index}">Update ${index + 1} text</label><textarea id="paste-text-${index}" rows="${Math.min(8, Math.max(3, summary.split('\n').length))}" maxlength="12000">${esc(summary)}</textarea></div>`;
    }).join('');
    updatePasteButton();
    $('paste-dialog').showModal();
  } catch (error) { $('quick-error').textContent = error.message; $('quick-error').hidden = false; }
}
function openQuickEdit(task) {
  editingTask = task.id;
  $('quick-edit-title-label').hidden = !task.title;
  $('quick-edit-title').required = !!task.title;
  $('quick-edit-title').value = task.title;
  $('quick-edit-label').textContent = task.title ? 'Description (optional)' : 'Production update';
  $('quick-edit-text').required = !task.title;
  $('quick-edit-text').value = task.summary;
  $('quick-edit-error').hidden = true;
  $('quick-dialog').showModal();
}
function renderReportView() {
  const warnings = reportWarnings(day());
  $('report-checks').hidden = !warnings.length;
  $('report-warnings').innerHTML = `<strong>A few details still need your review</strong><ul>${warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul><p class="small">Your PDF is marked Draft until these are filled in.</p>`;
  $('pdf-filename').textContent = `EOD-${activeDate}.pdf`;
  $('pdf-summary').textContent = `${day().tasks.length} ${day().tasks.length === 1 ? 'update' : 'updates'} · ${reportOptions().detailed ? 'Full details' : 'Compact report'}`;
  $('pdf-readiness').textContent = warnings.length ? 'Draft' : 'Ready';
  $('pdf-readiness').className = `status ${warnings.length ? 'blocked' : 'completed'}`;
  $('report-preview').innerHTML = renderReport(day(), reportOptions()).html;
  $('report-preview').classList.toggle('compact-report', !reportOptions().detailed);
  $('manual-copy').hidden = true;
  $('share-status').hidden = true;
}
function renderHistory() {
  const days = Object.values(state.days).filter(value => value.updatedAt || value.tasks.length || value.updateTitleDraft || value.updateDescriptionDraft || value.quickDraft || value.blockers || value.carryover).sort((a, b) => b.date.localeCompare(a.date));
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
  const report = renderReport(day(), reportOptions());
  $('manual-copy').hidden = true;
  try {
    if (rich) {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Formatted copying unavailable');
      const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>\n${report.html}\n</body></html>`;
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([report.text], { type: 'text/plain' }) })]);
      shareStatus('Alternate format copied. Compare the paste in Teams with Copy table before sending.');
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
function selectReport() {
  const preview = $('report-preview');
  preview.focus({ preventScroll: true });
  const range = document.createRange();
  range.selectNodeContents(preview);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
function copyTable() {
  try {
    selectReport();
    // Native selection copy is a compatibility option for app paste targets.
    // Keep the Async Clipboard option and manual selection available as well.
    if (!document.execCommand('copy')) throw new Error('Native copy unavailable');
    window.getSelection().removeAllRanges();
    shareStatus('Copy requested from the displayed table. Paste into Teams and check the borders and line breaks before sending.');
  } catch {
    shareStatus('Automatic table copying was unavailable. Use Select report, then your device’s Copy command.');
  }
}
function shareStatus(message) {
  $('share-status').textContent = message;
  $('share-status').hidden = false;
}
async function exportPdf(share = false) {
  if (pdfExporting) return;
  pdfExporting = true;
  const button = $(share ? 'share-pdf' : 'download-pdf');
  const label = button.textContent;
  button.textContent = share ? 'Opening share…' : 'Creating PDF…';
  for (const id of ['share-pdf', 'download-pdf']) $(id).disabled = true;
  $('share-status').hidden = true;
  let created = false;
  try {
    const doc = buildReportPdf(day(), {}, reportOptions());
    const name = `EOD-${activeDate}.pdf`;
    const blob = doc.output('blob');
    const file = new File([blob], name, { type: 'application/pdf' });
    created = true;
    const pages = doc.getNumberOfPages();
    const fileLabel = `${name} · ${pages} ${pages === 1 ? 'page' : 'pages'}`;
    // Keep PDF generation synchronous so native sharing retains the tap's user activation.
    if (share && navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `EOD ${activeDate}` });
      shareStatus(`${fileLabel}. PDF prepared. Check the selected Teams conversation to confirm it was sent.`);
    } else {
      downloadFile(blob, name, 'application/pdf');
      shareStatus(`${fileLabel}. Download requested. In Teams, tap + → Attach and choose the PDF from Files or Downloads.`);
    }
  } catch (error) {
    if (error.name === 'AbortError') shareStatus('Sharing closed. You can share again or use Download PDF. Your log has not changed.');
    else shareStatus(created ? 'Your device could not share the PDF. Use Download PDF, then attach the file in Teams.' : 'The PDF could not be created. Try again, or use Report options & text copy. Your log has not changed.');
  } finally {
    pdfExporting = false;
    button.textContent = label;
    for (const id of ['share-pdf', 'download-pdf']) $(id).disabled = false;
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
$('review-details').addEventListener('click', () => {
  showTab('today');
  $('shift-details').open = true;
  if (day().updateTitleDraft.trim() || day().updateDescriptionDraft.trim()) $('update-title').focus();
  else if (day().quickDraft?.trim()) $('quick-notes').focus();
});
$('go-today').addEventListener('click', () => { chooseDate(localDate()); showTab('today'); });
$('history-list').addEventListener('click', event => { const button = event.target.closest('[data-date]'); if (button) chooseDate(button.dataset.date); });
$('add-task').addEventListener('click', () => openTask(nextTask()));
$('update-form').addEventListener('submit', addTitledUpdate);
for (const [id, field] of [['update-title', 'updateTitleDraft'], ['update-description', 'updateDescriptionDraft']]) {
  $(id).addEventListener('input', () => { day()[field] = $(id).value; persist(); updateTitleButton(); });
  $(id).addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      if (!$('save-update').disabled) $('update-form').requestSubmit();
    }
  });
}
$('quick-notes').addEventListener('input', () => { day().quickDraft = $('quick-notes').value; persist(); updateQuickButton(); });
for (const id of ['quick-mode', 'quick-table-headers']) $(id).addEventListener('change', () => {
  day().quickMode = quickOptions().mode;
  day().quickTableHeaders = $('quick-table-headers').checked;
  persist(); updateQuickButton();
});
$('quick-notes').addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    if (!$('save-quick').disabled) $('quick-form').requestSubmit();
  }
});
$('quick-form').addEventListener('submit', addQuickUpdates);
for (const id of ['close-paste', 'cancel-paste']) $(id).addEventListener('click', () => $('paste-dialog').close());
$('paste-list').addEventListener('input', event => {
  updatePasteButton();
  if (event.target.matches('textarea')) event.target.closest('.paste-entry').querySelector('.paste-repeat')?.remove();
});
$('paste-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const summaries = [...$('paste-list').querySelectorAll('.paste-entry')].filter(row => row.querySelector('input').checked).map(row => row.querySelector('textarea').value);
    if (!summaries.length) return;
    saveQuickUpdates(summaries);
    $('paste-dialog').close();
  } catch (error) { $('paste-error').textContent = error.message; $('paste-error').hidden = false; }
});
for (const id of ['close-quick', 'cancel-quick']) $(id).addEventListener('click', () => $('quick-dialog').close());
$('quick-edit-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const index = day().tasks.findIndex(task => task.id === editingTask);
    if (index < 0) throw new Error('This update is no longer available.');
    const title = day().tasks[index].title ? $('quick-edit-title').value.trim() : '';
    if (day().tasks[index].title && !title) throw new Error('Enter a ticket or task title. A description is optional.');
    day().tasks[index] = validateTask({ ...day().tasks[index], title, summary: $('quick-edit-text').value.trim() });
    const saved = persist();
    $('quick-dialog').close(); renderTasks();
    toast(saved ? 'Update saved' : 'Update changed — export a backup to keep it');
  } catch (error) { $('quick-edit-error').textContent = error.message; $('quick-edit-error').hidden = false; }
});
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
  if (button.dataset.action === 'edit') return task.entryType === 'quick' ? openQuickEdit(task) : openTask(structuredClone(task), true);
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
$('copy-table').addEventListener('click', copyTable);
$('select-report').addEventListener('click', () => { selectReport(); shareStatus('Report selected. Use your device’s Copy command, or press Ctrl/Cmd+C.'); });
$('report-detail').addEventListener('change', renderReportView);
$('copy-plain').addEventListener('click', () => copyReport(false));
$('share-pdf').hidden = !navigator.share || !navigator.canShare;
if (!$('share-pdf').hidden) $('pdf-help').textContent = 'Tap Share PDF, choose Teams, then select the conversation. If Teams is missing, use Download PDF and attach the file in Teams with + → Attach.';
else { $('download-pdf').classList.replace('secondary', 'primary'); }
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
