// Minimal Node Buffer for the browser build of the services (GitHub Pages demo). Covers what services/ uses:
// Buffer.from(string|bytes, 'utf8'|'base64'|'hex'), Buffer.concat, Buffer.byteLength, buf.toString(enc), buf.length.
const enc = new TextEncoder(); const dec = new TextDecoder()

function b64encode(bytes) {
  let s = ''; const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH))
  return btoa(s)
}
function b64decode(str) {
  const s = atob(String(str).replace(/[^A-Za-z0-9+/=]/g, '').replace(/=+$/, (m) => m))
  const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export class Buffer extends Uint8Array {
  static from(v, encoding) {
    if (v instanceof ArrayBuffer) return new Buffer(v)
    if (ArrayBuffer.isView(v)) { const b = new Buffer(v.byteLength); b.set(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); return b }
    if (Array.isArray(v)) return Buffer.of.apply(Buffer, v)
    const s = String(v)
    if (encoding === 'base64') return Buffer.from(b64decode(s))
    if (encoding === 'hex') { const b = new Buffer(s.length >> 1); for (let i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 2, 2), 16); return b }
    return Buffer.from(enc.encode(s))
  }
  static alloc(n) { return new Buffer(n) }
  static isBuffer(v) { return v instanceof Buffer }
  static byteLength(v) { return typeof v === 'string' ? enc.encode(v).length : v.byteLength }
  static concat(list) {
    const total = list.reduce((n, b) => n + b.length, 0); const out = new Buffer(total); let o = 0
    for (const b of list) { out.set(b, o); o += b.length }
    return out
  }
  toString(encoding) {
    if (encoding === 'base64') return b64encode(this)
    if (encoding === 'hex') return [...this].map((x) => x.toString(16).padStart(2, '0')).join('')
    return dec.decode(this)
  }
  toJSON() { return { type: 'Buffer', data: [...this] } }
}
export default { Buffer }
