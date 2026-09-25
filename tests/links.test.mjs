import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { safeWebURL, linkParts, readableText, makeLink, teamsDestination } from '../links.mjs';
import { newState, ensureDay, nextTask, validateTask, renderReport, renderProductionTables, parseBackup, exportBackup, mergeBackup, ticketMatches, suggestCategory } from '../model.mjs';
import { buildReportPdf } from '../pdf.mjs';

test('links render safely with readable fallbacks and preserve ticket matching', () => {
  const state = newState(), day = ensureDay(state, '2026-09-25');
  const task = validateTask({ ...nextTask(), entryType: 'quick', title: '[INC-204](https://example.com/WO-999)', summary: 'Complete. See https://example.com/check_(A)?x=1&y=2.\n[Bad](javascript:alert(1)) <img src=x onerror=alert(1)>', status: '' });
  day.tasks = [task]; day.header.crew = makeLink('Alex', 'alex@example.com', true);
  const { html, text } = renderReport(day);
  assert.match(html, /href="https:\/\/example.com\/WO-999"[^>]*>INC-204<\/a>/);
  assert.match(html, /check_\(A\)\?x=1&amp;y=2"/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /href="javascript:|<img/);
  assert.match(text, /INC-204 \(https:\/\/example.com\/WO-999\)/);
  assert.match(text, /Alex \(https:\/\/teams.microsoft.com\/l\/chat\/0\/0\?users=alex%40example.com\)/);
  assert.ok(html.includes(renderProductionTables(day.tasks)));
  assert.equal(ticketMatches(day.tasks, { title: 'INC204 resolved' })[0].id, task.id);
  assert.equal(suggestCategory('[Pull fiber](https://example.com/testing)'), 'Pulling / installation');
  assert.equal(linkParts('[Guide](https://example.com/a_(b))')[0].url, 'https://example.com/a_(b)');
  assert.equal(linkParts('https://example.com/a).')[0].text, 'https://example.com/a');
  assert.equal(readableText('See https://example.com.'), 'See https://example.com.');
  for (const bad of ['javascript:alert(1)', 'data:text/html,test', 'file:///C:/test', 'https://user:password@example.com/', 'https://example.com/\n']) assert.equal(safeWebURL(bad), '');
  assert.deepEqual(parseBackup(exportBackup(state)).days[day.date].tasks, day.tasks);
});

test('Teams shortcut validates email or exact Teams hosts and survives backup migration and merge', () => {
  const current = newState(), incoming = newState();
  incoming.teamsTarget = 'alex+crew@example.com';
  assert.equal(teamsDestination(incoming.teamsTarget), 'https://teams.microsoft.com/l/chat/0/0?users=alex%2Bcrew%40example.com');
  assert.equal(teamsDestination('https://teams.microsoft.com/l/message/19%3Atest/123?context=a'), 'https://teams.microsoft.com/l/message/19%3Atest/123?context=a');
  for (const bad of ['49c4641c-ab91-4248-aebb-6a7de286397b', 'https://teams.microsoft.com.evil.example/', 'https://teams.microsoft.com@evil.example/', 'http://teams.microsoft.com/', 'alex@example.com,bob@example.com', 'javascript:alert(1)']) assert.throws(() => teamsDestination(bad));
  assert.equal(parseBackup(exportBackup(incoming)).teamsTarget, incoming.teamsTarget);
  assert.equal(mergeBackup(current, incoming).teamsTarget, incoming.teamsTarget);
  current.teamsTarget = 'supervisor@example.com';
  assert.equal(mergeBackup(current, incoming).teamsTarget, current.teamsTarget);
  const old = { ...newState(), schema: 6 }; delete old.teamsTarget;
  assert.equal(parseBackup(exportBackup(old)).teamsTarget, '');
  assert.throws(() => parseBackup(exportBackup({ ...incoming, teamsTarget: 'javascript:alert(1)' })));
});

test('PDF links remain distinct across wrapped labels and page-split rows', () => {
  const day = ensureDay(newState(), '2026-09-25'), annotations = [];
  day.header.crew = makeLink('Alex', 'alex@example.com', true);
  day.tasks = [validateTask({ ...nextTask(), entryType: 'ticket', title: '[INC-204](https://example.com/204)', description: `${'Inspect patching and record results. '.repeat(200)}[Long final reference across several wrapped lines to the original ticket](https://example.com/final)`, notes: '[Second reference](https://example.com/second)' })];
  function Pdf(...args) {
    const doc = new jsPDF(...args), original = doc.link.bind(doc);
    doc.link = (x, y, width, height, options) => {
      annotations.push({ x, y, width, height, url: options.url, page: doc.getCurrentPageInfo().pageNumber });
      return original(x, y, width, height, options);
    };
    return doc;
  }
  const doc = buildReportPdf(day, { jsPDF: Pdf, autoTable }, { detailed: true });
  assert.ok(doc.getNumberOfPages() > 1);
  assert.deepEqual(new Set(annotations.map(a => a.url)), new Set(['https://teams.microsoft.com/l/chat/0/0?users=alex%40example.com', 'https://example.com/204', 'https://example.com/final', 'https://example.com/second']));
  const finalLinks = annotations.filter(a => a.url.endsWith('/final'));
  assert.ok(finalLinks.length > 1);
  assert.ok(finalLinks.every(a => a.page > 1));
  assert.ok(annotations.every(a => a.x >= 16 && a.y >= 20 && a.y + a.height < 278 && a.width > 0 && a.x + a.width <= 195));
  assert.match(doc.output(), /\/Subtype \/Link/);
});
