import { readPastedTables, reportTablesFrom } from './table-data.mjs?v=5.4';
import { IMPORT_FIELDS, tableColumns, suggestMapping, mapTable } from './table-import.mjs?v=5.4';
import { escapeHTML as esc, shiftLabel } from './model.mjs?v=5.4';
import { createShift } from './planner.mjs?v=5.4';
import { writeTable } from './crew.mjs?v=5.4';

export function setupTableImport({ getState, day, getActiveId, persist, toast, acceptTasks, acceptCrew, refresh, showReport, downloadFile }) {
  const $ = id => document.getElementById(id);
  let tables = [], columns = null, mapping = [], selected = new Set(), page = 0, targetId = '', clipboardHTML = '', lastRemoved = null, fileRevision = 0;
  const kind = () => $('table-kind').value;
  const target = () => getState().days[targetId];
  const fail = error => { $('table-error').textContent = error.message; $('table-error').hidden = false; };
  function open(type = 'tasks', useCrew = false) {
    targetId = getActiveId(); tables = []; columns = null; clipboardHTML = ''; fileRevision++;
    $('table-source').value = ''; $('table-source').placeholder = 'Copy a range in Excel, then paste here. CSV, tab-separated cells, web tables, and Markdown tables work too.'; $('table-file').value = ''; $('table-kind').value = type;
    $('table-crew-use').checked = useCrew; $('table-headers').checked = true; $('table-report-title').value = '';
    $('table-paste-step').hidden = false; $('table-map-step').hidden = true; $('table-error').hidden = true;
    $('table-scope').textContent = `Selected shift: ${day().date} · ${day().shiftName || 'My shift'}`;
    $('table-import-dialog').showModal(); $('table-source').focus();
  }
  document.querySelectorAll('[data-import-table]').forEach(button => button.addEventListener('click', () => open(button.dataset.importTable || 'tasks', button.dataset.crewUse === 'true')));
  $('table-close').addEventListener('click', () => { fileRevision++; $('table-import-dialog').close(); });
  $('table-source').addEventListener('paste', event => {
    const html = event.clipboardData?.getData('text/html') || '', text = event.clipboardData?.getData('text/plain') || '';
    if (html || text) { event.preventDefault(); fileRevision++; clipboardHTML = html; $('table-source').value = text; if (!text) $('table-source').placeholder = 'Table copied. Choose columns to review its cells.'; }
  });
  $('table-source').addEventListener('input', () => { clipboardHTML = ''; fileRevision++; });
  $('table-file').addEventListener('change', async event => {
    const file = event.target.files[0], revision = ++fileRevision; if (!file) return;
    try {
      if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error('Copy cells from the workbook, or export it as CSV / TSV first.');
      if (file.size > 1e6) throw new Error('Choose a file smaller than 1 MB.');
      const text = await file.text(); if (revision !== fileRevision) return;
      clipboardHTML = ''; $('table-source').value = text; $('table-error').hidden = true;
    } catch (error) { if (revision === fileRevision) fail(error); }
  });
  function chooseTable() {
    try {
      columns = tableColumns(tables[Number($('table-number').value)].rows, $('table-headers').checked);
      mapping = suggestMapping(columns.headers, kind()); selected = new Set(columns.rows.map((_, i) => i)); page = 0;
      $('table-shift-mode').value = columns.rows.length === 1 ? 'current' : 'new';
      renderMapping();
    } catch (error) { columns = null; $('table-mapping').innerHTML = ''; $('table-preview').innerHTML = ''; $('table-apply').disabled = true; fail(error); }
  }
  $('table-read').addEventListener('click', () => {
    try {
      tables = readPastedTables($('table-source').value, clipboardHTML);
      $('table-number').innerHTML = tables.map((table, i) => `<option value="${i}">${esc(table.name)} · ${table.rows.length} rows</option>`).join('');
      $('table-number-label').hidden = tables.length < 2;
      $('table-paste-step').hidden = true; $('table-map-step').hidden = false; chooseTable();
    } catch (error) { fail(error); }
  });
  $('table-back').addEventListener('click', () => { $('table-paste-step').hidden = false; $('table-map-step').hidden = true; $('table-error').hidden = true; });
  for (const id of ['table-number','table-headers']) $(id).addEventListener('change', chooseTable);
  $('table-kind').addEventListener('change', () => { if (columns) { mapping = suggestMapping(columns.headers, kind()); renderMapping(); } });
  function renderMapping() {
    $('table-crew-options').hidden = kind() !== 'crew'; $('table-shift-options').hidden = kind() !== 'shifts'; $('table-report-options').hidden = kind() !== 'report';
    $('table-mapping').innerHTML = columns.headers.map((header, index) => `<label class="table-column"><span>${esc(header)}</span><select data-map-column="${index}" aria-label="Use column ${index + 1}: ${esc(header)}">${Object.entries(IMPORT_FIELDS[kind()]).map(([value,label]) => `<option value="${value}"${mapping[index] === value ? ' selected' : ''}>${label}</option>`).join('')}</select>${kind() === 'report' ? `<input data-table-heading="${index}" maxlength="120" value="${esc(header)}" aria-label="Heading for column ${index + 1}">` : ''}</label>`).join('');
    renderPreview();
  }
  $('table-mapping').addEventListener('change', event => {
    if (event.target.dataset.mapColumn != null) mapping[Number(event.target.dataset.mapColumn)] = event.target.value;
    if (event.target.dataset.tableHeading != null) columns.headers[Number(event.target.dataset.tableHeading)] = event.target.value;
    renderPreview();
  });
  function prepare() {
    if (!selected.size) throw new Error('Select at least one row to import.');
    if (getActiveId() !== targetId || !target()) throw new Error('The selected shift changed. Close this importer and open it from the correct shift.');
    const data = { headers: columns.headers, rows: columns.rows.filter((_, i) => selected.has(i)) };
    const result = mapTable(data, mapping, kind(), { dateOrder: $('table-date-order').value, title: $('table-report-title').value.trim() || 'Additional table', selectedDate: $('table-shift-mode').value === 'current' ? target().date : '' });
    if (kind() === 'shifts') {
      if ($('table-shift-mode').value === 'current') {
        if (result.length !== 1) throw new Error('Select one row to apply to this shift, or choose Create new shifts.');
        if (result[0].date !== target().date) throw new Error(`This row is for ${result[0].date}. Choose Create new shifts, or import a row for ${target().date}.`);
      } else {
        const keys = new Set();
        for (const row of result) {
          const header = { ...getState().defaults, ...row.header };
          const signature = JSON.stringify([row.date,row.name.toLowerCase(),header.start,header.location]);
          if (keys.has(signature) || Object.values(getState().days).some(shift => (shift.updatedAt || shift.shiftName || shift.tasks.length || shift.header.start) && shift.date === row.date && shift.shiftName.toLowerCase() === row.name.toLowerCase() && shift.header.start === header.start && shift.header.location === header.location)) throw new Error(`A matching shift already exists for ${row.date} ${row.name}. Deselect that row, change its name, or apply one row to the selected shift.`);
          keys.add(signature);
        }
      }
    }
    return result;
  }
  function renderPreview() {
    if (!columns) return;
    const lastPage = Math.max(0, Math.ceil(columns.rows.length / 50) - 1); page = Math.min(page,lastPage);
    const start = page * 50, shown = columns.rows.slice(start,start + 50);
    $('table-preview').innerHTML = `<table><thead><tr><th>Use</th>${columns.headers.map((header,i) => `<th${mapping[i] === 'ignore' ? ' class="table-ignored"' : ''}>${esc(header)}<small>${esc(IMPORT_FIELDS[kind()][mapping[i]])}</small></th>`).join('')}</tr></thead><tbody>${shown.map((row, i) => `<tr><td><input type="checkbox" data-table-row="${start+i}" aria-label="Import data row ${start+i+1}"${selected.has(start+i) ? ' checked' : ''}></td>${row.map((cell,col) => `<td${mapping[col] === 'ignore' ? ' class="table-ignored"' : ''}>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $('table-all-rows').checked = selected.size === columns.rows.length; $('table-all-rows').indeterminate = !!selected.size && selected.size !== columns.rows.length;
    $('table-page').textContent = `${start+1}–${Math.min(start+50,columns.rows.length)} of ${columns.rows.length} rows · ${selected.size} selected`;
    $('table-previous').disabled = page === 0; $('table-next').disabled = page === lastPage;
    const ignored = columns.headers.filter((_,i) => mapping[i] === 'ignore');
    $('table-ignored-note').textContent = ignored.length ? `Not imported: ${ignored.join(', ')}. Change the matches above to keep those columns${kind() !== 'report' ? ', or choose Report table to keep the original columns' : ''}.` : kind() === 'tasks' ? 'Columns marked Keep in details are saved with their original headings.' : 'Review the columns and selected rows before continuing.';
    $('table-error').hidden = true; $('table-apply').disabled = false; $('table-result-note').textContent = '';
    $('table-apply').textContent = kind() === 'tasks' ? 'Review tasks' : kind() === 'crew' ? 'Review members' : kind() === 'report' ? 'Add table to report' : $('table-shift-mode').value === 'new' ? 'Create selected shifts' : 'Apply to selected shift';
    try {
      const result = prepare();
      if (kind() === 'shifts') $('table-result-note').textContent = result.slice(0,10).map(row => `${row.date} · ${row.name || 'Shift'} · ${shiftLabel({ ...($('table-shift-mode').value === 'current' ? target().header : getState().defaults), ...row.header })}${row.header.crew ? ` · Crew: ${row.header.crew}` : ''}`).join('\n') + (result.length > 10 ? `\n…and ${result.length-10} more shifts.` : '');
    } catch (error) { $('table-apply').disabled = true; fail(error); }
  }
  $('table-preview').addEventListener('change', event => { const index = event.target.dataset.tableRow; if (index == null) return; if (event.target.checked) selected.add(Number(index)); else selected.delete(Number(index)); renderPreview(); });
  $('table-all-rows').addEventListener('change', () => { selected = $('table-all-rows').checked ? new Set(columns.rows.map((_,i) => i)) : new Set(); renderPreview(); });
  $('table-previous').addEventListener('click', () => { page--; renderPreview(); }); $('table-next').addEventListener('click', () => { page++; renderPreview(); });
  for (const id of ['table-shift-mode','table-date-order','table-report-title']) $(id).addEventListener('change', renderPreview);
  $('table-apply').addEventListener('click', () => {
    try {
      const result = prepare();
      if (kind() === 'tasks') { acceptTasks(result); $('table-import-dialog').close(); return; }
      if (kind() === 'crew') { $('table-import-dialog').close(); acceptCrew(result, $('table-crew-use').checked); return; }
      if (kind() === 'report') {
        target().reportTables = reportTablesFrom([...(target().reportTables || []), result]);
        const saved = persist(); $('table-import-dialog').close(); showReport(); toast(saved ? 'Table added to this report' : 'Table added — export a backup to keep it'); return;
      }
      // Prepare every shift on a copy before committing any import.
      const state = getState(), staged = structuredClone(state);
      for (const row of result) {
        const shift = $('table-shift-mode').value === 'current' ? staged.days[targetId] : createShift(staged,row.date,{ name: row.name });
        if (row.name) shift.shiftName = row.name;
        Object.assign(shift.header,row.header);
        if (row.header.crew) shift.crewMembers = [];
        if (row.duration) shift.shiftDuration = row.duration;
        else if (row.header.start || row.header.end) shift.shiftDuration = '';
        shift.updatedAt = new Date().toISOString();
      }
      state.days = staged.days; const saved = persist(false); $('table-import-dialog').close(); refresh();
      toast(saved ? `${result.length} ${result.length === 1 ? 'shift' : 'shifts'} imported` : 'Shifts imported — export a backup to keep them');
    } catch (error) { fail(error); }
  });
  function renderReportTables() {
    const tables = day().reportTables || [];
    $('report-tables-count').textContent = tables.length ? ` (${tables.length})` : '';
    $('report-table-list').innerHTML = tables.map(table => `<div class="report-table-item" data-report-table="${esc(table.id)}"><label>Table title<input data-table-title maxlength="80" value="${esc(table.title)}"></label><p class="small muted">${table.rows.length} rows · ${table.headers.length} columns</p><label class="check-label"><input data-table-include type="checkbox"${table.include ? ' checked' : ''}>Include in report &amp; PDF</label><div class="copy-actions"><button class="text-button" type="button" data-table-export>Export CSV</button><button class="text-button danger-text" type="button" data-table-remove>Remove table</button></div></div>`).join('') || '<p class="small muted">Keep reference data in its own table. It does not change task counts.</p>';
    $('undo-table-remove').hidden = !lastRemoved || lastRemoved.shift !== getActiveId();
  }
  $('report-table-list').addEventListener('change', event => {
    const table = day().reportTables.find(table => table.id === event.target.closest('[data-report-table]')?.dataset.reportTable); if (!table) return;
    if (event.target.matches('[data-table-title]')) { table.title = event.target.value.trim() || table.title; event.target.value = table.title; }
    if (event.target.matches('[data-table-include]')) table.include = event.target.checked;
    persist(); showReport();
  });
  $('report-table-list').addEventListener('click', event => {
    const index = (day().reportTables || []).findIndex(table => table.id === event.target.closest('[data-report-table]')?.dataset.reportTable); if (index < 0) return;
    const table = day().reportTables[index];
    if (event.target.matches('[data-table-export]')) downloadFile(writeTable([table.headers,...table.rows]), `report-table-${day().date}.csv`, 'text/csv;charset=utf-8');
    if (event.target.matches('[data-table-remove]')) { lastRemoved = { shift: getActiveId(), table, index }; day().reportTables.splice(index,1); persist(); showReport(); }
  });
  $('undo-table-remove').addEventListener('click', () => {
    if (!lastRemoved || lastRemoved.shift !== getActiveId()) return;
    try { const next = [...day().reportTables]; next.splice(lastRemoved.index,0,lastRemoved.table); day().reportTables = reportTablesFrom(next); lastRemoved = null; persist(); showReport(); } catch (error) { toast(error.message); }
  });
  return { open, renderReportTables };
}
