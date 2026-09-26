import test from 'node:test';
import assert from 'node:assert/strict';
import { memberFrom, mergeMembers, readCrewTable, crewCsv, readTable, writeTable } from '../crew.mjs';
import * as m from '../model.mjs';

test('crew CSV and Excel tables round-trip names, quotes and accents; malformed input is rejected', () => {
  const members = readCrewTable('\uFEFFName,Email,Team\r\n"Rivera, José",jose@example.com,"Night, A"\r\n"Ana ""AJ"" Test",,Day');
  assert.equal(members[0].name, 'Rivera, José');
  assert.equal(members[1].name, 'Ana "AJ" Test');
  assert.deepEqual(readCrewTable(crewCsv(members)).map(({ id, ...rest }) => rest), members.map(({ id, ...rest }) => rest));
  assert.equal(readCrewTable('Name\tWork email\tShift\nTest One\tone@example.com\tNights')[0].team, 'Nights');
  assert.equal(readCrewTable('Name;Email;Team\nTest Two;;Days')[0].name, 'Test Two');
  assert.throws(() => readCrewTable('Name,Email\n"Missing quote,test@example.com'), /quote/);
  assert.throws(() => readCrewTable('Name,Email\nTest,bad-email'), /email/);
  assert.throws(() => readCrewTable('Name\nOne,Two'), /extra cells/);
  assert.match(writeTable([['=1+1', '+SUM(A1)', '@cmd']]), /"'=1\+1"/);
  assert.deepEqual(readTable(writeTable([['=1+1', '+SUM(A1)', '@cmd']])), [['=1+1', '+SUM(A1)', '@cmd']]);
});

test('library imports deduplicate; shift snapshots, presets and backups preserve historical crews', () => {
  const state = m.newState(), original = memberFrom({ name: 'Example Tech', email: 'tech@example.com', team: 'Nights' });
  state.members = [original]; state.defaultCrewMembers = [{ ...original }];
  const day = m.ensureDay(state, '2026-10-02'); day.header.start = '18:00'; day.header.end = '06:00';
  state.members = mergeMembers(state.members, [memberFrom({ name: 'Updated Tech', email: 'TECH@example.com' })]).members;
  assert.equal(state.members.length, 1); assert.equal(state.members[0].team, 'Nights');
  assert.equal(day.crewMembers[0].name, 'Example Tech');
  state.shiftPresets = [m.shiftPreset({ name: 'Night crew', header: day.header, duration: '12', crewMembers: day.crewMembers })];
  state.members = [];
  const restored = m.parseBackup(m.exportBackup(state));
  assert.equal(restored.days[day.date].crewMembers[0].name, 'Example Tech');
  assert.equal(restored.shiftPresets[0].crewMembers[0].email, 'tech@example.com');
  assert.ok(!m.reportWarnings(restored.days[day.date]).includes('Add your crew.'));
  assert.match(m.renderReport(day).html, /teams.microsoft.com/);
  assert.doesNotMatch(m.renderReport(day).html, /Acting lead/);
  const older = { ...state, schema: 8 }; delete older.members; delete older.defaultCrewMembers; delete older.days[day.date].crewMembers;
  assert.deepEqual(m.parseBackup(JSON.stringify(older)).days[day.date].crewMembers, []);
});

test('work CSV preserves multiline progress and custom categories in the normal matching review', () => {
  const task = m.validateTask({ ...m.nextTask({ entryType: 'quick' }), title: 'TK420', summary: 'Checked, stable\n**Both ends** verified', category: 'Rack audits', area: 'Row 2' });
  const csv = m.workCsv([task]), review = m.createPasteReview([], csv, { mode: 'csv', headers: true });
  const imported = m.applyPasteReview([], review.rows)[0];
  for (const key of ['title', 'summary', 'category', 'area']) assert.equal(imported[key], task[key]);
  const match = m.createPasteReview([task], csv.replace('stable', 'restored'), { mode: 'csv', headers: true });
  assert.equal(match.rows[0].action, '');
  const state = m.newState(), day = m.ensureDay(state, '2026-10-02');
  day.quickMode = 'csv'; day.quickDraft = csv; day.pasteReview = review;
  assert.equal(m.parseBackup(m.exportBackup(state)).days[day.date].pasteReview.rows[0].category, 'Rack audits');
  assert.throws(() => m.createPasteReview([], 'Description\nMissing title', { mode: 'csv' }), /Title column/);
});
