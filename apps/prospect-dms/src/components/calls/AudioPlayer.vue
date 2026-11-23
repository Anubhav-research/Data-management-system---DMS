<script setup>
// Inline call-recording player (port of Frappe CRM Activities/AudioPlayer.vue).
import { ref, computed } from 'vue'
import { Button, Dropdown } from 'frappe-ui'

const props = defineProps({ src: { type: String, default: '' }, name: { type: String, default: 'recording' } })
const audio = ref(null)
const isPaused = ref(true)
const duration = ref(0)
const currentTime = ref(0)
const progress = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0))
const volume = ref(1)

function playPause() {
  if (!audio.value) return
  if (audio.value.paused) { audio.value.play(); isPaused.value = false } else { audio.value.pause(); isPaused.value = true }
}
const fmt = (t) => (isNaN(t) || !isFinite(t) ? '00:00' : `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`)
function setVolume(v) { volume.value = Number(v); if (audio.value) audio.value.volume = volume.value }

const showSpeed = ref(false)
const speed = ref(1)
const options = computed(() => showSpeed.value
  ? [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((s) => ({ label: s === 1 ? 'Normal' : `${s}x`, icon: s === speed.value ? 'lucide-check' : undefined, onClick: () => { speed.value = s; if (audio.value) audio.value.playbackRate = s; showSpeed.value = false } }))
  : [
      { label: 'Download', icon: 'lucide-download', onClick: () => { const a = document.createElement('a'); a.href = props.src; a.download = `${props.name}.wav`; a.click() } },
      { label: 'Playback Speed', icon: 'lucide-gauge', onClick: (e) => { e?.preventDefault?.(); showSpeed.value = true } },
    ])
</script>
<template>
  <div class="w-full text-sm text-ink-gray-5" @click.stop>
    <div class="flex items-center gap-2">
      <Button variant="ghost" class="text-ink-gray-5" :icon="isPaused ? 'lucide-play' : 'lucide-pause'" :aria-label="isPaused ? 'Play' : 'Pause'" @click="playPause" />
      <div class="flex flex-1 items-center justify-between gap-2">
        <input class="dms-slider w-full" type="range" min="0" :max="duration || 0" step="0.01" :value="currentTime"
          :style="{ background: `linear-gradient(to right, var(--surface-gray-7, #525252) ${progress}%, var(--surface-gray-3, #ededed) ${progress}%)` }"
          aria-label="Seek" @input="(e) => audio && (audio.currentTime = e.target.value)" />
        <div class="shrink-0 tabular">{{ fmt(currentTime) }} / {{ fmt(duration) }}</div>
      </div>
      <div class="group flex items-center gap-1">
        <input class="dms-slider w-0 opacity-0 transition-all group-hover:w-20 group-hover:opacity-100" type="range" min="0" max="1" step="0.01" :value="volume"
          :style="{ background: `linear-gradient(to right, #525252 ${volume * 100}%, #ededed ${volume * 100}%)` }" aria-label="Volume" @input="(e) => setVolume(e.target.value)" />
        <Button variant="ghost" :icon="volume == 0 ? 'lucide-volume-x' : volume <= 0.4 ? 'lucide-volume-1' : 'lucide-volume-2'" aria-label="Mute" @click="setVolume(volume == 0 ? 1 : 0)" />
        <Dropdown :options="options" @update:open="(o) => o && (showSpeed = false)">
          <Button variant="ghost" icon="lucide-ellipsis" aria-label="More" />
        </Dropdown>
      </div>
    </div>
    <audio ref="audio" :src="src" preload="metadata" @loadedmetadata="duration = audio.duration" @timeupdate="currentTime = audio.currentTime" @ended="isPaused = true" />
  </div>
</template>
<style scoped>
.dms-slider { -webkit-appearance: none; appearance: none; height: 2px; border-radius: 100px; cursor: pointer; padding: 0; margin: 0; }
.dms-slider:focus-visible { outline: none; }
.dms-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 100px; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 0.25); }
.dms-slider::-moz-range-thumb { width: 14px; height: 14px; border: 0; border-radius: 100px; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 0.25); }
</style>
