import { makeLink, displayText } from './links.mjs?v=5.5';

function field(value, label, limit) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > limit || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`${label} must be one line, up to ${limit} characters.`);
  return value.trim();
}
export function memberFrom(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid crew member.');
  const name = field(value.name, 'Name', 160), email = field(value.email, 'Work email', 254), team = field(value.team, 'Team / shift group', 80);
  if (!name) throw new Error('Each crew member needs a name.');
  if (email && !/^[^\s<>@,;/?&=]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) throw new Error(`Enter a valid work email for ${name}, or leave it blank.`);
  return { id: field(value.id, 'Member ID', 100) || crypto.randomUUID(), name, email, team };
}
export function membersFrom(value, limit = 2000) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > limit) throw new Error(`Use up to ${limit} crew members.`);
  const members = value.map(memberFrom);
  if (new Set(members.map(member => member.id)).size !== members.length) throw new Error('Duplicate crew member IDs.');
  return members;
}
export function sameMember(a, b) {
  return a.id === b.id || (a.email && b.email ? a.email.toLowerCase() === b.email.toLowerCase() : a.name.toLowerCase() === b.name.toLowerCase());
}
export function mergeMembers(current, incoming) {
  const members = membersFrom(current), imported = [];
  for (const value of membersFrom(incoming)) {
    let index = members.findIndex(member => member.id === value.id);
    if (index < 0) {
      const matches = members.filter(member => sameMember(member, value));
      if (matches.length > 1) throw new Error(`More than one saved member matches ${value.name}. Choose the person in the review, or include their work email.`);
      index = matches.length ? members.indexOf(matches[0]) : -1;
    }
    const member = index < 0 ? value : { ...value, id: members[index].id, email: value.email || members[index].email, team: value.team || members[index].team };
    if (index < 0) members.push(member); else members[index] = member;
    if (!imported.some(item => sameMember(item, member))) imported.push(member);
  }
  if (members.length > 2000) throw new Error('Use up to 2,000 members in the crew library.');
  return { members, imported };
}
export function crewText(day) {
  const legacy = day.header.crew.trim();
  const lines = (day.crewMembers || []).map(member => {
    // Brackets in a name stay readable; they cannot delimit a formatted link.
    return member.email && !/[\[\]]/.test(member.name) ? makeLink(member.name, member.email, true) : member.name;
  });
  const existing = new Set(legacy.split('\n').map(line => displayText(line).trim().toLowerCase()));
  return [...lines.filter(line => !existing.has(displayText(line).toLowerCase())), legacy].filter(Boolean).join('\n');
}

export function readTable(source) {
  if (typeof source !== 'string' || source.length > 1e6) throw new Error('Choose a CSV or pasted table smaller than 1 MB.');
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n');
  const counts = { ',': 0, '\t': 0, ';': 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') { if (quoted && text[i + 1] === '"') i++; else quoted = !quoted; }
    else if (!quoted) { if (text[i] === '\n') break; if (Object.hasOwn(counts, text[i])) counts[text[i]]++; }
  }
  const delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const rows = []; let row = [], cell = '', inQuotes = false, afterQuote = false;
  const pushCell = () => { row.push(cell.replace(/^'(?=[=+@-])/, '').trim()); cell = ''; afterQuote = false; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { inQuotes = false; afterQuote = true; }
      else cell += char;
    } else if (char === delimiter || char === '\n') {
      pushCell();
      if (char === '\n') { rows.push(row); row = []; }
    } else if (char === '"' && !cell && !afterQuote) inQuotes = true;
    else if (afterQuote && /\s/.test(char)) continue;
    else if (afterQuote || char === '"') throw new Error('A CSV cell has an invalid quote. Export as CSV UTF-8 from Excel and try again.');
    else cell += char;
  }
  if (inQuotes) throw new Error('A CSV cell has an unclosed quote. Include the complete table.');
  pushCell(); rows.push(row);
  return rows.filter(values => values.some(Boolean));
}
export function writeTable(rows) {
  // Quote every cell and neutralize spreadsheet formulas, including imported names.
  const cell = value => { let text = String(value ?? ''); if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text; return `"${text.replace(/"/g, '""')}"`; };
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
export function readCrewTable(source, { format = 'auto' } = {}) {
  if (typeof source !== 'string' || source.length > 1e6) throw new Error('Use a name list or table smaller than 1 MB.');
  if (!['auto', 'names', 'commas', 'table'].includes(format)) throw new Error('Choose a crew paste format.');
  const firstLine = source.replace(/^\uFEFF/, '').trim().split(/\r?\n/)[0];
  let headings = [];
  try { headings = (readTable(firstLine)[0] || []).map(name => name.toLowerCase().replace(/[ _-]+/g, ' ').trim()); } catch { /* Quotes can be literal in a plain name list. */ }
  const table = format === 'table' || format === 'auto' && headings.some(name => ['name', 'member', 'crew member', 'full name', 'email', 'work email', 'email address', 'upn', 'team', 'group', 'shift', 'shift group', 'team / shift group'].includes(name));
  if (!table) {
    if (/[\t@]/.test(displayText(source))) throw new Error('For names with email or other columns, include a Name column and use CSV / Excel table.');
    const names = displayText(source).replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n')
      .split(format === 'commas' ? /[\n,;]+/ : /[\n;]+/)
      .map(name => name.trim().replace(/^(?:crew(?: members)?|members)\s*:\s*/i, '').replace(/^(?:[•●▪*–—-]|\d+[.)])\s+/, '').trim()).filter(Boolean);
    if (!names.length) throw new Error('Paste at least one crew name.');
    const unique = [...new Map(names.map(name => [name.toLowerCase(), name])).values()];
    return membersFrom(unique.map(name => ({ name })));
  }
  const rows = readTable(source), headers = (rows.shift() || []).map(name => name.toLowerCase().replace(/[ _-]+/g, ' ').trim());
  const find = names => headers.findIndex(name => names.includes(name));
  const name = find(['name', 'member', 'crew member', 'full name']), email = find(['email', 'work email', 'email address', 'upn']), team = find(['team', 'group', 'shift', 'shift group', 'team / shift group']);
  if (name < 0) throw new Error('Include a Name column. Email and Team columns are optional. Use the CSV template for an example.');
  if (!rows.length) throw new Error('Add at least one member below the column headings.');
  return membersFrom(rows.map((row, index) => {
    if (row.length > headers.length) throw new Error(`Row ${index + 2} has extra cells. Check commas or use quotes around names that contain a comma.`);
    try { return memberFrom({ name: row[name], email: email < 0 ? '' : row[email], team: team < 0 ? '' : row[team] }); }
    catch (error) { throw new Error(`Row ${index + 2}: ${error.message}`); }
  }));
}
export function crewCsv(members) { return writeTable([['Name', 'Email', 'Team'], ...members.map(member => [member.name, member.email, member.team])]); }
