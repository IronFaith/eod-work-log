import { reportData } from './model.mjs?v=3.8';
import { linkParts } from './links.mjs?v=3.8';
import fonts from './vendor/fonts.mjs?v=2';

// Both the preview and PDF use reportData, so optional fields stay consistent.
export function buildReportPdf(day, libraries = {}, options = {}) {
  const Pdf = libraries.jsPDF || globalThis.jspdf?.jsPDF;
  if (!Pdf) throw new Error('PDF library is unavailable');
  const doc = new Pdf({ unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  const linkOffsets = new WeakMap();
  const table = options => {
    const body = options.body.map(row => row.map(value => {
      let content = '';
      const links = [];
      for (const part of linkParts(value)) {
        const text = part.text.replace(/\r\n?|\n/g, '\n').replace(/[^\S\n]+/g, ' ');
        if (part.url) links.push({ start: content.length, end: content.length + text.length, url: part.url });
        content += text;
      }
      return { content, links };
    }));
    const didDrawCell = ({ cell, section }) => {
      if (section !== 'body' || !cell.raw.links?.length) return;
      const raw = cell.raw, position = cell.getTextPos();
      const height = doc.getLineHeight() / doc.internal.scaleFactor;
      let offset = linkOffsets.get(raw) || 0;
      cell.text.forEach((line, index) => {
        const start = raw.content.indexOf(line, offset);
        if (start < 0) return;
        for (const link of raw.links) {
          const from = Math.max(start, link.start), to = Math.min(start + line.length, link.end);
          if (to <= from) continue;
          const x = position.x + doc.getTextWidth(line.slice(0, from - start));
          const y = position.y + index * height;
          const width = doc.getTextWidth(line.slice(from - start, to - start));
          doc.link(x, y, width, height, { url: link.url });
          doc.setDrawColor(22, 93, 145); doc.setLineWidth(0.15);
          doc.line(x, y + height * 0.85, x + width, y + height * 0.85);
        }
        offset = start + line.length;
        if (raw.content[offset] === '\n') offset++;
      });
      // AutoTable reuses raw cells when a long row continues on another page.
      linkOffsets.set(raw, offset);
    };
    const settings = { ...options, body, didDrawCell };
    return libraries.autoTable ? libraries.autoTable(doc, settings) : doc.autoTable(settings);
  };
  for (const style of ['regular', 'bold']) {
    doc.addFileToVFS(`NotoSans-${style}.ttf`, fonts[style]);
    doc.addFont(`NotoSans-${style}.ttf`, 'NotoSans', style === 'regular' ? 'normal' : 'bold');
  }
  const { heading, header, labels, taskGroups, blockers, carryover } = reportData(day, options);
  doc.setProperties({ title: heading, subject: 'Daily work report', creator: 'EOD Work Log' });
  doc.setFont('NotoSans', 'bold');
  doc.setTextColor(24, 58, 86);
  doc.setFontSize(19);
  doc.text(heading, 16, 22);
  const base = {
    margin: { top: 22, bottom: 20, left: 16, right: 16 },
    theme: 'grid', rowPageBreak: 'avoid',
    styles: { font: 'NotoSans', fontSize: 9, cellPadding: 3, overflow: 'linebreak', valign: 'top', textColor: [35, 61, 80], lineColor: [205, 217, 226], lineWidth: 0.2 },
    headStyles: { fillColor: [24, 58, 86], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 249, 251] }
  };
  table({ ...base, startY: 31, head: [['Shift details', 'Information']], body: header, columnStyles: { 0: { cellWidth: 35, fontStyle: 'bold' } } });
  let y = doc.lastAutoTable.finalY + 11;
  function section(title, options) {
    if (y > doc.internal.pageSize.getHeight() - 48) { doc.addPage(); y = 25; }
    doc.setFont('NotoSans', 'bold'); doc.setFontSize(12); doc.setTextColor(24, 58, 86);
    doc.text(title, 16, y);
    table({ ...base, startY: y + 4, ...options });
    y = doc.lastAutoTable.finalY + 11;
  }
  const hasLocation = labels.length === 4;
  for (const group of taskGroups) section(group.label, {
    head: [labels], body: group.rows,
    columnStyles: options.detailed ? (hasLocation ? { 0: { cellWidth: 39 }, 1: { cellWidth: 27 }, 3: { cellWidth: 25 } } : { 0: { cellWidth: 48 }, 2: { cellWidth: 25 } }) : (labels.length === 2 ? { 1: { cellWidth: 27 } } : {})
  });
  if (!taskGroups.length) section('Production updates', { body: [['No tasks recorded.']] });
  section('Blockers', { body: [[blockers]] });
  if (carryover) section('Carryover / next shift', { body: [[carryover]] });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFont('NotoSans', 'normal'); doc.setFontSize(8); doc.setTextColor(97, 115, 128);
    if (page > 1) doc.text(`${heading} (continued)`, 16, 13);
    doc.text(`EOD Work Log  |  ${day.date}`, 16, 286);
    doc.text(`Page ${page} of ${pages}`, 194, 286, { align: 'right' });
  }
  return doc;
}
