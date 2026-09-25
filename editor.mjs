import { markupTokens, richText } from './links.mjs?v=3.9';

const editors = new WeakMap();
const selector = '[data-linkable], #blockers, #carryover';
export function sourceField(target) {
  return target.closest?.('.format-control')?.querySelector('input,textarea') || target;
}

// Keep the original form control as the storage and validation boundary.
// Completed formatting is an inline token; clicking it opens its exact source.
function enhance(field) {
  const control = document.createElement('div'); control.className = 'format-control';
  const editor = document.createElement('div'); editor.className = 'format-editor';
  editor.contentEditable = 'true'; editor.setAttribute('role', 'textbox');
  const labelNode = field.labels?.[0]?.cloneNode(true);
  labelNode?.querySelectorAll('input,textarea,select,.format-control').forEach(node => node.remove());
  const label = field.getAttribute('aria-label') || labelNode?.textContent.replace(/\s+/g, ' ').trim() || 'Update';
  editor.setAttribute('aria-label', label); field.setAttribute('aria-label', label);
  if (field.getAttribute('aria-describedby')) editor.setAttribute('aria-describedby', field.getAttribute('aria-describedby'));
  editor.setAttribute('aria-multiline', String(field.tagName === 'TEXTAREA'));
  editor.dataset.placeholder = field.placeholder || '';
  editor.classList.toggle('single-line', field.tagName !== 'TEXTAREA');
  if (field.tagName === 'TEXTAREA') editor.style.minHeight = `${Math.min(field.rows * 26 + 24, 230)}px`;
  const tools = document.createElement('div'); tools.className = 'format-tools';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'text-button';
  toggle.textContent = 'Show markup'; toggle.setAttribute('aria-pressed', 'false');
  const help = document.createElement('span'); help.textContent = '**bold** · [text](link) · url(link)';
  help.className = 'small muted'; tools.append(help, toggle);
  const error = document.createElement('p'); error.className = 'small danger-text'; error.setAttribute('role', 'alert'); error.hidden = true;
  field.before(control); control.append(field, editor, tools, error); field.hidden = true;
  const nativeFocus = field.focus.bind(field);
  const record = { field, editor, value: field.value, markup: false, composing: false, history: [], index: -1, selection: { start: field.value.length, end: field.value.length } };
  editors.set(field, record);
  field.focus = options => record.markup ? nativeFocus(options) : editor.focus(options);

  function snapshot() {
    const positions = new Map(), selection = window.getSelection();
    let value = '';
    function walk(node) {
      const start = value.length;
      if (node.nodeType === Node.TEXT_NODE) { value += node.data; positions.set(node, { start, text: true }); return; }
      if (node.dataset?.formatSource != null) { value += node.dataset.formatSource; positions.set(node, { start, end: value.length, atom: true }); return; }
      if (node.nodeName === 'BR') { value += '\n'; positions.set(node, { start, ends: [start, value.length] }); return; }
      const ends = [start];
      [...node.childNodes].forEach((child, index) => {
        if (index && ['DIV', 'P'].includes(child.nodeName) && value && !value.endsWith('\n')) value += '\n';
        walk(child); ends.push(value.length);
      });
      positions.set(node, { start, ends });
    }
    walk(editor);
    function offset(node, at) {
      const position = positions.get(node);
      if (position?.text) return position.start + at;
      if (position?.atom) return at ? position.end : position.start;
      if (position) return position.ends[Math.min(at, position.ends.length - 1)];
      const token = node?.parentElement?.closest('[data-format-source]');
      return token && positions.has(token) ? positions.get(token).end : value.length;
    }
    const anchor = offset(selection?.anchorNode, selection?.anchorOffset || 0), focus = offset(selection?.focusNode, selection?.focusOffset || 0);
    return { value, start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
  }
  function select(start, end = start) {
    function point(index) {
      let cursor = 0;
      for (const node of editor.childNodes) {
        const length = node.nodeType === Node.TEXT_NODE ? node.data.length : node.dataset.formatSource.length;
        if (node.nodeType === Node.TEXT_NODE && index <= cursor + length) return [node, Math.max(0, index - cursor)];
        if (index < cursor + length) return [editor, [...editor.childNodes].indexOf(node) + (index > cursor ? 1 : 0)];
        cursor += length;
      }
      return [editor, editor.childNodes.length];
    }
    const range = document.createRange(); range.setStart(...point(start)); range.setEnd(...point(end));
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    record.selection = { start, end }; field.setSelectionRange(start, end);
  }
  function render(selection) {
    editor.replaceChildren();
    for (const token of markupTokens(field.value)) {
      if (token.type === 'text') editor.append(document.createTextNode(token.raw));
      else {
        const span = document.createElement('span'); span.className = 'format-token'; span.contentEditable = 'false';
        span.dataset.formatSource = token.raw; span.dataset.sourceStart = String(token.start);
        span.title = 'Click to edit this formatting'; span.innerHTML = richText(token.raw);
        span.querySelectorAll('a').forEach(link => { link.removeAttribute('href'); link.removeAttribute('target'); });
        editor.append(span);
      }
    }
    // A real text node after the last token keeps subsequent typing outside it.
    editor.append(document.createTextNode(''));
    record.value = field.value;
    if (selection && !record.markup) select(selection.start, selection.end);
  }
  function remember(start, end = start) {
    if (record.history[record.index]?.value === field.value) return;
    record.history.splice(record.index + 1);
    record.history.push({ value: field.value, start, end });
    if (record.history.length > 100) record.history.shift();
    record.index = record.history.length - 1;
  }
  function emit() { field.dispatchEvent(new Event('input', { bubbles: true })); }
  function update(value, start, end = start) {
    if (field.maxLength >= 0 && value.length > field.maxLength) {
      error.textContent = `This field allows ${field.maxLength.toLocaleString()} characters, including markup. Shorten the text or put the link in the description.`;
      error.hidden = false; render(record.selection); return;
    }
    error.hidden = true; field.value = value; record.selection = { start, end }; remember(start, end); render(record.selection); emit();
  }
  function replace(text) {
    if (field.tagName !== 'TEXTAREA') text = text.replace(/\r\n?|\n/g, ' ');
    const current = snapshot();
    update(current.value.slice(0, current.start) + text + current.value.slice(current.end), current.start + text.length);
  }
  function showMarkup(markup, range = record.selection) {
    record.markup = markup; field.hidden = !markup; editor.hidden = markup;
    toggle.textContent = markup ? 'Hide markup' : 'Show markup'; toggle.setAttribute('aria-pressed', String(markup));
    if (markup) { nativeFocus(); field.setSelectionRange(range.start, range.end); }
    else { render(); editor.focus(); select(field.selectionStart, field.selectionEnd); }
  }
  function undo(redo = false) {
    const index = record.index + (redo ? 1 : -1);
    if (!record.history[index]) return;
    record.index = index; const entry = record.history[index];
    field.value = entry.value; render(entry); emit();
  }
  editor.addEventListener('input', event => {
    event.stopPropagation();
    if (record.composing || event.isComposing) return;
    const current = snapshot(); update(current.value, current.start, current.end);
  });
  editor.addEventListener('compositionstart', () => { record.composing = true; });
  editor.addEventListener('compositionend', () => { record.composing = false; const current = snapshot(); update(current.value, current.start, current.end); });
  editor.addEventListener('beforeinput', event => {
    if (record.composing || event.isComposing) return;
    if (event.inputType === 'insertText' && typeof event.data === 'string') { event.preventDefault(); replace(event.data); }
    if (['deleteContentBackward', 'deleteContentForward'].includes(event.inputType)) {
      event.preventDefault();
      const current = snapshot(), backward = event.inputType === 'deleteContentBackward';
      let { start, end } = current;
      if (start === end) {
        const token = markupTokens(current.value).find(token => token.type !== 'text' && (backward ? token.end === start : token.start === end));
        if (backward) start = token ? token.start : Math.max(0, start - ([...current.value.slice(0, start)].at(-1)?.length || 0));
        else end = token ? token.end : end + ([...current.value.slice(end)][0]?.length || 0);
      }
      update(current.value.slice(0, start) + current.value.slice(end), start);
    }
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') { event.preventDefault(); undo(event.inputType === 'historyRedo'); }
    if (['insertParagraph', 'insertLineBreak'].includes(event.inputType)) { event.preventDefault(); if (field.tagName === 'TEXTAREA') replace('\n'); }
  });
  editor.addEventListener('paste', event => { event.preventDefault(); replace(event.clipboardData.getData('text/plain')); });
  for (const type of ['copy', 'cut']) editor.addEventListener(type, event => {
    const current = snapshot();
    if (current.start === current.end) return;
    const selected = current.value.slice(current.start, current.end);
    event.preventDefault(); event.clipboardData.setData('text/plain', selected);
    event.clipboardData.setData('text/html', richText(selected));
    if (type === 'cut') update(current.value.slice(0, current.start) + current.value.slice(current.end), current.start);
  });
  editor.addEventListener('drop', event => { event.preventDefault(); });
  editor.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); undo(event.shiftKey || event.key.toLowerCase() === 'y'); }
    else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation(); field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: event.ctrlKey, metaKey: event.metaKey, bubbles: true }));
    } else if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) event.preventDefault();
    else if (event.key === 'Enter' && field.tagName !== 'TEXTAREA') { event.preventDefault(); field.form?.requestSubmit(); }
  });
  editor.addEventListener('click', event => {
    const token = event.target.closest('[data-format-source]');
    if (token) { event.preventDefault(); const start = Number(token.dataset.sourceStart); showMarkup(true, { start, end: start + token.dataset.formatSource.length }); }
  });
  editor.addEventListener('blur', () => {
    if (!record.composing) { const current = snapshot(); record.selection = { start: current.start, end: current.end }; field.setSelectionRange(current.start, current.end); }
  });
  toggle.addEventListener('click', event => { event.preventDefault(); showMarkup(!record.markup); });
  field.addEventListener('input', () => {
    if (field.value === record.value) return;
    remember(field.selectionStart, field.selectionEnd);
    if (record.markup) record.value = field.value;
    else render({ start: field.selectionStart, end: field.selectionEnd });
  }, true);
  field.addEventListener('invalid', event => { event.preventDefault(); showMarkup(true); });
  record.refresh = () => {
    if (field.value === record.value || record.composing) return;
    // Switching days or resetting a saved form starts a fresh editing history.
    record.history = []; record.index = -1; render(); remember(field.value.length);
  };
  render(); remember(field.value.length);
}
export function refreshFormatting() {
  document.querySelectorAll(selector).forEach(field => {
    if (!editors.has(field)) enhance(field);
    else editors.get(field).refresh();
  });
}
