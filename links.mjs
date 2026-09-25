// A deliberately small link syntax, not a general HTML/Markdown interpreter.
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function safeWebURL(value) {
  if (typeof value !== 'string' || value.length > 4000 || /[\s<>"'\x00-\x1f\x7f]/.test(value) || !/^https?:\/\//i.test(value)) return '';
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
export function teamsDestination(value) {
  const input = String(value ?? '').trim();
  if (!input) return '';
  if (input.length <= 254 && /^[^\s<>@,;/?&=]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(input)) return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(input)}`;
  const url = safeWebURL(input);
  if (url && new URL(url).protocol === 'https:' && ['teams.microsoft.com', 'teams.cloud.microsoft'].includes(new URL(url).hostname)) return url;
  throw new Error('Use a work email (Teams sign-in name) or an HTTPS link copied from Teams. A profile ID alone cannot open a chat.');
}
export function makeLink(label, value, person = false) {
  const name = label.trim();
  if (!name || /[\[\]\r\n]/.test(name)) throw new Error('Add a short link name without square brackets or line breaks.');
  const url = person ? teamsDestination(value) : safeWebURL(value.trim());
  if (!url) throw new Error('Paste a complete http:// or https:// link.');
  return `[${name}](${url.replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
}
export function linkParts(value) {
  const source = String(value ?? ''), parts = [];
  const starts = /\[([^\]\n]+)\]\((?=https?:\/\/)|https?:\/\//gi;
  let cursor = 0, match;
  while ((match = starts.exec(source))) {
    const labeled = match[1] !== undefined;
    const start = labeled ? starts.lastIndex : match.index;
    let end = start, depth = 0;
    while (end < source.length && !/[\s<>"']/.test(source[end])) {
      if (source[end] === '(') depth++;
      if (source[end] === ')') { if (!depth) break; depth--; }
      end++;
    }
    if (labeled && source[end] !== ')') continue;
    if (!labeled) {
      while (/[.,;:!?\]}]/.test(source[end - 1] || '')) end--;
    }
    const raw = source.slice(start, end), url = safeWebURL(raw);
    if (!url) continue;
    if (match.index > cursor) parts.push({ text: source.slice(cursor, match.index) });
    parts.push({ text: labeled ? match[1] : raw, url, labeled });
    cursor = end + (labeled ? 1 : 0);
    starts.lastIndex = cursor;
  }
  if (cursor < source.length) parts.push({ text: source.slice(cursor) });
  return parts;
}
export const displayText = value => linkParts(value).map(part => part.text).join('');
export const readableText = value => linkParts(value).map(part => part.labeled && part.text !== part.url ? `${part.text} (${part.url})` : part.text).join('');
export const richText = value => linkParts(value).map(part => part.url ? `<a href="${escapeHTML(part.url)}" target="_blank" rel="noopener noreferrer" style="color:#165d91;text-decoration:underline;overflow-wrap:anywhere;">${escapeHTML(part.text)}</a>` : escapeHTML(part.text)).join('').replace(/\n/g, '<br>\n');
