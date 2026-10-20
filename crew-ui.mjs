import { memberFrom, sameMember, mergeMembers, readCrewTable, crewCsv } from './crew.mjs?v=5.5';
import { escapeHTML as esc, displayText } from './links.mjs?v=5.5';

export function setupCrew({ getState, day, persist, toast, showTab, downloadFile, isLibrary = () => false }) {
  const $ = id => document.getElementById(id);
  let editing = null, importRows = [], removed = null;
  const picked = member => day().crewMembers.some(value => sameMember(value, member));
  function renderShiftCrew() {
    const members = day().crewMembers;
    $('shift-crew-count').textContent = `${members.length} selected ${members.length === 1 ? 'member' : 'members'}`;
    $('shift-crew-list').innerHTML = members.length ? members.map(member => `<div class="crew-chip"><span>${esc(member.name)}${member.team ? `<small>${esc(member.team)}</small>` : ''}</span><button type="button" class="text-button" data-remove-crew="${esc(member.id)}" aria-label="Remove ${esc(member.name)} from this shift">×</button></div>`).join('') : '<p class="small muted">Choose saved members or paste names for this shift.</p>';
    $('legacy-crew').open = !!day().header.crew.trim();
    $('export-shift-crew').disabled = !members.length && !day().header.crew.trim();
  }
  function renderRoster() {
    const library = isLibrary();
    $('crew-heading').textContent = library ? 'Saved members' : 'Members for this shift';
    $('crew-help').textContent = library ? 'Add, edit, or import reusable members. This screen does not change a shift’s crew.' : 'Check the members working this shift. Your selections save immediately.';
    $('crew-done').textContent = library ? 'Done · Tools' : 'Done · Shift & crew';
    $('import-roster').dataset.crewUse = String(!library);
    $('manage-crew-library').hidden = library;
    $('undo-member-remove').hidden = !library || !removed;
    const state = getState(), group = $('roster-group').value, query = $('roster-search').value.trim().toLowerCase();
    const groups = [...new Set(state.members.map(member => member.team).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    $('roster-group').innerHTML = '<option value="">All teams / shift groups</option>' + groups.map(team => `<option value="${esc(team)}">${esc(team)}</option>`).join('');
    $('roster-group').value = groups.includes(group) ? group : '';
    const members = state.members.filter(member => (!$('roster-group').value || member.team === $('roster-group').value) && `${member.name} ${member.email} ${member.team}`.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    $('roster-summary').textContent = `${members.length} of ${state.members.length} in library${library ? '' : ` · ${day().crewMembers.length} selected for this shift`}`;
    $('roster-list').innerHTML = members.map(member => {
      const name = `<span><strong>${esc(member.name)}</strong><small>${esc([member.team, member.email].filter(Boolean).join(' · '))}</small></span>`;
      return `<article class="roster-row">${library ? `<div class="member-identity">${name}</div><div><button class="text-button" type="button" data-edit-member="${esc(member.id)}" aria-label="Edit ${esc(member.name)}">Edit</button><button class="text-button danger-text" type="button" data-remove-member="${esc(member.id)}" aria-label="Remove ${esc(member.name)} from library">Remove</button></div>` : `<label class="check-label"><input type="checkbox" data-member-id="${esc(member.id)}" aria-label="Use ${esc(member.name)} on this shift"${picked(member) ? ' checked' : ''}>${name}</label>`}</article>`;
    }).join('') || '<p class="empty-state">No matching members. Add a member or import your crew from Excel.</p>';
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
    $('member-use').checked = !member && !isLibrary(); $('member-use-label').hidden = !!member || isLibrary();
    $('member-dialog').showModal(); $('member-name').focus();
  }
  function openImport(use) {
    importRows = []; $('crew-import-source').value = '';
    $('crew-import-format').value = 'auto';
    $('crew-import-preview').hidden = true; $('crew-import-error').textContent = ''; $('crew-import-use').checked = use && !isLibrary();
    $('crew-import-use').closest('label').hidden = isLibrary();
    $('crew-import-title').textContent = isLibrary() ? 'Review library members' : 'Review crew members';
    $('crew-import-inputs').open = false;
    $('crew-import-dialog').showModal();
  }
  function previewImport() {
    try {
      importRows = mergeMembers([], readCrewTable($('crew-import-source').value, { format: $('crew-import-format').value })).imported;
      $('crew-import-list').innerHTML = importRows.map((member, index) => {
        const matches = getState().members.filter(saved => sameMember(saved, member));
        const details = matches.length === 1 ? matches[0] : member;
        const label = matches.length > 1 ? 'Choose the saved member below' : matches.length ? 'Already saved · reuse member' : 'New member';
        return `<div class="import-member"><label class="check-label"><input type="checkbox" data-import-index="${index}" checked><span>${esc(member.name)}<small>${esc(label)}</small><small>${esc([details.email, details.team].filter(Boolean).join(' · '))}</small></span></label>${matches.length > 1 ? `<label>Which ${esc(member.name)}?<select data-import-match="${index}"><option value="">Choose a saved member</option>${matches.map(saved => `<option value="${esc(saved.id)}">${esc([saved.name, saved.email, saved.team].filter(Boolean).join(' · '))}</option>`).join('')}</select></label>` : ''}</div>`;
      }).join('');
      $('crew-import-preview').hidden = false; $('crew-import-error').textContent = '';
      updateImportCount();
    } catch (error) { $('crew-import-preview').hidden = true; $('crew-import-error').textContent = error.message; }
  }
  function updateImportCount() {
    const selected = [...$('crew-import-list').querySelectorAll('input:checked')], count = selected.length;
    const unresolved = selected.some(input => { const choice = input.closest('.import-member').querySelector('select'); return choice && !choice.value; });
    $('crew-import-save').textContent = unresolved ? 'Choose matching members' : `Use ${count} ${count === 1 ? 'member' : 'members'}`;
    $('crew-import-save').disabled = !count || unresolved;
  }
  $('choose-crew').addEventListener('click', () => showTab('crew'));
  $('crew-done').addEventListener('click', () => showTab(isLibrary() ? 'history' : 'shift'));
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
      const use = !editing && !isLibrary() && $('member-use').checked;
      if (use) addToShift([member]);
      state.members = editing ? state.members.map(value => value.id === editing ? member : value) : [...state.members, member];
      const saved = persist(use); $('member-dialog').close(); renderRoster();
      toast(saved ? 'Member saved. Existing shift records keep their crew details.' : 'Member added — export a backup to keep it');
    } catch (error) { $('member-error').textContent = error.message; }
  });
  $('roster-list').addEventListener('change', event => {
    if (isLibrary()) return;
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
  $('close-crew-import').addEventListener('click', () => $('crew-import-dialog').close());
  $('crew-import-source').addEventListener('input', () => { importRows = []; $('crew-import-preview').hidden = true; });
  $('crew-import-format').addEventListener('change', () => { importRows = []; $('crew-import-preview').hidden = true; });
  $('crew-import-review').addEventListener('click', previewImport);
  $('crew-import-list').addEventListener('change', updateImportCount);
  $('crew-import-save').addEventListener('click', () => {
    try {
      const rows = [...$('crew-import-list').querySelectorAll('input:checked')].map(input => {
        const member = importRows[Number(input.dataset.importIndex)], choice = input.closest('.import-member').querySelector('select');
        if (choice && !choice.value) throw new Error(`Choose the saved member for ${member.name}, or uncheck that name.`);
        return choice ? { ...member, id: choice.value } : member;
      });
      if (!rows.length) return;
      const result = mergeMembers(getState().members, rows);
      const use = !isLibrary() && $('crew-import-use').checked;
      if (use) addToShift(result.imported);
      getState().members = result.members;
      const saved = persist(use); $('crew-import-dialog').close(); renderRoster();
      toast(saved ? `${result.imported.length} members imported${use ? ' and selected for this shift' : ' to the library'}` : 'Crew imported — export a backup to keep it');
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
  function reviewMappedMembers(members, use = false) {
    openImport(use); $('crew-import-source').value = crewCsv(members); $('crew-import-format').value = 'auto'; previewImport();
    $('crew-import-list').querySelector('input')?.focus();
  }
  return { renderRoster, renderShiftCrew, reviewMappedMembers };
}
