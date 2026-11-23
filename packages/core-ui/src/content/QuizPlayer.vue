<script setup>
// Takes a quiz inside the DMS. HTML quiz: runs as it is in a frame; PDF quiz: our viewer (zoom, fit, rotate).
// Counting (product owner, 17 Nov 2026): an HTML quiz counts once the person clicks or types inside it (e.g. "Start
// Quiz"), a PDF quiz when it is opened. Once per opening; the hub counts each person once per quiz.
import { ref, watch } from 'vue'
import { Dialog, Button, Tooltip } from 'frappe-ui'
import DocViewer from './DocViewer.vue'
import { fileUrl, download, quizApi, quizzes } from './hub.js'

const props = defineProps({ quiz: Object })
const open = defineModel('open', { type: Boolean })
const counted = ref(false)
async function count() {
  if (counted.value || !props.quiz || quizzes.value.admin) return
  counted.value = true
  try { await quizApi.attempt(props.quiz.id) } catch { counted.value = false }
}
watch(open, (v) => { if (v) { counted.value = false; if (props.quiz?.format === 'PDF') count() } })
function onFrameLoad(e) {
  try { // same website, so the frame's page can be watched for the first click or key press
    const doc = e.target.contentDocument
    const once = () => { count(); doc.removeEventListener('pointerdown', once, true); doc.removeEventListener('keydown', once, true) }
    doc.addEventListener('pointerdown', once, true); doc.addEventListener('keydown', once, true)
  } catch { count() } // cannot watch it: opening counts
}
</script>
<template>
  <Dialog v-model:open="open" size="5xl" bare>
    <div v-if="quiz" class="flex h-[90vh] flex-col overflow-hidden rounded-[inherit]">
      <div class="flex items-center gap-3 border-b px-5 py-3">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-6 bg-surface-orange-1 text-ink-orange-6"><span class="lucide-graduation-cap size-5" /></span>
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-lg font-semibold text-ink-gray-9" data-testid="player-title">{{ quiz.title }}</h3>
          <p class="truncate text-sm text-ink-gray-5">{{ quiz.topic || 'Quiz' }} · {{ quiz.format }}</p>
        </div>
        <span v-if="quizzes.admin" class="shrink-0 rounded-full bg-surface-gray-2 px-2.5 py-1 text-xs text-ink-gray-6">Preview · not counted</span>
        <span v-else-if="counted || quiz.mine" class="flex shrink-0 items-center gap-1 rounded-full bg-surface-green-1 px-2.5 py-1 text-xs font-medium text-ink-green-7" data-testid="player-counted"><span class="lucide-check size-3.5" />Attempted</span>
        <Tooltip v-if="quiz.format === 'PDF'" text="Download"><Button variant="ghost" icon="lucide-download" @click="download({ docId: quiz.docId, name: quiz.fileName || `${quiz.title}.pdf` })" /></Tooltip>
        <span class="mx-1 h-5 w-px bg-outline-gray-2" />
        <Tooltip text="Close (Esc)"><Button variant="ghost" icon="lucide-x" data-testid="player-close" @click="open = false" /></Tooltip>
      </div>
      <iframe v-if="quiz.format === 'HTML'" :src="fileUrl(quiz.docId)" class="min-h-0 w-full flex-1 border-0 bg-white" :title="quiz.title" data-testid="player-frame" @load="onFrameLoad" />
      <DocViewer v-else :key="quiz.docId" :src="fileUrl(quiz.docId)" mime="application/pdf" :name="quiz.fileName" />
    </div>
  </Dialog>
</template>
