import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { markupTokens, displayText, richText, readableText } from '../links.mjs';
import { newState, ensureDay, nextTask, exportBackup, parseBackup, renderReport, ticketMatches } from '../model.mjs';
import { buildReportPdf } from '../pdf.mjs';

test('completed inline markup formats without losing source; broken markup remains visible', () => {
  const source = '** Hello ** and [Google](https://google.com) or url(https://google.com)';
  assert.equal(displayText(source), 'Hello and Google or google');
  assert.equal(markupTokens(source).map(token => token.raw).join(''), source);
  assert.match(richText(source), /<strong>Hello<\/strong>/);
  assert.match(richText(source), /href="https:\/\/google.com\/"[^>]*>google<\/a>/);
  assert.equal(displayText('**See [ticket](https://example.com/a_(b))**'), 'See ticket');
  for (const broken of ['** Hello *', '****', '**   **', '[Google](https://google.com', 'url(https://google.com', 'url(javascript:alert(1))', '[Bad](javascript:alert(1))']) {
    assert.equal(displayText(broken), broken);
    assert.doesNotMatch(richText(broken), /<strong>|<a /);
  }
  assert.match(richText('**<img src=x>**'), /<strong>&lt;img src=x&gt;<\/strong>/);
  assert.equal(readableText('**Done** url(https://google.com)'), 'Done google (https://google.com/)');
  const state = newState(), day = ensureDay(state, '2026-09-25');
  day.tasks = [{ ...nextTask(), entryType: 'quick', title: '**INC-390**', summary: source, status: '' }];
  assert.deepEqual(parseBackup(exportBackup(state)).days[day.date].tasks, day.tasks);
  assert.equal(ticketMatches(day.tasks, { title: 'INC390' }).length, 1);
  assert.match(renderReport(day).html, /<strong>Hello<\/strong>/);
});

test('PDF draws mixed bold text and link labels without showing completed markup', () => {
  const day = ensureDay(newState(), '2026-09-25'), draws = [], links = [];
  day.tasks = [{ ...nextTask(), entryType: 'quick', title: 'Formatting example', summary: 'Plain **Hello** after url(https://google.com)\n**[Ticket](https://example.com/ticket)**\nBroken **unfinished', status: '' }];
  day.tasks.push({ ...nextTask(), entryType: 'quick', title: 'Long entry', summary: `${'Normal text that wraps onto another line. '.repeat(220)}**End of long entry**`, status: '' });
  function Pdf(...args) {
    const doc = new jsPDF(...args), text = doc.text.bind(doc), link = doc.link.bind(doc);
    doc.text = (value, ...rest) => { draws.push({ text: String(value), style: doc.getFont().fontStyle }); return text(value, ...rest); };
    doc.link = (...args) => { links.push(args.at(-1).url); return link(...args); };
    return doc;
  }
  const doc = buildReportPdf(day, { jsPDF: Pdf, autoTable });
  assert.ok(doc.getNumberOfPages() > 1);
  assert.ok(draws.some(draw => draw.text === 'Hello' && draw.style === 'bold'));
  assert.ok(draws.some(draw => draw.text === ' after ' && draw.style === 'normal'));
  assert.ok(draws.some(draw => draw.text === 'Ticket' && draw.style === 'bold'));
  assert.ok(draws.some(draw => draw.text.includes('Broken **unfinished')));
  assert.ok(!draws.some(draw => /\*\*Hello\*\*|url\(https:/.test(draw.text)));
  assert.deepEqual(links, ['https://google.com/', 'https://example.com/ticket']);
  assert.equal(draws.filter(draw => draw.text === 'End of long entry' && draw.style === 'bold').length, 1);
});
