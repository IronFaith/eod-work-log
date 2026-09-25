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
export function markupTokens(value, allowBold = true) {
  const source = String(value ?? ''), tokens = [];
  let index = 0, literal = 0;
  const add = (end, token) => {
    if (literal < index) tokens.push({ type: 'text', raw: source.slice(literal, index), start: literal, end: index });
    tokens.push({ ...token, raw: source.slice(index, end), start: index, end });
    index = literal = end;
  };
  while (index < source.length) {
    if (allowBold && source.startsWith('**', index)) {
      const end = source.indexOf('**', index + 2), text = source.slice(index + 2, end);
      if (end >= 0 && text.trim() && !text.includes('\n')) { add(end + 2, { type: 'bold', text: text.trim() }); continue; }
    }
    const rest = source.slice(index);
    const named = /^\[([^\]\n]+)\]\(/.exec(rest);
    const short = /^url\(/i.test(rest) && (index === 0 || !/[\w]/.test(source[index - 1]));
    const bare = /^https?:\/\//i.test(rest);
    if (named || short || bare) {
      const start = index + (named ? named[0].length : short ? 4 : 0);
      let end = start, depth = 0;
      while (end < source.length && !/[\s<>"']/.test(source[end])) {
        if (source[end] === '(') depth++;
        if (source[end] === ')') { if (!depth) break; depth--; }
        // A completed bold wrapper is not part of a bare URL.
        if (bare && source.startsWith('**', end)) break;
        end++;
      }
      if (bare) while (/[.,;:!?\]}]/.test(source[end - 1] || '')) end--;
      const raw = source.slice(start, end), url = safeWebURL(raw);
      if (url && (bare || source[end] === ')')) {
        const text = named ? named[1] : short ? new URL(url).hostname.replace(/^www\./, '').split('.')[0] : raw;
        add(end + (bare ? 0 : 1), { type: 'link', text, url, labeled: !bare }); continue;
      }
      // Preserve a broken wrapper as one literal string, including its URL.
      if (!bare) { index = Math.max(index + 1, end + (source[end] === ')' ? 1 : 0)); continue; }
    }
    index++;
  }
  if (literal < source.length) tokens.push({ type: 'text', raw: source.slice(literal), start: literal, end: source.length });
  return tokens;
}
export function linkParts(value) {
  return markupTokens(value).flatMap(token => token.type === 'bold'
    ? markupTokens(token.text, false).map(child => ({ text: child.type === 'text' ? child.raw : child.text, url: child.url, labeled: child.labeled, bold: true }))
    : [{ text: token.type === 'text' ? token.raw : token.text, url: token.url, labeled: token.labeled }]);
}
export const displayText = value => linkParts(value).map(part => part.text).join('');
export const readableText = value => linkParts(value).map(part => part.labeled && part.text !== part.url ? `${part.text} (${part.url})` : part.text).join('');
export const richText = value => linkParts(value).map(part => {
  const text = part.bold ? `<strong>${escapeHTML(part.text)}</strong>` : escapeHTML(part.text);
  return part.url ? `<a href="${escapeHTML(part.url)}" target="_blank" rel="noopener noreferrer" style="color:#165d91;text-decoration:underline;overflow-wrap:anywhere;">${text}</a>` : text;
}).join('').replace(/\n/g, '<br>\n');
