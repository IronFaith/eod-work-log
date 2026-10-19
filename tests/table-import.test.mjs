import test from 'node:test';
import assert from 'node:assert/strict';
import { readPastedTables } from '../table-data.mjs';
import { tableColumns, suggestMapping, mapTable, mappedTaskCsv } from '../table-import.mjs';
import { newState, ensureDay, createPasteReview, applyPasteReview, parseBackup, exportBackup } from '../model.mjs';

test('table mapping preserves quoted notes, extra columns and task status through the normal review', () => {
  const source = 'Ref,Job,Notes,State,Owner\nTK420,Check link,"Checked, stable\nBoth ends",done,Alex\nTK421,Replace cable,Waiting,blocked,Sam';
  const columns = tableColumns(readPastedTables(source)[0].rows);
  const mapping = suggestMapping(columns.headers,'tasks'); mapping[0] = 'ticket'; mapping[1] = 'title';
  const mapped = mapTable(columns,mapping,'tasks');
  assert.equal(mapped[0].title,'TK420 — Check link');
  assert.equal(mapped[0].summary,'Checked, stable\nBoth ends\nOwner: Alex');
  assert.equal(mapped[1].status,'Blocked');
  const state = newState(), day = ensureDay(state,'2026-10-19');
  day.pasteReview = createPasteReview([],mappedTaskCsv(mapped),{mode:'csv',headers:true});
  const restored = parseBackup(exportBackup(state));
  day.tasks = applyPasteReview([],restored.days[day.id].pasteReview.rows);
  assert.equal(day.tasks[0].status,'Completed'); assert.equal(day.tasks[0].summary,mapped[0].summary);
  assert.deepEqual(readPastedTables('| Item | Qty |\n| --- | --- |\n| Cable \\| blue | =2+2 |')[0].rows,[['Item','Qty'],['Cable | blue','=2+2']]);
  assert.throws(() => mapTable(columns,['title','title','details','status','extra'],'tasks'),/only one column/);
});

test('crew and shift mappings handle separate names, overnight times and explicit date order', () => {
  const people = tableColumns(readPastedTables('First_Name\tLast_Name\tEmail\tDepartment\nAlex\tRivera\talex@example.com\tNights')[0].rows);
  const member = mapTable(people,suggestMapping(people.headers,'crew'),'crew')[0];
  assert.equal(member.name,'Alex Rivera'); assert.equal(member.team,'Nights');
  const shifts = tableColumns(readPastedTables('Date\tShift\tStart\tHours\tCrew\n01/11/2026\tNight\t6:30 PM\t12.0\tAlex; Sam')[0].rows);
  const mapping = suggestMapping(shifts.headers,'shifts');
  const result = mapTable(shifts,mapping,'shifts',{dateOrder:'dmy'})[0];
  assert.equal(result.date,'2026-11-01'); assert.equal(result.header.start,'18:30'); assert.equal(result.header.end,'06:30'); assert.equal(result.duration,'12');
  assert.equal(mapTable(shifts,mapping,'shifts',{dateOrder:'mdy'})[0].date,'2026-01-11');
  shifts.rows[0][0] = '31/11/2026'; assert.throws(() => mapTable(shifts,mapping,'shifts',{dateOrder:'dmy'}),/date/);
  people.rows[0][2] = 'bad email'; assert.throws(() => mapTable(people,suggestMapping(people.headers,'crew'),'crew'),/email/);
});
