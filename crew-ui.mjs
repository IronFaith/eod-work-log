import { memberFrom, sameMember, mergeMembers, readCrewTable, crewCsv } from './crew.mjs?v=4.0';
import { escapeHTML as esc, displayText } from './links.mjs?v=4.0';

export function setupCrew({ getState, day, persist, toast, showTab, downloadFile }) {
  const $ = id => document.getElementById(id);
  let editing = null, importRows = [], removed = null;
  const picked = member => day().crewMembers.some(value => sameMember(value, member));
  function renderShiftCrew() {
    const members = day().crewMembers;
    $('shift-crew-count').textContent = `${members.length} selected ${members.length === 1 ? 'member' : 'members'}`;
    $('shift-crew-list').innerHTML = members.length ? members.map(member => `<div class="crew-chip"><span>${esc(member.name)}${member.team ? `<small>${esc(member.team)}</small>` : ''}</span><button type="button" class="text-button" data-remove-crew="${esc(member.id)}" aria-label="Remove ${esc(member.name)} from this shift">×</button></div>`).join('') : '<p class="small muted">Choose saved members or import a crew for this shift.</p>';
    $('legacy-crew').open = !!day().header.crew.trim();
    $('export-shift-crew').disabled = !members.length && !day().header.crew.trim();
  }
  function renderRoster() {
    const state = getState(), group = $('roster-group').value, query = $('roster-search').value.trim().toLowerCase();
    const groups = [...new Set(state.members.map(member => member.team).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    $('roster-group').innerHTML = '<option value="">All teams / shift groups</option>' + groups.map(team => `<option value="${esc(team)}">${esc(team)}</option>`).join('');
    $('roster-group').value = groups.includes(group) ? group : '';
    const members = state.members.filter(member => (!$('roster-group').value || member.team === $('roster-group').value) && `${member.name} ${member.email} ${member.team}`.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    $('roster-summary').textContent = `${members.length} of ${state.members.length} in library · ${day().crewMembers.length} selected for ${day().date}`;
    $('roster-list').innerHTML = members.map(member => `<article class="roster-row"><label class="check-label"><input type="checkbox" data-member-id="${esc(member.id)}" aria-label="Use ${esc(member.name)} on this shift"${picked(member) ? ' checked' : ''}><span><strong>${esc(member.name)}</strong><small>${esc([member.team, member.email].filter(Boolean).join(' · '))}</small></span></label><div><button class="text-button" type="button" data-edit-member="${esc(member.id)}" aria-label="Edit ${esc(member.name)}">Edit</button><button class="text-button danger-text" type="button" data-remove-member="${esc(member.id)}" aria-label="Remove ${esc(member.name)} from library">Remove</button></div></article>`).join('') || '<p class="empty-state">No matching members. Add a member or import your crew from Excel.</p>';
    $('export-roster').disabled = !state.members.length;
    renderShiftCrew();
  }
  function addToShift(members) {
    const next = [...day().crewMembers];
    for (const member of members) if (!next.some(value => sameMember(value, member))) next.push({ ...member });
    if (next.length > 200) throw new Error('Use up to 200 members on a shift.');
    day().crewMembers = next;
  }
  function memberForm(member = null) {
    editing = member?.id || null;
    $('member-form').reset(); $('member-error').textContent = '';
    $('member-dialog-title').textContent = member ? 'Edit library member' : 'Add crew member';
    for (const key of ['name', 'email', 'team']) $(`member-${key}`).value = member?.[key] || '';
    $('member-use').checked = !member; $('member-use-label').hidden = !!member;
    $('member-dialog').showModal(); $('member-name').focus();
  }
  function openImport(use) {
    importRows = []; $('crew-import-source').value = ''; $('crew-import-file').value = '';
    $('crew-import-preview').hidden = true; $('crew-import-error').textContent = ''; $('crew-import-use').checked = use;
    $('crew-import-dialog').showModal(); $('crew-import-source').focus();
  }
  function previewImport() {
    try {
      importRows = readCrewTable($('crew-import-source').value);
      $('crew-import-list').innerHTML = importRows.map((member, index) => `<label class="check-label import-member"><input type="checkbox" data-import-index="${index}" checked><span>${esc(member.name)}<small>${esc([member.email, member.team].filter(Boolean).join(' · '))}</small></span></label>`).join('');
      $('crew-import-preview').hidden = false; $('crew-import-error').textContent = '';
      updateImportCount();
    } catch (error) { $('crew-import-preview').hidden = true; $('crew-import-error').textContent = error.message; }
  }
  function updateImportCount() {
    const count = $('crew-import-list').querySelectorAll('input:checked').length;
    $('crew-import-save').textContent = `Import ${count} ${count === 1 ? 'member' : 'members'}`; $('crew-import-save').disabled = !count;
  }
  $('choose-crew').addEventListener('click', () => showTab('crew'));
  $('crew-done').addEventListener('click', () => showTab('shift'));
  $('roster-search').addEventListener('input', renderRoster);
  $('roster-group').addEventListener('change', renderRoster);
  $('add-member').addEventListener('click', () => memberForm());
  $('close-member').addEventListener('click', () => $('member-dialog').close());
  $('member-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const state = getState(), member = memberFrom({ id: editing || undefined, name: $('member-name').value, email: $('member-email').value, team: $('member-team').value });
      if (state.members.some(value => value.id !== editing && sameMember(value, member))) throw new Error('This person is already in the library. Edit their existing entry.');
      if (!editing && state.members.length >= 2000) throw new Error('Use up to 2,000 members in the library.');
      if (!editing && $('member-use').checked) addToShift([member]);
      state.members = editing ? state.members.map(value => value.id === editing ? member : value) : [...state.members, member];
      const saved = persist(); $('member-dialog').close(); renderRoster();
      toast(saved ? 'Member saved. Existing shift records keep their crew details.' : 'Member added — export a backup to keep it');
    } catch (error) { $('member-error').textContent = error.message; }
  });
  $('roster-list').addEventListener('change', event => {
    const member = getState().members.find(value => value.id === event.target.dataset.memberId);
    if (!member) return;
    try {
      if (event.target.checked) addToShift([member]); else day().crewMembers = day().crewMembers.filter(value => !sameMember(value, member));
      persist(); renderRoster();
    } catch (error) { toast(error.message); renderRoster(); }
  });
  $('roster-list').addEventListener('click', event => {
    const button = event.target.closest('[data-edit-member], [data-remove-member]');
    if (!button) return;
    const member = getState().members.find(value => value.id === (button.dataset.editMember || button.dataset.removeMember));
    if (!member) return;
    if (button.dataset.editMember) return memberForm(member);
    removed = member; getState().members = getState().members.filter(value => value.id !== member.id);
    persist(false); renderRoster(); $('undo-member-remove').hidden = false;
    toast('Removed from library. Saved shifts still keep this member.');
  });
  $('undo-member-remove').addEventListener('click', () => {
    if (removed) getState().members = mergeMembers(getState().members, [removed]).members;
    removed = null; persist(false); renderRoster(); $('undo-member-remove').hidden = true;
  });
  $('shift-crew-list').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-crew]');
    if (!button) return;
    day().crewMembers = day().crewMembers.filter(member => member.id !== button.dataset.removeCrew);
    persist(); renderShiftCrew();
  });
  $('import-shift-crew').addEventListener('click', () => openImport(true));
  $('import-roster').addEventListener('click', () => openImport(false));
  $('close-crew-import').addEventListener('click', () => $('crew-import-dialog').close());
  $('crew-import-source').addEventListener('input', () => { importRows = []; $('crew-import-preview').hidden = true; });
  $('crew-import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 1e6) throw new Error('Choose a CSV smaller than 1 MB.');
      if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error('In Excel, save the file as CSV UTF-8, then import that CSV.');
      $('crew-import-source').value = await file.text(); previewImport();
    } catch (error) { importRows = []; $('crew-import-preview').hidden = true; $('crew-import-error').textContent = error.message; }
  });
  $('crew-import-review').addEventListener('click', previewImport);
  $('crew-import-list').addEventListener('change', updateImportCount);
  $('crew-import-save').addEventListener('click', () => {
    try {
      const rows = [...$('crew-import-list').querySelectorAll('input:checked')].map(input => importRows[Number(input.dataset.importIndex)]);
      if (!rows.length) return;
      const result = mergeMembers(getState().members, rows);
      if ($('crew-import-use').checked) addToShift(result.imported);
      getState().members = result.members;
      const saved = persist(); $('crew-import-dialog').close(); renderRoster();
      toast(saved ? `${result.imported.length} members imported${$('crew-import-use').checked ? ' and selected for this shift' : ' to the library'}` : 'Crew imported — export a backup to keep it');
    } catch (error) { $('crew-import-error').textContent = error.message; }
  });
  const csv = (members, filename) => downloadFile(crewCsv(members), filename, 'text/csv;charset=utf-8');
  $('crew-template').addEventListener('click', () => csv([{ name: 'Example Technician', email: 'technician@example.com', team: 'Night crew' }], 'crew-template.csv'));
  $('export-roster').addEventListener('click', () => csv(getState().members, 'crew-library.csv'));
  $('export-shift-crew').addEventListener('click', () => {
    const members = [...day().crewMembers];
    for (const line of day().header.crew.split('\n').filter(line => line.trim())) {
      const name = displayText(line).trim();
      if (!members.some(member => member.name.toLowerCase() === name.toLowerCase())) members.push({ name, email: '', team: '' });
    }
    csv(members, `crew-${day().date}.csv`);
  });
  return { renderRoster, renderShiftCrew };
}
