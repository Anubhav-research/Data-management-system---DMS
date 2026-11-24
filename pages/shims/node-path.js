// POSIX path functions for the browser build of the services (GitHub Pages demo). Paths are virtual (root /app).
function normalize(p) {
  const abs = p.startsWith('/'); const out = []
  for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') { if (out.length && out[out.length - 1] !== '..') out.pop(); else if (!abs) out.push('..') } else out.push(s) }
  return (abs ? '/' : '') + out.join('/') || (abs ? '/' : '.')
}
const path = {
  sep: '/',
  normalize,
  join: (...a) => normalize(a.filter((x) => x !== '').join('/')),
  resolve(...a) { let r = ''; for (let i = a.length - 1; i >= 0 && !r.startsWith('/'); i--) r = a[i] + (r ? '/' + r : ''); return normalize(r.startsWith('/') ? r : '/app/' + r) },
  dirname(p) { p = normalize(p); const i = p.lastIndexOf('/'); return i <= 0 ? (p.startsWith('/') ? '/' : '.') : p.slice(0, i) },
  basename(p, ext) { const b = normalize(p).split('/').pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b },
  extname(p) { const b = normalize(p).split('/').pop(); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : '' },
  relative(from, to) { const f = normalize(from).split('/').filter(Boolean); const t = normalize(to).split('/').filter(Boolean); while (f.length && t.length && f[0] === t[0]) { f.shift(); t.shift() } return [...f.map(() => '..'), ...t].join('/') },
  isAbsolute: (p) => p.startsWith('/'),
}
path.posix = path
export default path
