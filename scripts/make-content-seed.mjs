// Makes the demo files of the Content Hub (services/content/seed-files/) from the list in services/content/seed.mjs:
// PDFs through the browser's print, PNG WhatsApp cards through a screenshot. Run once: node scripts/make-content-seed.mjs
import fs from 'node:fs'
import path from 'node:path'
import { ROOT } from '../services/lib/common.mjs'
import { launch } from '../qa/lib.mjs'
import { DOCS, QUIZZES } from '../services/content/seed.mjs'

const OUT = path.join(ROOT, 'services/content/seed-files'); fs.mkdirSync(OUT, { recursive: true })
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'apps/prospect-dms/public/assets/mh-logo.png')).toString('base64')

const pdfHtml = (title, desc, lines) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;margin:0;padding:48px 56px}
  header{display:flex;align-items:center;gap:12px;border-bottom:3px solid #E2553A;padding-bottom:14px}
  header img{width:40px;height:40px} header b{font-size:20px;color:#7B5190} header span{color:#E2553A}
  h1{font-size:26px;margin:28px 0 6px} p.d{color:#6b7280;margin:0 0 22px;font-size:14px}
  li{margin:9px 0;font-size:15px;line-height:1.45} footer{position:fixed;bottom:36px;left:56px;right:56px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px}
</style></head><body><header><img src="${logo}"><b>Money<span>Honey</span></b></header>
<h1>${esc(title)}</h1><p class="d">${esc(desc)}</p><ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<footer>Money Honey Financial Services · Demo document for the DMS · Not investment advice</footer></body></html>`

const cardHtml = (lines) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0} .c{width:1080px;height:1080px;box-sizing:border-box;padding:90px;font-family:'Segoe UI',Arial,sans-serif;
  background:linear-gradient(140deg,#7B5190 0%,#E2553A 100%);color:#fff;display:flex;flex-direction:column;justify-content:space-between}
  .t{font-size:84px;font-weight:700;line-height:1.1} .s{font-size:50px;margin-top:36px;opacity:.95} .f{display:flex;align-items:center;gap:22px;font-size:40px;font-weight:600}
  .f img{width:90px;height:90px;background:#fff;border-radius:50%;padding:8px}
</style></head><body><div class="c"><div><div class="t">${esc(lines[0])}</div>${lines.slice(1).map((l) => `<div class="s">${esc(l)}</div>`).join('')}</div>
<div class="f"><img src="${logo}">Money Honey</div></div></body></html>`

const b = await launch(); const page = await b.newPage()
for (const [file, , title, desc, , , lines] of DOCS) {
  if (file.endsWith('.png')) {
    await page.setViewportSize({ width: 1080, height: 1080 }); await page.setContent(cardHtml(lines))
    await page.screenshot({ path: path.join(OUT, file) })
  } else {
    await page.setContent(pdfHtml(title, desc, lines)); await page.pdf({ path: path.join(OUT, file), format: 'A4', printBackground: true })
  }
  console.log('made', file)
}
// quizzes: HTML (self-contained, like the old DMS ones) or a PDF question sheet
const quizHtml = (title, topic, qs) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} – Money Honey Quiz</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7f5f0;font-family:'Segoe UI',system-ui,sans-serif;color:#1f2a44}
.wrap{max-width:640px;margin:0 auto;padding:32px 20px}.card{background:#fff;border:1px solid #e7e2d8;border-radius:16px;padding:36px}
.logo{display:flex;align-items:center;gap:10px;justify-content:center;font-weight:700;color:#7B5190;font-size:20px}.logo img{width:40px}.logo span{color:#E2553A}
.badge{display:inline-block;background:#ff4f0f;color:#fff;font-size:12px;font-weight:700;letter-spacing:.08em;padding:6px 14px;border-radius:999px;margin-top:26px}
h1{font-family:Georgia,serif;font-size:34px;margin:16px 0 6px}.topic{color:#5b6475}.center{text-align:center}
.disc{background:#f4f2ee;border:1px solid #e7e2d8;border-radius:10px;padding:16px;margin:26px 0;font-size:14px;color:#5b6475;text-align:left}
.btn{background:#ff4f0f;color:#fff;border:0;border-radius:8px;padding:14px 34px;font-size:16px;font-weight:600;cursor:pointer}.btn:disabled{opacity:.4;cursor:default}
.top{display:flex;justify-content:space-between;align-items:center;color:#5b6475;font-size:14px}.bar{height:4px;background:#e7e2d8;border-radius:4px;margin:16px 0 28px}.bar i{display:block;height:100%;background:#ff4f0f;border-radius:4px;transition:width .3s}
.qn{color:#ff4f0f;font-size:12px;font-weight:700;letter-spacing:.1em}.q{font-family:Georgia,serif;font-size:22px;margin:10px 0 0}
.opt{display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:#fff;border:1px solid #e7e2d8;border-radius:10px;padding:16px;margin-top:12px;font-size:16px;cursor:pointer;color:#1f2a44}
.opt b{display:inline-flex;width:28px;height:28px;border-radius:50%;background:#f1efe9;align-items:center;justify-content:center;font-size:13px;color:#5b6475}
.opt:hover{border-color:#c9c2b4}.ok{border-color:#16a34a;background:#f0fdf4}.no{border-color:#dc2626;background:#fef2f2}
.why{margin-top:16px;font-size:14px;color:#5b6475}.foot{text-align:center;color:#9aa1ad;font-size:12px;margin-top:24px}.score{font-size:56px;font-weight:700;color:#ff4f0f}
</style></head><body><div class="wrap" id="app"></div><div class="foot">© Money Honey Financial Services · Demo quiz for the DMS</div><script>
const Q=${JSON.stringify(qs)};let i=-1,score=0;const app=document.getElementById('app');const L='ABCD';
function start(){app.innerHTML='<div class="card center"><div class="logo"><img src="${logo}">Money<span>Honey</span></div><div class="badge">WEEKLY QUIZ</div><h1>${esc(title)}</h1><div class="topic"><b>Topic:</b> ${esc(topic)}</div><div class="disc"><b>DISCLAIMER</b><br>This quiz is for fun and knowledge. Answers are checked in your browser.</div><button class="btn" onclick="next()">Start Quiz →</button></div>'}
function next(){i++;if(i>=Q.length)return end();const [q,o]=Q[i];app.innerHTML='<div class="top"><div class="logo" style="font-size:15px"><img src="${logo}" style="width:26px">Money<span>Honey</span></div><div>Question '+(i+1)+' of '+Q.length+'</div></div><div class="bar"><i style="width:'+(i/Q.length*100)+'%"></i></div><div class="card"><div class="qn">QUESTION '+(i+1)+'</div><p class="q">'+q+'</p></div>'+o.map((t,k)=>'<button class="opt" onclick="pick('+k+',this)"><b>'+L[k]+'</b>'+t+'</button>').join('')+'<div id="why" class="why"></div>'}
function pick(k,el){const [,o,c,w]=Q[i];const bs=[...document.querySelectorAll('.opt')];bs.forEach(b=>b.disabled=true);bs[c].classList.add('ok');if(k!==c)el.classList.add('no');else score++;document.getElementById('why').innerHTML=(k===c?'<b style="color:#16a34a">Correct.</b> ':'<b style="color:#dc2626">Not quite.</b> ')+w+'<div style="margin-top:16px"><button class="btn" onclick="next()">'+(i<Q.length-1?'Next →':'See result')+'</button></div>'}
function end(){app.innerHTML='<div class="card center"><div class="logo"><img src="${logo}">Money<span>Honey</span></div><p class="topic" style="margin-top:24px">Your score</p><div class="score">'+score+' / '+Q.length+'</div><p class="topic">'+(score===Q.length?'Perfect!':score>=3?'Well done.':'Keep learning — try again.')+'</p><button class="btn" onclick="i=-1;score=0;next()">Try again</button></div>'}
start()</script></body></html>`
const ipoQs = ['Where do you apply for an IPO?', 'What must be approved before 5 pm on the closing day?', 'How many working days until allotment?', 'What is a lot size?', 'What is the price band?']
for (const [file, title, topic, , , qs] of QUIZZES) {
  if (qs) { fs.writeFileSync(path.join(OUT, file), quizHtml(title, topic, qs)); console.log('made', file); continue }
  await page.setContent(pdfHtml(`Quiz: ${title}`, `${topic} – write your answers, then check the key on page 2`, ipoQs.map((q, n) => `Q${n + 1}. ${q}  ______________`)) .replace('</ul>', '</ul><div style="page-break-before:always"></div><h1>Answer key</h1><ul><li>In the broking app, with your UPI ID</li><li>The UPI mandate</li><li>2 working days</li><li>The minimum number of shares in one bid</li><li>The range within which you can bid</li></ul>'))
  await page.pdf({ path: path.join(OUT, file), format: 'A4', printBackground: true }); console.log('made', file)
}
await b.close()
