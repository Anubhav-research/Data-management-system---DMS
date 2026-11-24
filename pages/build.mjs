// npm run build:pages - builds the GitHub Pages demo into pages-dist/ (nothing else is changed):
//   pages-dist/index.html        home page: links to both websites, "Start over"
//   pages-dist/prospect/         Prospect DMS (normal build, relative paths)
//   pages-dist/investor/         Investor DMS
//   pages-dist/sw.js             the five services, running in the visitor's browser (pages/sw.js)
//   pages-dist/demo-data.json    starting data: a copy of this PC's current demo data (services/*/data)
//   pages-dist/demo-version.txt  changes when the demo data changes (visitors then get the new data)
// Publish the folder as it is (it holds no secret: the demo keys are the public placeholders from .env.example).
import { build } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { ROOT } from '../services/lib/common.mjs'

const OUT = path.join(ROOT, 'pages-dist')
const posix = (p) => p.split(path.sep).join('/')
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })

// 1. both websites. Their own script starts only once the demo's service worker is in charge of the page.
const bootstrap = {
  name: 'dms-pages-bootstrap',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      const m = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/)
      if (!m) throw new Error('entry script not found in index.html')
      return html.replace(m[0], `<script>window.__DMS_APP__=${JSON.stringify(m[1])}</script>\n<script>${fs.readFileSync(path.join(ROOT, 'pages', 'bootstrap.js'), 'utf8')}</script>`)
    },
  },
}
for (const [app, dir] of [['prospect-dms', 'prospect'], ['investor-dms', 'investor']]) {
  console.log(`[pages] building ${app}`)
  process.chdir(path.join(ROOT, 'apps', app)) // Tailwind finds the class names relative to the working folder
  await build({ root: path.join(ROOT, 'apps', app), configFile: path.join(ROOT, 'apps', app, 'vite.config.js'), base: './', logLevel: 'warn',
    plugins: [bootstrap], build: { outDir: path.join(OUT, dir), emptyOutDir: true } })
}

process.chdir(ROOT)

// 2. the services, bundled for the browser
const shim = (f) => path.join(ROOT, 'pages', 'shims', f)
const services = {
  name: 'dms-services-in-browser',
  transform(code, id) {
    const rel = posix(path.relative(ROOT, id.split('?')[0]))
    if (rel.startsWith('..') || rel.includes('node_modules')) return null
    let out = code.replaceAll('import.meta.url', JSON.stringify(`file:///app/${rel}`))
    // each service starts when the worker says so (after its data is loaded), not when the file is loaded
    if (/^services\/[\w-]+\/server\.mjs$/.test(rel)) {
      const lines = out.split('\n'); let last = -1
      lines.forEach((l, i) => { if (/^import\s/.test(l)) last = i })
      out = `${lines.slice(0, last + 1).join('\n')}\nexport async function __start() {\n${lines.slice(last + 1).join('\n')}\n}\n`
    }
    return { code: out, map: null }
  },
}
console.log('[pages] building the in-browser services (sw.js)')
await build({
  configFile: false, root: ROOT, logLevel: 'warn', publicDir: false,
  resolve: { alias: [['node:fs', 'node-fs.js'], ['node:path', 'node-path.js'], ['node:url', 'node-url.js'], ['node:crypto', 'node-crypto.js'], ['node:http', 'node-http.js']].map(([find, f]) => ({ find, replacement: shim(f) })) },
  plugins: [services],
  build: { outDir: OUT, emptyOutDir: false, target: 'es2022', minify: true, sourcemap: false,
    lib: { entry: path.join(ROOT, 'pages', 'sw.js'), formats: ['iife'], name: 'DMSDemo', fileName: () => 'sw.js' } },
})

// 3. the starting data: this PC's current demo data (old archived logs left out)
const files = {}
const add = (abs) => { files[`/app/${posix(path.relative(ROOT, abs))}`] = fs.readFileSync(abs).toString('base64') }
add(path.join(ROOT, '.env.example'))
add(path.join(ROOT, 'services', 'content', 'seed-files', 'market-update.xlsx')) // read by the Content Hub when it starts
add(path.join(ROOT, 'services', 'bridge', 'contract', 'handover-contract.json')) // read by the bridge on every handover
add(path.join(ROOT, 'services', 'tp-sim', 'seed.json')) // the simulator's starting data
for (const s of ['p-api', 'i-api', 'tp-sim', 'bridge', 'content']) {
  const dir = path.join(ROOT, 'services', s, 'data'); if (!fs.existsSync(dir)) continue
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (!/-archived-|access-denied|\.tmp$/.test(e.name)) add(p) } }
  walk(dir)
}
const body = JSON.stringify({ files })
const version = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)
fs.writeFileSync(path.join(OUT, 'demo-data.json'), JSON.stringify({ version, files }))
fs.writeFileSync(path.join(OUT, 'demo-version.txt'), version)
fs.copyFileSync(path.join(ROOT, 'pages', 'index.html'), path.join(OUT, 'index.html'))
fs.writeFileSync(path.join(OUT, '.nojekyll'), '')
console.log(`[pages] done: ${Object.keys(files).length} data files, version ${version} -> ${posix(path.relative(ROOT, OUT))}/`)
