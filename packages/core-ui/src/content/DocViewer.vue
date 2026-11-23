<script setup>
// The document itself, drawn by us (pdf.js for PDFs) instead of the browser's PDF viewer, so the controls are only
// the ones the team needs (product owner, 17 Nov 2026): zoom out / zoom in, fit to width, rotate. No annotate, sign,
// save-to-drive or document properties. Keys: + and - zoom, 0 fit, R rotate.
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, shallowRef } from 'vue'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { kindOf } from './hub.js'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
const props = defineProps({ src: String, mime: String, name: String })
const kind = computed(() => kindOf(props.mime, props.name))
const box = ref(null) // scroll area
const pagesEl = ref(null)
const pdf = shallowRef(null)
const pageCount = ref(0); const current = ref(1)
const loading = ref(true); const failed = ref(false)
const fit = ref(true) // fit to width (re-fits when the window changes)
const scale = ref(1); const rotation = ref(0)
const natural = ref({ w: 0, h: 0 }) // image size, or the first PDF page at 100%
const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]
const percent = computed(() => `${Math.round(scale.value * 100)}%`)
const turned = computed(() => rotation.value % 180 !== 0)

function fitScale() {
  const w = (box.value?.clientWidth || 800) - 64
  const nat = turned.value ? natural.value.h : natural.value.w
  return nat ? Math.min(Math.max(w / nat, 0.25), kind.value === 'image' ? 1 : 1.3) : 1 // never blown up: a page stays readable as a whole
}
function zoom(dir) {
  fit.value = false
  const s = scale.value
  scale.value = dir > 0 ? STEPS.find((x) => x > s + 0.001) || STEPS.at(-1) : [...STEPS].reverse().find((x) => x < s - 0.001) || STEPS[0]
}
function toFit() { fit.value = true; scale.value = fitScale() }
function rotate() { rotation.value = (rotation.value + 90) % 360; if (fit.value) scale.value = fitScale() }

// ---- PDF
let renderId = 0
let tasks = [] // draws in progress: cancelled before a new draw, or two draws on one canvas stack their transforms
async function loadPdf() {
  loading.value = true; failed.value = false
  try {
    pdf.value = await pdfjs.getDocument({ url: props.src }).promise
    pageCount.value = pdf.value.numPages
    const v = (await pdf.value.getPage(1)).getViewport({ scale: 1 })
    natural.value = { w: v.width, h: v.height }
    loading.value = false
    await nextTick(); scale.value = fitScale(); schedule()
  } catch (e) { failed.value = true; loading.value = false }
}
async function renderPdf() {
  const doc = pdf.value; if (!doc || !pagesEl.value) return
  const id = ++renderId; const dpr = window.devicePixelRatio || 1
  tasks.forEach((t) => t.cancel()); tasks = []
  const holder = pagesEl.value
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n); if (id !== renderId) return
    const vp = page.getViewport({ scale: scale.value, rotation: rotation.value })
    let canvas = holder.children[n - 1]
    if (!canvas) { canvas = document.createElement('canvas'); canvas.className = 'mx-auto mb-4 block bg-white shadow-md'; canvas.dataset.page = n; holder.appendChild(canvas) }
    canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr)
    canvas.style.width = `${Math.floor(vp.width)}px`; canvas.style.height = `${Math.floor(vp.height)}px`
    const ctx = canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0)
    const task = page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined }); tasks.push(task)
    await task.promise.catch(() => {})
    if (id !== renderId) return
  }
}
let timer = null
function schedule() { clearTimeout(timer); timer = setTimeout(renderPdf, 60) }
watch([scale, rotation], () => { if (kind.value === 'pdf' && pdf.value) schedule() })
function onScroll() {
  if (!pagesEl.value) return
  const top = box.value.scrollTop + box.value.clientHeight / 3
  let n = 1; for (const c of pagesEl.value.children) if (c.offsetTop <= top) n = Number(c.dataset.page)
  current.value = n
}

// ---- image
function imgLoaded(e) { natural.value = { w: e.target.naturalWidth, h: e.target.naturalHeight }; loading.value = false; scale.value = fitScale() }
const imgStyle = computed(() => ({ width: `${natural.value.w * scale.value}px`, height: `${natural.value.h * scale.value}px`, transform: `rotate(${rotation.value}deg)` }))
const imgFrame = computed(() => ({ width: `${(turned.value ? natural.value.h : natural.value.w) * scale.value}px`, height: `${(turned.value ? natural.value.w : natural.value.h) * scale.value}px` }))

const ro = new ResizeObserver(() => { if (fit.value && natural.value.w) scale.value = fitScale() })
function onKey(e) {
  if (e.target.closest?.('input, textarea, [contenteditable]')) return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1) } else if (e.key === '-') { e.preventDefault(); zoom(-1) } else if (e.key === '0') { toFit() } else if (e.key === 'r' || e.key === 'R') { rotate() }
}
onMounted(() => {
  ro.observe(box.value); window.addEventListener('keydown', onKey)
  if (kind.value === 'pdf') loadPdf(); else if (kind.value !== 'image') loading.value = false
})
onBeforeUnmount(() => { ro.disconnect(); window.removeEventListener('keydown', onKey); renderId++; clearTimeout(timer); tasks.forEach((t) => t.cancel()); pdf.value?.destroy?.() })
defineExpose({ failed })
</script>
<template>
  <div class="relative flex min-h-0 flex-1 flex-col bg-surface-gray-3">
    <div ref="box" class="dms-scroll min-h-0 flex-1 overflow-auto px-8 pb-20 pt-6" data-testid="viewer" @scroll="onScroll">
      <div v-if="loading && kind !== 'image'" class="flex h-full items-center justify-center gap-2 text-base text-ink-gray-6"><span class="lucide-loader-circle size-4 animate-spin" />Opening…</div>
      <div v-if="failed" class="flex h-full flex-col items-center justify-center gap-2 text-ink-gray-6"><span class="lucide-file-warning size-8" /><p class="text-base">This file could not be shown. Download it to open it.</p></div>
      <div v-show="kind === 'pdf' && !failed" ref="pagesEl" class="w-max min-w-full" data-testid="viewer-pages" />
      <div v-if="kind === 'image'" class="mx-auto flex items-center justify-center" :style="imgFrame">
        <img :src="src" :alt="name" class="max-w-none rounded-sm bg-white shadow-md transition-transform" :style="imgStyle" @load="imgLoaded" @error="failed = true; loading = false" />
      </div>
      <div v-if="kind !== 'pdf' && kind !== 'image'" class="flex h-full flex-col items-center justify-center gap-2 text-ink-gray-6">
        <span class="lucide-eye-off size-8" /><p class="text-base">No preview for this type of file. Download it to open it.</p>
      </div>
    </div>
    <!-- floating controls -->
    <div v-if="(kind === 'pdf' || kind === 'image') && !failed && !loading" class="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
      <div class="pointer-events-auto flex items-center gap-0.5 rounded-full border bg-surface-base px-1.5 py-1 shadow-lg" data-testid="viewer-tools">
        <span v-if="pageCount > 1" class="px-2 text-sm tabular-nums text-ink-gray-6" data-testid="viewer-page">{{ current }} / {{ pageCount }}</span>
        <span v-if="pageCount > 1" class="mx-0.5 h-4 w-px bg-outline-gray-2" />
        <button class="flex size-8 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2" title="Zoom out (−)" data-testid="zoom-out" @click="zoom(-1)"><span class="lucide-zoom-out size-4" /></button>
        <button class="min-w-[52px] rounded-full px-1 text-sm tabular-nums text-ink-gray-8 hover:bg-surface-gray-2" title="Fit to width (0)" data-testid="zoom-level" @click="toFit">{{ percent }}</button>
        <button class="flex size-8 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2" title="Zoom in (+)" data-testid="zoom-in" @click="zoom(1)"><span class="lucide-zoom-in size-4" /></button>
        <span class="mx-0.5 h-4 w-px bg-outline-gray-2" />
        <button class="flex size-8 items-center justify-center rounded-full hover:bg-surface-gray-2" :class="fit ? 'text-ink-gray-9 bg-surface-gray-2' : 'text-ink-gray-7'" title="Fit to width (0)" @click="toFit"><span class="lucide-move-horizontal size-4" /></button>
        <button class="flex size-8 items-center justify-center rounded-full text-ink-gray-7 hover:bg-surface-gray-2" title="Rotate (R)" data-testid="rotate" @click="rotate"><span class="lucide-rotate-cw size-4" /></button>
      </div>
    </div>
  </div>
</template>
