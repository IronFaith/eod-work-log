import { readTable } from './crew.mjs?v=5.4';

export function tableGrid(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 1001) throw new Error('Use a table with up to 1,000 data rows.');
  const width = Math.max(...rows.map(row => Array.isArray(row) ? row.length : 0));
  if (!width || width > 20) throw new Error('Copy up to 20 columns at a time.');
  let size = 0;
  const result = rows.map(row => {
    if (!Array.isArray(row)) throw new Error('Invalid table row.');
    return Array.from({ length: width }, (_, index) => {
      const value = row[index] ?? '';
      if (typeof value !== 'string' || value.length > 12000) throw new Error('Each table cell can contain up to 12,000 characters.');
      size += value.length;
      return value.trim();
    });
  }).filter(row => row.some(Boolean));
  if (size > 1e6) throw new Error('Use a table smaller than 1 MB.');
  if (!result.length) throw new Error('Paste at least one filled row.');
  return result;
}

export function readPastedTables(text, html = '', doc = globalThis.document) {
  if (typeof text !== 'string' || text.length > 1e6 || typeof html !== 'string' || html.length > 2e6) throw new Error('Copy a smaller table (up to 1 MB of text).');
  if (html && doc) {
    // A detached template keeps pasted scripts, links and images inert.
    const template = doc.createElement('template'); template.innerHTML = html;
    const tables = [...template.content.querySelectorAll('table')].filter(table => !table.parentElement?.closest('table'));
    if (tables.length > 20) throw new Error('Copy up to 20 separate tables at a time.');
    if (tables.length) return tables.map((table, index) => {
      if (table.querySelector('table')) throw new Error('This table contains another table. Copy the inner table separately.');
      const rows = [], elements = [...table.rows];
      if (elements.length > 1001) throw new Error('Copy up to 1,000 data rows at a time.');
      elements.forEach((tr, r) => {
        rows[r] ||= []; let c = 0;
        for (const cell of tr.cells) {
          while (rows[r][c] !== undefined) c++;
          const rs = Math.max(1, cell.rowSpan || elements.length - r), cs = Math.max(1, cell.colSpan);
          if (r + rs > 1001 || c + cs > 20) throw new Error('This merged table exceeds 1,000 rows or 20 columns. Copy a smaller range.');
          const clone = cell.cloneNode(true);
          clone.querySelectorAll('script,style,iframe,object').forEach(node => node.remove());
          clone.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
          clone.querySelectorAll('p,div').forEach(node => node.append('\n'));
          const value = clone.textContent.trim();
          for (let y = 0; y < rs; y++) for (let x = 0; x < cs; x++) {
            rows[r + y] ||= [];
            if (rows[r + y][c + x] !== undefined) throw new Error('Overlapping merged cells. Unmerge the copied range and try again.');
            rows[r + y][c + x] = x === 0 ? value : '';
          }
          c += cs;
        }
      });
      return { name: table.caption?.textContent.trim().slice(0, 80) || `Table ${index + 1}`, rows: tableGrid(rows) };
    });
  }
  const lines = text.trim().split(/\r?\n/);
  const pipe = lines.length > 1 && lines.some(line => /^\s*\|?\s*:?-{3,}/.test(line) && line.includes('|'));
  const rows = pipe ? lines.filter(line => !/^\s*\|?[\s:|\-]+\|?\s*$/.test(line)).map(line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(cell => cell.replace(/\\\|/g, '|').trim())) : readTable(text);
  return [{ name: 'Pasted table', rows: tableGrid(rows) }];
}

export function reportTablesFrom(value = []) {
  if (!Array.isArray(value) || value.length > 10) throw new Error('Use up to 10 additional tables per report.');
  const result = value.map(table => {
    if (!table || typeof table !== 'object' || typeof table.title !== 'string' || !table.title.trim() || table.title.length > 80 || typeof table.id !== 'string' || !table.id || table.id.length > 100 || !Array.isArray(table.headers) || !table.headers.length || table.headers.length > 20 || !Array.isArray(table.rows) || !table.rows.length || table.rows.length > 1000 || table.include != null && typeof table.include !== 'boolean') throw new Error('Invalid additional report table.');
    if (table.headers.some(header => typeof header !== 'string' || !header.trim() || header.length > 120) || table.rows.some(row => !Array.isArray(row) || row.length !== table.headers.length)) throw new Error('Every report row must match its column headings (up to 120 characters each).');
    return { id: table.id, title: table.title.trim(), headers: table.headers.map(header => header.trim()), rows: tableGrid(table.rows), include: table.include !== false };
  });
  if (new Set(result.map(table => table.id)).size !== result.length) throw new Error('Each report table needs its own ID.');
  return result;
}
