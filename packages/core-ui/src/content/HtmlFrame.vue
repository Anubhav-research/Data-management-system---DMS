<script setup>
// An uploaded HTML page shown exactly as designed, inside a circular (product owner, 23 Nov 2026).
// Safe by design: the page sits in a sandboxed frame WITHOUT scripts, so it cannot run code, read the DMS session or
// change the DMS page around it; its own styles stay inside the frame. Links open in a new tab.
// Height: `fill` = fill the parent (full-screen reader); otherwise the page's own height, at most `cap` px (the frame
// then scrolls inside). Emits `measure` with the page's full height, so the card can offer "View full page".
import { ref, computed, onBeforeUnmount } from 'vue'
const props = defineProps({ html: { type: String, default: '' }, title: { type: String, default: 'HTML page' }, cap: { type: Number, default: 30000 }, fill: Boolean })
const emit = defineEmits(['measure'])
const frame = ref(null)
const height = ref(200)
const doc = computed(() => {
  const base = '<base target="_blank">'
  return /<head[^>]*>/i.test(props.html) ? props.html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : base + props.html
})
let ro = null
function fit() {
  const d = frame.value?.contentDocument; if (!d?.documentElement) return
  const full = Math.max(80, d.documentElement.scrollHeight, d.body?.scrollHeight || 0)
  emit('measure', full)
  if (props.fill) return
  // a page sized to the window (100vh) would grow with its frame forever: ignore tiny changes and cap the height
  const h = Math.min(props.cap, full)
  if (Math.abs(h - height.value) > 4) height.value = h
}
function onLoad() {
  fit(); ro?.disconnect()
  const d = frame.value?.contentDocument
  if (d?.body && window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(d.body) }
}
onBeforeUnmount(() => ro?.disconnect())
</script>
<template>
  <iframe ref="frame" :srcdoc="doc" :title="title" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    class="block w-full border-0 bg-white" :class="fill && 'h-full'" :style="fill ? null : { height: `${height}px` }" data-testid="html-frame" @load="onLoad" />
</template>
