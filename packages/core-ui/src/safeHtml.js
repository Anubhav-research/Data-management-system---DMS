// Email and circular bodies are stored as HTML written in our own editor; before showing one, keep only plain
// formatting tags and safe links, so nothing in a stored body can run or restyle the page.
const KEEP = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'DIV', 'SPAN', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH'])
function clean(node) {
  for (const n of [...node.childNodes]) {
    if (n.nodeType === 3) continue
    if (n.nodeType !== 1) { n.remove(); continue }
    if (!KEEP.has(n.tagName)) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|META|LINK)$/.test(n.tagName)) n.remove(); else { clean(n); n.replaceWith(...n.childNodes) } continue }
    for (const a of [...n.attributes]) {
      const keep = (n.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value)) || ['colspan', 'rowspan'].includes(a.name)
      if (!keep) n.removeAttribute(a.name)
    }
    if (n.tagName === 'A') { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer') }
    clean(n)
  }
  return node
}
export function safeHtml(html) { return clean(new DOMParser().parseFromString(String(html || ''), 'text/html').body).innerHTML }
/** Plain text (old emails, templates) as simple HTML paragraphs. */
export function textToHtml(t) { return String(t || '').split(/\n{2,}/).map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('') }
