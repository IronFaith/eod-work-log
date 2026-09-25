import { STORAGE_KEY, KINDS, UNITS, STATUSES, localDate, newState, ensureDay, nextTask, escapeHTML as esc, taskName, taskDetails, taskSummary, splitQuickNotes, createPasteReview, ticketMatches, applyPasteReview, reportWarnings, renderReport, validateTask, parseBackup, exportBackup, mergeBackup, hasDayContent } from './model.mjs?v=3.8';
import { buildReportPdf } from './pdf.mjs?v=3.8';
import { CATEGORIES, suggestCategory, groupTasks, replaceTasks, undoTasks, carryTasks, renderProductionTables } from './model.mjs?v=3.8';
import { previewDraft } from './preview.mjs?v=3.8';
import { richText, displayText, makeLink, teamsDestination } from './links.mjs?v=3.8';

const $ = id => document.getElementById(id);
let state = newState(), storageLocked = false, activeDate = localDate(), activeTab = 'today', editingTask = null, toastTimer, pdfExporting = false;
const selectedTasks = new Set(), inlineEdits = new Map();
const editKey = id => `${activeDate}:${id}`;
const categoryOptions = (value = '', auto = false) => `${auto ? '<option value="auto">Suggest from title / progress</option>' : ''}<option value="">Uncategorized</option>${CATEGORIES.map(category => `<option${category === value ? ' selected' : ''}>${esc(category)}</option>`).join('')}`;
const livePreview = $('live-preview'), previewDesktop = window.matchMedia('(min-width:1200px)');
let previewContext = { kind: 'log' };
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
  $('shift-summary').textContent = displayText([header.location, header.lead.trim() ? `Lead: ${header.lead.trim()}` : ''].filter(Boolean).join(' · ')) || 'Set up your day';
}
function renderHeader() {
  $('report-date').value = activeDate;
  $('date-caption').textContent = dateLabel(activeDate);
  $('page-title').textContent = activeTab === 'report' ? 'Your EOD report' : activeTab === 'history' ? 'Every day, kept.' : activeDate === localDate() ? 'Today’s work' : 'Day’s work';
  $('day-eyebrow').textContent = activeTab === 'history' ? 'Your work, in order' : 'Your daily record';
}
function fillDay() {
  renderTeamsShortcut();
  for (const key of ['start', 'end', 'location', 'supervisor', 'lead', 'crew']) $(`shift-${key}`).value = day().header[key];
  document.querySelectorAll('[name="blocker-state"]').forEach(input => { input.checked = input.value === day().blockerState; });
  $('blockers').value = day().blockers;
  $('blocker-label').hidden = day().blockerState !== 'Reported';
  $('carryover').value = day().carryover;
  $('update-title').value = day().updateTitleDraft;
  $('update-description').value = day().updateDescriptionDraft;
  $('update-category').value = day().updateCategoryDraft;
  $('update-area').value = day().updateAreaDraft;
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
  $('task-list').innerHTML = groupTasks(tasks, $('log-view').value).map(group => `${group.label ? `<h3 class="log-group">${esc(group.label)} <span class="small muted">${group.tasks.length}</span></h3>` : ''}${group.tasks.map(task => {
    const number = tasks.indexOf(task) + 1, draft = inlineEdits.get(editKey(task.id));
    const statusClass = task.status === 'Completed' ? 'completed' : task.status === 'Blocked' ? 'blocked' : '';
    const context = [task.category || 'Uncategorized', task.area, task.ticketId ? `Ticket ${task.ticketId}` : ''].filter(Boolean).join(' · ');
    const selection = `<label class="check-label task-selection"><input type="checkbox" data-select-id="${esc(task.id)}" aria-label="Select entry ${number}: ${esc(taskName(task))}"${selectedTasks.has(task.id) ? ' checked' : ''}>Entry ${number}</label>`;
    const actions = `<div class="task-actions"><button class="text-button" data-action="edit" data-id="${esc(task.id)}" aria-label="Edit entry ${number}">Edit here</button>${task.entryType !== 'quick' ? `<button class="text-button" data-action="details" data-id="${esc(task.id)}">Full details</button><button class="text-button" data-action="next" data-id="${esc(task.id)}">${task.entryType === 'field' ? 'Next row' : 'Next entry'}</button><button class="text-button" data-action="complete" data-id="${esc(task.id)}">${task.status === 'Completed' ? 'Reopen' : 'Mark complete'}</button>` : ''}<button class="text-button danger-text delete" data-action="delete" data-id="${esc(task.id)}" aria-label="Delete entry ${number}">Delete</button></div>`;
    return `<article class="task-card ${statusClass}">${selection}${draft ? inlineEditor(task, draft, number) : `<div class="task-content"><div class="task-top"><div><p class="task-kind">${esc(context)}</p><h3>${richText(taskName(task))}</h3></div>${task.status ? `<span class="status ${statusClass}">${esc(task.status)}</span>` : ''}</div>${taskDetails(task) ? `<p class="task-details">${richText(taskDetails(task))}</p>` : ''}</div>${actions}`}</article>`;
  }).join('')}`).join('');
  $('undo-log').disabled = !day().undo;
  $('undo-log').title = day().undo ? `Undo: ${day().undo.label}` : 'No log change to undo';
  updateSelection();
  if (!$('carry-panel').hidden) renderCarryList();
  renderPasteReview();
  renderLivePreview();
}
function currentSingleTask() {
  const title = $('update-title').value.trim(), summary = $('update-description').value.trim();
  const category = $('update-category').value === 'auto' ? suggestCategory(`${title}\n${summary}`) : $('update-category').value;
  return { ...nextTask(), entryType: 'quick', title, summary, category, area: $('update-area').value.trim(), status: '' };
}
function currentInlineTask(id) {
  const original = day().tasks.find(task => task.id === id), draft = inlineEdits.get(editKey(id));
  if (!original || !draft) throw new Error('This entry is no longer available.');
  return { ...original, title: draft.title.trim(), category: draft.category, area: draft.area.trim(), status: draft.status, ...(original.entryType === 'quick' ? { summary: draft.progress.trim() } : { notes: draft.progress.trim() }) };
}
function renderLivePreview() {
  if ($('task-dialog').open) previewContext = { kind: 'task' };
  else if (previewContext.kind === 'task' || (previewContext.kind === 'inline' && !inlineEdits.has(editKey(previewContext.id)))) previewContext = { kind: 'log' };
  const { kind, id } = previewContext;
  let host = $('live-preview-dock');
  if (kind === 'task') host = $('task-preview-slot');
  else if (!previewDesktop.matches) {
    host = kind === 'single' ? $('single-preview-slot') : kind === 'paste' ? $('quick-preview-slot') : kind === 'review' && !$('paste-review').hidden ? $('paste-preview-slot') : host;
    if (kind === 'inline') host = [...$('task-list').querySelectorAll('[data-edit-id]')].find(form => form.dataset.editId === id) || host;
  }
  if (livePreview.parentElement !== host) {
    if (host.matches('.inline-editor')) host.querySelector('.inline-error').before(livePreview);
    else host.append(livePreview);
  }
  const detailed = reportOptions().detailed;
  livePreview.querySelectorAll('[data-preview-format]').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.previewFormat === 'detailed') === detailed)));
  $('live-preview-table').classList.toggle('preview-detailed', detailed);
  $('live-preview-state').textContent = kind === 'log' ? 'In log' : 'Not saved';
  $('live-preview-help').textContent = kind === 'log' ? 'Your logged production tables. Choose a form or Edit here to preview a change.' : 'Preview only. Use the form’s Save or Add button to include these changes in your log.';
  let result, notice = '', context = kind === 'log' ? 'This day’s logged entries' : kind === 'single' ? 'One update · as it will appear in the report' : kind === 'inline' ? 'Editing an existing entry' : kind === 'task' ? `${entryType() === 'field' ? 'Row / field work' : entryType() === 'ticket' ? 'Ticket' : 'General work'} · current form` : 'Pasted batch · included updates';
  try {
    if (kind === 'log') result = { tasks: day().tasks, allTasks: day().tasks };
    else if (kind === 'single') {
      result = previewDraft(day().tasks, { task: $('update-title').value.trim() || $('update-description').value.trim() ? currentSingleTask() : null });
      if (!$('update-title').value.trim() && result.tasks.length) notice = 'Add a short title before saving this update.';
    } else if (kind === 'task') result = previewDraft(day().tasks, { task: currentDetailedTask(), editingId: editingTask });
    else if (kind === 'inline') result = previewDraft(day().tasks, { task: currentInlineTask(id), editingId: id });
    else {
      if (kind === 'review' && !reviewIsCurrent()) throw new Error('Your paste changed. Refresh the review before previewing those choices.');
      const rows = reviewIsCurrent() ? day().pasteReview.rows : createPasteReview(day().tasks, $('quick-notes').value, quickOptions()).rows;
      result = previewDraft(day().tasks, { rows });
      notice = [result.pending ? `${result.pending} matching ${result.pending === 1 ? 'ticket needs' : 'tickets need'} a Save as choice in Review before appearing here.` : '', result.skipped ? `${result.skipped} skipped ${result.skipped === 1 ? 'update is' : 'updates are'} excluded.` : ''].filter(Boolean).join(' ');
    }
    context += ` · ${result.tasks.length} ${result.tasks.length === 1 ? 'entry' : 'entries'}`;
    $('live-preview-table').innerHTML = result.tasks.length ? renderProductionTables(result.tasks, { detailed, columnTasks: result.allTasks }) : '<p class="preview-empty">Type a title, fill in field work, or paste updates to see the report table here.</p>';
    if (['paste', 'review'].includes(kind) && !result.tasks.length && (result.pending || result.skipped)) $('live-preview-table').innerHTML = '<p class="preview-empty">No included updates to preview yet.</p>';
  } catch (error) {
    notice = error.message;
    $('live-preview-table').innerHTML = '<p class="preview-empty">Complete or correct the form to preview this entry.</p>';
  }
  $('live-preview-context').textContent = context;
  $('live-preview-notice').textContent = notice;
  $('live-preview-notice').hidden = !notice;
}
function inlineEditor(task, draft, number) {
  return `<form class="inline-editor" data-edit-id="${esc(task.id)}" aria-label="Edit entry ${number}"><div class="fields two"><label class="full">Title / ticket<input data-linkable data-inline-field="title" maxlength="200" value="${esc(draft.title)}"${task.title || ['ticket', 'general'].includes(task.entryType) ? ' required' : ''}></label><label class="full">${task.entryType === 'quick' && !task.title ? 'Update text (add a title above to separate it)' : 'Today’s progress / description'} <span class="optional">optional</span><textarea data-linkable data-inline-field="progress" rows="3" maxlength="12000">${esc(draft.progress)}</textarea></label><label>Category<select data-inline-field="category">${categoryOptions(draft.category)}</select></label><label>Row / area <span class="optional">optional</span><input data-inline-field="area" maxlength="200" value="${esc(draft.area)}"></label>${task.entryType !== 'quick' ? `<label>Status<select data-inline-field="status">${STATUSES.map(status => `<option${status === draft.status ? ' selected' : ''}>${status}</option>`).join('')}</select></label>` : ''}</div><button class="text-button link-tool" type="button" data-insert-link>Insert link / person</button><p class="inline-error small danger-text" role="alert" hidden></p><div class="copy-actions"><button class="button primary" type="submit">Save changes</button><button class="button secondary" type="button" data-action="cancel-edit" data-id="${esc(task.id)}">Cancel</button><span class="small muted">Ctrl/Cmd+Enter to save</span></div></form>`;
}
function updateSelection() {
  for (const id of selectedTasks) if (!day().tasks.some(task => task.id === id)) selectedTasks.delete(id);
  const count = selectedTasks.size;
  $('selected-count').textContent = count ? `${count} selected` : '';
  $('select-all').checked = count > 0 && count === day().tasks.length;
  $('select-all').indeterminate = count > 0 && count < day().tasks.length;
  $('select-all').disabled = !day().tasks.length;
  $('bulk-form').hidden = !count;
  $('save-bulk').disabled = !count || (!$('bulk-category-apply').checked && !$('bulk-area-apply').checked);
}
function renderCarryList() {
  const source = state.days[$('carry-date').value];
  const tasks = source?.tasks.filter(task => task.status !== 'Completed') || [];
  $('carry-list').innerHTML = tasks.length ? tasks.map(task => {
    const already = day().tasks.some(item => item.carriedFrom === `${source.date}:${task.id}`) || ticketMatches(day().tasks, task).length;
    const untitled = task.entryType === 'quick' && !task.title;
    const note = already ? 'Already in this day’s log' : untitled ? 'Add a short title in the original day first' : [task.category, task.area].filter(Boolean).join(' · ');
    return `<label class="carry-choice check-label"><input type="checkbox" data-carry-id="${esc(task.id)}"${already || untitled ? ' disabled' : ''}><span>${esc(taskName(task))}<span class="small muted">${esc(note)}</span></span></label>`;
  }).join('') : '<p class="small muted">No unfinished entries on this day. Updates without a status can be selected manually.</p>';
  $('save-carry').disabled = true;
  $('carry-error').hidden = true;
}
function updateTitleButton() {
  $('save-update').disabled = !$('update-title').value.trim();
  const suggestion = suggestCategory(`${$('update-title').value}\n${$('update-description').value}`);
  $('update-category').querySelector('[value="auto"]').textContent = suggestion ? `Suggested: ${suggestion}` : 'Suggest from title / progress';
  $('update-error').hidden = true;
}
function addTitledUpdate(event) {
  event.preventDefault();
  try {
    const title = $('update-title').value.trim();
    if (!title) throw new Error('Enter a ticket or task title. A description is optional.');
    if (day().tasks.length >= 1000) throw new Error('Use up to 1,000 entries per day.');
    const task = validateTask(currentSingleTask());
    replaceTasks(day(), [...day().tasks, task], 'Add update');
    day().updateTitleDraft = '';
    day().updateDescriptionDraft = '';
    day().updateCategoryDraft = 'auto'; day().updateAreaDraft = '';
    const saved = persist();
    $('update-form').reset();
    previewContext = { kind: 'log' };
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
    $('save-quick').disabled = !count && !day().pasteReview;
    $('save-quick').textContent = !count && day().pasteReview ? 'Clear review' : day().pasteReview && !reviewIsCurrent() ? 'Refresh review' : count > 1 ? `Review ${count} updates` : 'Review update';
    if (!count && mode === 'table' && $('quick-notes').value.trim() && $('quick-table-headers').checked) $('quick-help').textContent = 'Only a header row was found. If you copied a data row without column names, uncheck First row contains column names.';
  } catch (error) {
    $('save-quick').disabled = true;
    $('save-quick').textContent = 'Review updates';
    $('quick-error').textContent = error.message;
    $('quick-error').hidden = false;
  }
  updatePasteButton();
}
function reviewIsCurrent() {
  const review = day().pasteReview, options = quickOptions();
  return review && review.source === day().quickDraft && review.mode === options.mode && review.headers === options.headers;
}
function syncReviewDecision(element, index, reset = false) {
  const row = day().pasteReview.rows[index], matches = ticketMatches(day().tasks, row);
  const signature = JSON.stringify(matches.map(task => task.id));
  if (row.action === 'update' && !matches.some(task => task.id === row.targetId)) { row.action = ''; row.targetId = ''; }
  if (reset && signature !== element.dataset.matches && row.action !== 'skip') { row.action = matches.length ? '' : 'add'; row.targetId = ''; }
  element.dataset.matches = signature;
  const choice = row.action === 'update' ? `update:${row.targetId}` : row.action;
  element.querySelector('[data-field="action"]').innerHTML = `${matches.length || !row.action ? '<option value="">Choose how to save</option>' : ''}<option value="add">${matches.length ? 'Add separate work' : 'Add new update'}</option>${matches.map(task => `<option value="update:${esc(task.id)}">Update entry ${day().tasks.indexOf(task) + 1}: ${esc(taskName(task).slice(0, 100))}</option>`).join('')}<option value="skip">Skip this update</option>`;
  element.querySelector('[data-field="action"]').value = choice;
  element.querySelector('[data-field="title"]').required = row.action !== 'skip';
  element.querySelector('.paste-match').textContent = matches.length ? `${matches.length === 1 ? 'Ticket already in today’s log.' : 'Several entries use this ticket.'} Updating replaces its title and progress; original request, quantities, and status stay as saved.` : row.action === 'skip' ? 'Skipped. Choose Add new update if this is separate work.' : '';
  element.querySelector('.paste-current').textContent = matches.map(task => `Entry ${day().tasks.indexOf(task) + 1}: ${taskSummary(task).slice(0, 350)}${taskSummary(task).length > 350 ? '…' : ''}`).join('\n\n');
}
function renderPasteReview() {
  const review = day().pasteReview;
  $('paste-review').hidden = !review?.rows.length;
  if (!review?.rows.length) { $('paste-list').innerHTML = ''; return; }
  $('paste-list').innerHTML = review.rows.map((row, index) => `<div class="paste-entry" data-review-index="${index}"><h4>Update ${index + 1}</h4><label>Title / ticket<input data-linkable data-field="title" aria-label="Update ${index + 1} title" maxlength="200" value="${esc(row.title)}"></label><label>Description <span class="optional">optional</span><textarea data-linkable data-field="summary" aria-label="Update ${index + 1} description" rows="3" maxlength="12000">${esc(row.summary)}</textarea></label><button class="text-button link-tool" type="button" data-insert-link>Insert link / person</button><div class="fields two organize-fields"><label>Category<select data-field="category" aria-label="Update ${index + 1} category">${categoryOptions(row.category)}</select></label><label>Row / area<input data-field="area" aria-label="Update ${index + 1} row / area" maxlength="200" value="${esc(row.area || '')}"></label></div><p class="small muted">Category is suggested when clear. Change or leave uncategorized.</p><p class="paste-match small"></p><p class="paste-current small muted"></p><label>Save as<select data-field="action" aria-label="Update ${index + 1} action"></select></label></div>`).join('');
  [...$('paste-list').children].forEach((element, index) => syncReviewDecision(element, index));
  updatePasteButton();
}
function updatePasteButton() {
  const rows = day().pasteReview?.rows || [], count = rows.filter(row => ['add', 'update'].includes(row.action)).length;
  const undecided = rows.some(row => !row.action), stale = !!rows.length && !reviewIsCurrent();
  $('paste-stale').hidden = !stale;
  $('save-paste').disabled = !rows.length || undecided || stale;
  $('save-paste').textContent = undecided ? 'Choose ticket actions' : count ? `Save ${count} ${count === 1 ? 'update' : 'updates'}` : 'Finish without adding';
  $('paste-error').hidden = true;
}
function addQuickUpdates(event) {
  event.preventDefault();
  try {
    if (!reviewIsCurrent()) day().pasteReview = createPasteReview(day().tasks, $('quick-notes').value, quickOptions());
    if (!day().pasteReview.rows.length) day().pasteReview = null;
    persist(); renderPasteReview(); updateQuickButton();
    $('paste-list').querySelector('input')?.focus();
  } catch (error) { $('quick-error').textContent = error.message; $('quick-error').hidden = false; }
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
  const days = Object.values(state.days).filter(value => value.updatedAt || value.tasks.length || value.updateTitleDraft || value.updateDescriptionDraft || value.quickDraft || value.pasteReview?.rows.length || value.blockers || value.carryover).sort((a, b) => b.date.localeCompare(a.date));
  $('history-list').innerHTML = days.length ? days.map(value => `<button class="history-item" data-date="${esc(value.date)}"><span><strong>${esc(dateLabel(value.date))}</strong><span class="small muted">${esc(value.header.location || 'Location not recorded')} · ${value.tasks.length} ${value.tasks.length === 1 ? 'task' : 'tasks'}</span></span><span class="chevron" aria-hidden="true">›</span></button>`).join('') : '<div class="empty-state"><h3>Your saved days will appear here</h3><p>Start recording work in Today. You can return to any saved day here.</p></div>';
}
function showTab(tab, scroll = true) {
  if (tab === 'report' && [...inlineEdits.keys()].some(key => key.startsWith(`${activeDate}:`))) {
    toast('Save or cancel the edits in your log before opening the report.');
    showTab('today', scroll);
    $('task-list').querySelector('.inline-editor input')?.focus();
    return;
  }
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
  previewContext = { kind: 'log' };
  selectedTasks.clear();
  $('carry-panel').hidden = true; $('bring-forward').setAttribute('aria-expanded', 'false');
  fillDay();
  if (activeTab === 'history') showTab('today');
  else showTab(activeTab, false);
}

for (const [id, values] of [['task-kind', KINDS], ['task-status', STATUSES], ['task-unit', UNITS]]) $(id).innerHTML = values.map(value => `<option>${esc(value)}</option>`).join('');
for (const id of ['update-category', 'task-category', 'bulk-category']) $(id).innerHTML = categoryOptions('', id !== 'bulk-category');
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
  $('task-category').value = edit ? task.category || '' : task.category || 'auto';
  syncCustom();
  renderBreakdown(task.breakdown);
  $('breakdown-details').open = !!task.breakdown.length;
  $('location-details').open = entryType() === 'field' || !!task.area || !!task.zEnd || task.quantity !== '';
  $('task-dialog').showModal();
  renderLivePreview();
  (entryType() === 'field' ? (task.kind === 'Custom task' ? $('task-custom') : $('task-area')) : $('task-title')).focus();
}
function currentDetailedTask() {
  const category = $('task-category').value === 'auto' ? suggestCategory([$('task-title').value, $('task-notes').value, entryType() === 'field' ? $('task-kind').value : ''].join('\n')) : $('task-category').value;
  return { ...day().tasks.find(value => value.id === editingTask), id: editingTask || crypto.randomUUID(), entryType: entryType(), title: $('task-title').value.trim(), ticketId: $('task-ticket').value.trim(), description: $('task-description').value.trim(), category, kind: $('task-kind').value, custom: $('task-custom').value.trim(), area: $('task-area').value.trim(), zEnd: $('task-zend').value.trim(), quantity: $('task-quantity').value, unit: $('task-unit').value, status: $('task-status').value, notes: $('task-notes').value.trim(), breakdown: collectBreakdown() };
}
function submitTask(event) {
  event.preventDefault();
  try {
    const task = validateTask(currentDetailedTask());
    const index = day().tasks.findIndex(value => value.id === editingTask);
    const tasks = [...day().tasks];
    if (index >= 0) tasks[index] = task;
    else tasks.push(task);
    replaceTasks(day(), tasks, index >= 0 ? 'Edit task details' : 'Add task');
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
      shareStatus('Report copied with clickable links and a readable text fallback. Review the paste in Teams before sending; PDF keeps the tables if Teams changes them.');
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
for (const [id, field] of [['update-title', 'updateTitleDraft'], ['update-description', 'updateDescriptionDraft'], ['update-category', 'updateCategoryDraft'], ['update-area', 'updateAreaDraft']]) {
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
  state.pastePreferences = quickOptions();
  persist(); updateQuickButton();
});
$('quick-notes').addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    if (!$('save-quick').disabled) $('quick-form').requestSubmit();
  }
});
$('quick-form').addEventListener('submit', addQuickUpdates);
$('cancel-paste').addEventListener('click', () => { $('paste-review').hidden = true; $('quick-notes').focus(); });
$('paste-list').addEventListener('input', event => {
  const element = event.target.closest('[data-review-index]');
  if (!element) return;
  const index = Number(element.dataset.reviewIndex), row = day().pasteReview.rows[index], field = event.target.dataset.field;
  if (field === 'action') {
    row.action = event.target.value.startsWith('update:') ? 'update' : event.target.value;
    row.targetId = row.action === 'update' ? event.target.value.slice(7) : '';
  } else if (['title', 'summary', 'category', 'area'].includes(field)) row[field] = event.target.value;
  syncReviewDecision(element, index, field === 'title');
  persist(); updatePasteButton();
});
$('paste-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    if (!reviewIsCurrent()) throw new Error('The pasted text or grouping changed. Refresh the review first.');
    const rows = day().pasteReview.rows;
    if (!rows.length) return;
    if (rows.some(row => row.action === 'update' && inlineEdits.has(editKey(row.targetId)))) throw new Error('Save or cancel the inline edits for the matching ticket first.');
    const tasks = applyPasteReview(day().tasks, rows);
    const added = rows.filter(row => row.action === 'add').length, updated = rows.filter(row => row.action === 'update').length;
    if (added || updated) replaceTasks(day(), tasks, 'Save pasted updates');
    day().quickDraft = ''; day().pasteReview = null;
    previewContext = { kind: 'log' };
    const saved = persist();
    $('quick-notes').value = '';
    updateQuickButton(); renderTasks();
    $('quick-notes').focus();
    toast(saved ? `${added} added · ${updated} updated` : 'Log changed — export a backup to keep it');
  } catch (error) { $('paste-error').textContent = error.message; $('paste-error').hidden = false; }
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
  if (button.dataset.action === 'edit') {
    previewContext = { kind: 'inline', id: task.id };
    inlineEdits.set(editKey(task.id), { title: task.title, progress: task.entryType === 'quick' ? task.summary : task.notes, category: task.category || '', area: task.area, status: task.status });
    renderTasks();
    [...$('task-list').querySelectorAll('[data-edit-id]')].find(form => form.dataset.editId === task.id)?.querySelector('input').focus();
    return;
  }
  if (button.dataset.action === 'cancel-edit') { inlineEdits.delete(editKey(task.id)); renderTasks(); return; }
  if (button.dataset.action === 'details') return openTask(structuredClone(task), true);
  if (button.dataset.action === 'next') return openTask(nextTask(task));
  if (button.dataset.action === 'delete') {
    if (!window.confirm(`Delete ${taskName(task)}${task.area ? ` at ${task.area}` : ''}? This removes it from this day’s report.`)) return;
    replaceTasks(day(), day().tasks.filter(value => value.id !== task.id), 'Delete entry');
  } else if (button.dataset.action === 'complete') replaceTasks(day(), day().tasks.map(value => value.id === task.id ? { ...value, status: task.status === 'Completed' ? 'In progress' : 'Completed' } : value), 'Change status');
  persist(); renderTasks();
});

$('task-list').addEventListener('input', event => {
  const form = event.target.closest('[data-edit-id]');
  if (form && event.target.dataset.inlineField) inlineEdits.get(editKey(form.dataset.editId))[event.target.dataset.inlineField] = event.target.value;
});
$('task-list').addEventListener('change', event => {
  const id = event.target.dataset.selectId;
  if (!id) return;
  if (event.target.checked) selectedTasks.add(id); else selectedTasks.delete(id);
  updateSelection();
});
$('task-list').addEventListener('keydown', event => {
  const form = event.target.closest('[data-edit-id]');
  if (form && (event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
});
$('task-list').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target.closest('[data-edit-id]');
  if (!form) return;
  try {
    const id = form.dataset.editId, original = day().tasks.find(task => task.id === id), draft = inlineEdits.get(editKey(id));
    if (!original || !draft) throw new Error('This entry is no longer available.');
    const task = validateTask(currentInlineTask(id));
    replaceTasks(day(), day().tasks.map(value => value.id === id ? task : value), 'Edit entry');
    inlineEdits.delete(editKey(id));
    const saved = persist(); renderTasks();
    toast(saved ? 'Changes saved — Undo is available' : 'Changes made — export a backup to keep them');
  } catch (error) { form.querySelector('.inline-error').textContent = error.message; form.querySelector('.inline-error').hidden = false; }
});
$('log-view').addEventListener('change', renderTasks);
$('select-all').addEventListener('change', event => { selectedTasks.clear(); if (event.target.checked) day().tasks.forEach(task => selectedTasks.add(task.id)); renderTasks(); });
$('clear-selection').addEventListener('click', () => { selectedTasks.clear(); renderTasks(); });
for (const field of ['category', 'area']) $(`bulk-${field}-apply`).addEventListener('change', event => { $(`bulk-${field}`).disabled = !event.target.checked; updateSelection(); });
$('bulk-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!selectedTasks.size) return;
  if ([...selectedTasks].some(id => inlineEdits.has(editKey(id)))) return toast('Save or cancel the selected entries’ inline edits first.');
  const patch = {};
  if ($('bulk-category-apply').checked) patch.category = $('bulk-category').value;
  if ($('bulk-area-apply').checked) patch.area = $('bulk-area').value.trim();
  if (!Object.keys(patch).length) return;
  replaceTasks(day(), day().tasks.map(task => selectedTasks.has(task.id) ? { ...task, ...patch } : task), 'Organize selected entries');
  const count = selectedTasks.size, saved = persist();
  selectedTasks.clear(); renderTasks();
  toast(saved ? `${count} entries organized — Undo is available` : 'Changes made — export a backup to keep them');
});
$('undo-log').addEventListener('click', () => {
  if ([...inlineEdits.keys()].some(key => key.startsWith(`${activeDate}:`))) return toast('Save or cancel the inline edits before undoing a log change.');
  if (!undoTasks(day())) return;
  const saved = persist(); renderTasks();
  toast(saved ? 'Last log change undone' : 'Change undone — export a backup to keep it');
});
$('bring-forward').addEventListener('click', () => {
  const dates = Object.keys(state.days).filter(date => date < activeDate && state.days[date].tasks.length).sort().reverse();
  $('carry-date').innerHTML = dates.length ? dates.map(date => `<option value="${date}">${esc(dateLabel(date))}</option>`).join('') : '<option value="">No earlier work days saved</option>';
  $('carry-panel').hidden = false; $('bring-forward').setAttribute('aria-expanded', 'true');
  renderCarryList(); $('carry-date').focus();
});
$('close-carry').addEventListener('click', () => { $('carry-panel').hidden = true; $('bring-forward').setAttribute('aria-expanded', 'false'); $('bring-forward').focus(); });
$('carry-date').addEventListener('change', renderCarryList);
$('carry-list').addEventListener('change', () => { $('save-carry').disabled = !$('carry-list').querySelector('input:checked'); });
$('save-carry').addEventListener('click', () => {
  try {
    const ids = [...$('carry-list').querySelectorAll('input:checked')].map(input => input.dataset.carryId);
    if (!ids.length) return;
    replaceTasks(day(), carryTasks(state.days[$('carry-date').value], day(), ids), 'Bring work forward');
    const saved = persist(); renderTasks();
    toast(saved ? `${ids.length} ${ids.length === 1 ? 'entry' : 'entries'} ready for today’s progress` : 'Entries added — export a backup to keep them');
  } catch (error) { $('carry-error').textContent = error.message; $('carry-error').hidden = false; }
});
window.addEventListener('beforeunload', event => { if (inlineEdits.size) { event.preventDefault(); event.returnValue = ''; } });
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
function previewContextFor(target) {
  if (livePreview.contains(target)) return null;
  if (target.closest('#task-form')) return { kind: 'task' };
  const inline = target.closest('[data-edit-id]');
  if (inline) return { kind: 'inline', id: inline.dataset.editId };
  if (target.closest('#paste-form')) return { kind: 'review' };
  if (target.closest('#quick-form')) return { kind: 'paste' };
  if (target.closest('#update-form')) return { kind: 'single' };
  return null;
}
for (const eventName of ['input', 'change', 'focusin']) document.addEventListener(eventName, event => {
  const context = previewContextFor(event.target);
  if (!context) return;
  if (eventName === 'focusin' && previewContext.kind === 'log' && ((context.kind === 'single' && !$('update-title').value.trim() && !$('update-description').value.trim()) || (context.kind === 'paste' && !$('quick-notes').value.trim()))) return;
  previewContext = context;
  renderLivePreview();
});
// Structural edits such as adding/removing a cable length also refresh the table.
$('task-form').addEventListener('click', event => { if (!livePreview.contains(event.target) && event.target.closest('button')) renderLivePreview(); });
$('task-dialog').addEventListener('close', renderLivePreview);
livePreview.addEventListener('click', event => {
  const button = event.target.closest('[data-preview-format]');
  if (!button) return;
  $('report-detail').checked = button.dataset.previewFormat === 'detailed';
  renderLivePreview();
});
$('report-detail').addEventListener('change', renderLivePreview);
previewDesktop.addEventListener('change', renderLivePreview);
// The shortcut opens a destination only; report content is never put in the URL.
function renderTeamsShortcut() {
  const url = teamsDestination(state.teamsTarget);
  $('teams-target').value = state.teamsTarget;
  $('open-teams').hidden = !url;
  if (url) $('open-teams').href = url;
  else $('open-teams').removeAttribute('href');
  $('teams-shortcut').querySelector('summary').textContent = url ? 'Change Teams shortcut' : 'Set up a Teams shortcut · optional';
}
$('teams-form').addEventListener('submit', event => {
  event.preventDefault();
  $('teams-error').hidden = true;
  try {
    const value = $('teams-target').value.trim();
    teamsDestination(value);
    state.teamsTarget = value;
    const saved = persist(false);
    renderTeamsShortcut();
    $('teams-status').textContent = saved ? value ? 'Shortcut saved on this device. Use Open Teams when ready to share.' : 'Shortcut cleared.' : 'Could not save the shortcut. Export a backup to keep it.';
  } catch (error) { $('teams-error').textContent = error.message; $('teams-error').hidden = false; $('teams-status').textContent = ''; }
});
$('clear-teams').addEventListener('click', () => { $('teams-target').value = ''; $('teams-form').requestSubmit(); });

let lastLinkField = null, linkFields = [], linkRanges = [];
for (const id of ['shift-supervisor', 'shift-lead', 'shift-crew', 'update-title', 'update-description', 'quick-notes', 'task-title', 'task-description', 'task-notes']) $(id).dataset.linkable = '';
document.addEventListener('focusin', event => { if (event.target.matches('[data-linkable]')) lastLinkField = event.target; });
function updateLinkHelp() {
  const person = $('link-type').value === 'person';
  $('link-value-label').textContent = person ? 'Work email / Teams sign-in name' : 'Link address';
  $('link-value').placeholder = person ? 'name@company.com' : 'https://…';
  $('link-help').textContent = person ? 'The name becomes a link to a Teams chat. It does not tag or notify them. For a real @mention, choose the person in Teams before sending.' : 'The report shows your label as a clickable link. Pasting a full URL into your notes works too.';
}
function selectLinkField() {
  const index = Number($('link-field').value), field = linkFields[index], range = linkRanges[index];
  $('link-label').value = field.value.slice(range.start, range.end);
  $('link-error').hidden = true;
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-insert-link]');
  if (!button) return;
  const scope = button.closest('.paste-entry, form, .shift-body');
  linkFields = [...scope.querySelectorAll('[data-linkable]')];
  const previous = linkFields.includes(lastLinkField) ? lastLinkField : linkFields.find(field => field.tagName === 'TEXTAREA') || linkFields[0];
  linkRanges = linkFields.map(field => field === lastLinkField ? { start: field.selectionStart, end: field.selectionEnd } : { start: field.value.length, end: field.value.length });
  $('link-field').innerHTML = linkFields.map((field, index) => `<option value="${index}">${esc((field.getAttribute('aria-label') || field.labels?.[0]?.textContent || 'Update').replace(/\s+/g, ' ').trim())}</option>`).join('');
  $('link-field').value = String(linkFields.indexOf(previous));
  $('link-type').value = scope.matches('.shift-body') ? 'person' : 'url';
  $('link-value').value = '';
  selectLinkField(); updateLinkHelp();
  $('link-dialog').showModal();
  $($('link-label').value ? 'link-value' : 'link-label').focus();
});
$('link-field').addEventListener('change', selectLinkField);
$('link-type').addEventListener('change', updateLinkHelp);
for (const id of ['close-link', 'cancel-link']) $(id).addEventListener('click', () => $('link-dialog').close());
$('link-form').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const index = Number($('link-field').value), field = linkFields[index], { start, end } = linkRanges[index];
    if (!field?.isConnected) throw new Error('This field is no longer open. Close the helper and try again.');
    let link = makeLink($('link-label').value, $('link-value').value, $('link-type').value === 'person');
    if (start === end) {
      if (start && !/\s/.test(field.value[start - 1])) link = (field.id === 'shift-crew' ? '\n' : ' ') + link;
      if (end < field.value.length && !/\s/.test(field.value[end])) link += ' ';
    }
    if (field.maxLength >= 0 && field.value.length - (end - start) + link.length > field.maxLength) throw new Error('That link is too long for this field. Add it in the description or progress instead.');
    field.setRangeText(link, start, end, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    $('link-dialog').close(); field.focus();
  } catch (error) { $('link-error').textContent = error.message; $('link-error').hidden = false; }
});
fillDay();
if (day().header.location && day().header.crew) $('shift-details').open = false;
