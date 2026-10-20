import { memberFrom, writeTable, readCrewTable, readTable } from './crew.mjs?v=5.5';
import { validDate, shiftEnd, STATUSES } from './model.mjs?v=5.5';
import { tableGrid, reportTablesFrom, readPastedTables } from './table-data.mjs?v=5.5';
import { detectPaste } from './planner.mjs?v=5.5';

export const IMPORT_FORMATS = {
  tasks: { auto: 'Automatic · table or work list', table: 'Table / spreadsheet cells', tickets: 'Ticket IDs', lines: 'One update per line', blocks: 'Separate by blank lines', single: 'One whole update' },
  crew: { auto: 'Automatic · table or name list', table: 'Table / spreadsheet cells', names: 'Names · one per line / semicolons', commas: 'Names · separated by commas' },
  shifts: { table: 'Table / spreadsheet cells' },
  report: { table: 'Table / spreadsheet cells' }
};

export function readImportSource(source, { kind = 'tasks', format = 'auto', html = '', doc = globalThis.document } = {}) {
  if (!IMPORT_FORMATS[kind] || !Object.hasOwn(IMPORT_FORMATS[kind], format)) throw new Error('Choose a supported paste format.');
  if (typeof source !== 'string' || source.length > 1e6) throw new Error('Import up to 1 MB at a time.');
  let table = format === 'table';
  if (format === 'auto') {
    table = /<table[\s>]/i.test(html) || source.includes('\t') || source.split(/\r?\n/).some(line => /^\s*\|?\s*:?-{3,}/.test(line) && line.includes('|'));
    if (!table) {
      try {
        const grid = readTable(source);
        table = grid.length > 1 && (kind !== 'crew' && grid[0].length > 1 && grid.every(row => row.length === grid[0].length)
          || suggestMapping(grid[0], kind).some(field => !['extra','ignore'].includes(field)));
      } catch { /* Plain notes may contain literal quotes. */ }
    }
  }
  if (table) return { type: 'table', tables: readPastedTables(source, html, doc) };
  if (kind === 'crew') return { type: 'crew', members: readCrewTable(source, { format: format === 'auto' ? 'names' : format }) };
  return { type: 'tasks', source, mode: format === 'auto' ? detectPaste(source)?.mode || 'lines' : format, headers: false };
}

export const IMPORT_FIELDS = {
  tasks: { title: 'Update / task title', ticket: 'Ticket ID', details: 'Details / notes', category: 'Category', area: 'Row / location', status: 'Status', extra: 'Keep in details', ignore: 'Do not import' },
  crew: { name: 'Full name', first: 'First name', last: 'Last name', email: 'Work email', team: 'Team / group', ignore: 'Do not import' },
  shifts: { date: 'Date', name: 'Shift name', start: 'Start time', end: 'End time', duration: 'Duration (hours)', location: 'Location', supervisor: 'Supervisor', lead: 'Acting lead', crew: 'Crew names', ignore: 'Do not import' },
  report: { keep: 'Keep column', ignore: 'Do not import' }
};
const aliases = {
  tasks: { title: ['title','task','work','update','work item','task name','subject','summary'], ticket: ['ticket','ticket id','ticket number','incident','incident id','work order','wo','id'], details: ['details','description','notes','progress','result','comments'], category: ['category','type','work type'], area: ['area','row','row / area','row / location','location','rack'], status: ['status','state'] },
  crew: { name: ['name','full name','employee','employee name','member','crew member','technician'], first: ['first name','first','given name'], last: ['last name','last','surname','family name'], email: ['email','work email','email address','upn'], team: ['team','group','department','shift','shift group','team / shift group'] },
  shifts: { date: ['date','shift date','work date'], name: ['shift','shift name','name'], start: ['start','start time','shift start','in'], end: ['end','end time','shift end','out'], duration: ['duration','hours','shift length','duration hours'], location: ['location','site','building'], supervisor: ['supervisor','manager'], lead: ['lead','acting lead','team lead'], crew: ['crew','crew names','members','employees'] }
};
export function tableColumns(grid, hasHeaders = true) {
  const rows = tableGrid(grid), width = rows[0].length;
  const headers = hasHeaders ? rows[0].map((value, i) => value || `Column ${i + 1}`) : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  const data = hasHeaders ? rows.slice(1) : rows;
  if (!data.length) throw new Error('Include at least one data row, or turn off “First row contains headings”.');
  if (data.length > 1000) throw new Error('Import up to 1,000 data rows at a time.');
  return { headers, rows: data };
}
export function suggestMapping(headers, kind) {
  const used = new Set();
  return headers.map(header => {
    if (kind === 'report') return 'keep';
    const name = header.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const field = Object.keys(aliases[kind] || {}).find(key => aliases[kind][key].includes(name) && (!used.has(key) || key === 'details'));
    if (field) used.add(field);
    return field || (kind === 'tasks' ? 'extra' : 'ignore');
  });
}
function statusFrom(value) {
  const normalized = value.toLowerCase().trim();
  if (!normalized) return '';
  if (['done','complete','completed','closed','resolved'].includes(normalized)) return 'Completed';
  if (['blocked','on hold','waiting','pending'].includes(normalized)) return 'Blocked';
  if (['in progress','in-progress','open','active','assigned','started'].includes(normalized)) return 'In progress';
  throw new Error(`Unknown status “${value}”. Use ${STATUSES.join(', ')}, or map this column to Details.`);
}
function timeFrom(value) {
  if (!value) return '';
  if (/^0?\.\d+$/.test(value)) { const minutes = Math.round(Number(value) * 1440) % 1440; return `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`; }
  const match = /^(\d{1,2})(?::(\d{2}))?(?::00)?\s*(am|pm)?$/i.exec(value.trim());
  if (!match) throw new Error(`Use a time such as 06:00 or 6:00 PM, instead of “${value}”.`);
  let hour = Number(match[1]), minute = Number(match[2] || 0);
  if (minute > 59 || (match[3] ? hour < 1 || hour > 12 : hour > 23)) throw new Error(`Invalid time “${value}”.`);
  if (match[3]) hour = hour % 12 + (match[3].toLowerCase() === 'pm' ? 12 : 0);
  return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}
function dateFrom(value, order) {
  if (validDate(value)) return value;
  const match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(value);
  if (match) {
    const date = `${match[3]}-${(order === 'dmy' ? match[2] : match[1]).padStart(2,'0')}-${(order === 'dmy' ? match[1] : match[2]).padStart(2,'0')}`;
    if (validDate(date)) return date;
  }
  throw new Error(`Use YYYY-MM-DD or ${order === 'dmy' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'} for the date “${value}”.`);
}
export function mapTable({ headers, rows }, mapping, kind, { dateOrder = 'mdy', title = 'Additional table', selectedDate = '' } = {}) {
  if (!IMPORT_FIELDS[kind] || mapping.length !== headers.length || mapping.some(field => !Object.hasOwn(IMPORT_FIELDS[kind], field))) throw new Error('Choose how each column should be used.');
  for (const field of new Set(mapping)) if (!['ignore','extra','keep','details','crew'].includes(field) && mapping.filter(value => value === field).length > 1) throw new Error(`Use only one column for ${IMPORT_FIELDS[kind][field]}.`);
  if (kind === 'report') {
    const indices = mapping.flatMap((field, i) => field === 'keep' ? [i] : []);
    return reportTablesFrom([{ id: crypto.randomUUID(), title, headers: indices.map(i => headers[i]), rows: rows.map(row => indices.map(i => row[i] || '')), include: true }])[0];
  }
  return rows.map((row, index) => {
    const get = field => mapping.flatMap((key, i) => key === field && row[i] ? [row[i]] : []).join('\n').trim();
    try {
      if (kind === 'crew') return memberFrom({ name: get('name') || [get('first'),get('last')].filter(Boolean).join(' '), email: get('email'), team: get('team') });
      if (kind === 'tasks') {
        const heading = [...new Set([get('ticket'),get('title')].filter(Boolean))].join(' — ');
        if (!heading || heading.length > 200) throw new Error('Map a task title or ticket ID, up to 200 characters.');
        const extra = mapping.flatMap((key, i) => key === 'extra' && row[i] ? [`${headers[i]}: ${row[i]}`] : []);
        const details = [get('details'), ...extra].filter(Boolean).join('\n');
        if (details.length > 12000) throw new Error('Use up to 12,000 characters in Details.');
        if (get('category').length > 80 || get('area').length > 200) throw new Error('Use up to 80 characters for Category and 200 for Location.');
        return { title: heading, summary: details, category: get('category'), area: get('area'), status: statusFrom(get('status')) };
      }
      const date = get('date') ? dateFrom(get('date'), dateOrder) : selectedDate;
      if (!validDate(date)) throw new Error('Map the Date column.');
      const header = {};
      for (const key of ['start','end','location','supervisor','lead','crew']) if (mapping.includes(key) && get(key)) header[key] = ['start','end'].includes(key) ? timeFrom(get(key)) : get(key);
      const rawDuration = get('duration').replace(/\s*(?:h|hr|hrs|hours?)$/i, '');
      const duration = rawDuration ? String(Number(rawDuration)) : '';
      if (duration) {
        const calculated = shiftEnd(header.start, duration).end;
        if (header.end && header.end !== calculated) throw new Error('End time and duration disagree. Correct a cell or ignore one column.');
        header.end = calculated;
      }
      if (get('name').length > 80) throw new Error('Use a shift name of up to 80 characters.');
      if (!Object.keys(header).length && !get('name')) throw new Error('Map at least one shift detail.');
      return { date, name: get('name'), header, duration };
    } catch (error) { throw new Error(`Data row ${index + 1}: ${error.message}`); }
  });
}
export const mappedTaskCsv = rows => writeTable([['Title','Description','Category','Area','Status'], ...rows.map(row => [row.title,row.summary,row.category,row.area,row.status])]);
