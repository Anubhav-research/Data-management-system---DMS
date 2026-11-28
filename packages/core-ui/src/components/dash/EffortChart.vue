<script setup>
// Effort vs results (TL and above; product owner, 26 Nov 2026). Calls a day across, a chosen result up.
//  - People: every IS as a dot. The dashed lines are the company's middle values (medians), so everyone is measured
//    against the same line; they split people into four groups. A team can be picked: its people stay,
//    with a ◆ for the team's own figure.
//  - Teams: one bubble per team (size = number of IS), with the team's pooled figures (its calls ÷ its working days,
//    its connected calls ÷ its calls ...). Beside it, how each team's people spread over the four bands - the "why".
// Hover shows the numbers; a click on a person shows their dashboard, a click on a team opens its people.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { inrShort } from '../../format.js'

// card: { points: [{ id, name, code, team, raw: { calls, days, ... }, x, y: { <result>: value } }], idle, teams, x, ys }
// ys: [{ key, label, fmt: 'pct' | 'n' | 'money', num, den }] - a team's figure is pooled from its people's raw counts:
// num ÷ den (× 100 for a rate), e.g. connected ÷ calls, or money invested ÷ working days
const props = defineProps({ card: { type: Object, required: true } })
const emit = defineEmits(['scope'])

const view = ref('people')
const yKey = ref(props.card.ys[0].key)
const Y = computed(() => props.card.ys.find((y) => y.key === yKey.value))
const teams = computed(() => props.card.teams || [...new Set(props.card.points.map((p) => p.team))].sort())
const team = ref('')

// ---- figures
const all = computed(() => props.card.points.filter((p) => p.y[yKey.value] != null))
const median = (l) => { if (!l.length) return 0; const a = [...l].sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2 }
const mx = computed(() => median(all.value.map((p) => p.x)))
const my = computed(() => median(all.value.map((p) => p.y[yKey.value])))
const r1 = (v) => Math.round(v * 10) / 10
/** A group's pooled figures: calls a day per working day, and each result from its people's raw counts. */
function pooled(list) {
  const t = (k) => list.reduce((s, p) => s + (Number(p.raw[k]) || 0), 0)
  const days = t('days'); const y = {}
  for (const r of props.card.ys) { const den = t(r.den); y[r.key] = den ? (r.fmt === 'pct' ? r1((t(r.num) / den) * 100) : r1(t(r.num) / den)) : null }
  return { x: days ? r1(t('calls') / days) : 0, y }
}
const BANDS = [
  // everyday words the organisation uses (product owner, 26 Nov 2026)
  { key: 'high', label: 'Star', hint: 'Many calls and a good result', color: '#059669' },
  { key: 'activity', label: 'Hard worker', hint: 'Many calls, but the result is low', color: '#d97706' },
  { key: 'efficiency', label: 'Smart worker', hint: 'A good result from fewer calls', color: '#2563eb' },
  { key: 'focus', label: 'Needs attention', hint: 'Few calls and a low result', color: '#dc2626' },
]
const bandOf = (p) => { const hiX = p.x >= mx.value; const hiY = p.y[yKey.value] >= my.value; return hiX && hiY ? 'high' : hiX ? 'activity' : hiY ? 'efficiency' : 'focus' }
const colorOf = (p) => BANDS.find((b) => b.key === bandOf(p)).color

// people view
const shown = computed(() => all.value.filter((p) => !team.value || p.team === team.value))
const teamMark = computed(() => (team.value && shown.value.length ? pooled(shown.value) : null))
const counts = computed(() => Object.fromEntries(BANDS.map((b) => [b.key, shown.value.filter((p) => bandOf(p) === b.key).length])))
const picked = ref(null)
const open = computed(() => picked.value ?? ['focus', 'activity', 'efficiency', 'high'].find((k) => counts.value[k]) ?? 'focus')
const listed = computed(() => shown.value.filter((p) => bandOf(p) === open.value).sort((a, b) => (['high', 'efficiency'].includes(open.value) ? b.y[yKey.value] - a.y[yKey.value] : a.y[yKey.value] - b.y[yKey.value]) || a.name.localeCompare(b.name)))
// teams view
const teamRows = computed(() => teams.value.map((t) => {
  const people = all.value.filter((p) => p.team === t)
  const f = pooled(people)
  return { key: t, label: t, size: people.length, x: f.x, y: f.y, mix: Object.fromEntries(BANDS.map((b) => [b.key, people.filter((p) => bandOf(p) === b.key).length])) }
}).filter((r) => r.size))
function openTeam(t) { team.value = t; view.value = 'people'; picked.value = null; hover.value = null }

// ---- drawing: real width; scales fitted to what is shown
const box = ref(null); const width = ref(800); let ro = null
onMounted(() => { ro = new ResizeObserver(([e]) => { width.value = Math.max(200, Math.round(e.contentRect.width)) }); ro.observe(box.value) })
onBeforeUnmount(() => ro?.disconnect())
const H = 320; const PAD = { left: 48, right: 16, top: 26, bottom: 36 }
function niceRange(vals) {
  if (!vals.length) return { lo: 0, hi: 1, ticks: [0, 1] }
  let lo = Math.min(...vals); let hi = Math.max(...vals); const span = hi - lo || Math.max(1, hi)
  lo = Math.max(0, lo - span * 0.15); hi += span * 0.15
  const raw = (hi - lo) / 4; const mag = 10 ** Math.floor(Math.log10(raw)); const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw)
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step
  const ticks = []; for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 100) / 100)
  return { lo, hi, ticks }
}
const plotted = computed(() => (view.value === 'teams' ? teamRows.value : shown.value))
const xs = computed(() => niceRange([...plotted.value.map((p) => p.x), mx.value]))
const ys = computed(() => niceRange([...plotted.value.map((p) => p.y[yKey.value]).filter((v) => v != null), my.value]))
const px = (v) => PAD.left + ((v - xs.value.lo) / (xs.value.hi - xs.value.lo || 1)) * (width.value - PAD.left - PAD.right)
const py = (v) => PAD.top + (1 - (v - ys.value.lo) / (ys.value.hi - ys.value.lo || 1)) * (H - PAD.top - PAD.bottom)
const fmtY = (v) => (v == null ? '–' : Y.value.fmt === 'pct' ? `${r1(v)}%` : Y.value.fmt === 'money' ? inrShort(v) : String(r1(v)))
const maxSize = computed(() => Math.max(1, ...teamRows.value.map((t) => t.size)))
const bubble = (t) => 12 + 14 * Math.sqrt(t.size / maxSize.value)
const hover = ref(null)
const tip = computed(() => (hover.value ? { left: Math.min(width.value - 210, Math.max(0, px(hover.value.x) + 14)), top: Math.max(0, py(hover.value.y[yKey.value] ?? my.value) - 74) } : null))
</script>

<template>
  <div data-testid="dash-effort">
    <!-- what to show -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="inline-flex rounded-6 bg-surface-gray-2 p-0.5 text-sm" role="tablist" aria-label="View">
        <button v-for="[k, l, i] in [['people', 'People', 'lucide-user'], ['teams', 'Teams', 'lucide-users']]" :key="k" type="button" role="tab" :aria-selected="view === k" class="inline-flex items-center gap-1.5 rounded-[5px] px-3 py-1"
          :class="view === k ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-8'" :data-testid="`dash-effort-view-${k}`" @click="view = k; hover = null"><span :class="i" class="size-3.5" />{{ l }}</button>
      </div>
      <div class="inline-flex rounded-6 bg-surface-gray-2 p-0.5 text-sm" role="tablist" aria-label="Result">
        <button v-for="y in card.ys" :key="y.key" type="button" role="tab" :aria-selected="yKey === y.key" class="rounded-[5px] px-3 py-1"
          :class="yKey === y.key ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-8'" :data-testid="`dash-effort-y-${y.key}`" @click="yKey = y.key">{{ y.label }}</button>
      </div>
      <div v-if="view === 'people' && teams.length > 1" class="ml-auto flex flex-wrap items-center gap-1" role="tablist" aria-label="Team">
        <button v-for="t in ['', ...teams]" :key="t || 'all'" type="button" role="tab" :aria-selected="team === t" class="rounded-full border px-2.5 py-0.5 text-sm"
          :class="team === t ? 'border-outline-gray-4 bg-surface-gray-2 font-medium text-ink-gray-9' : 'border-transparent text-ink-gray-6 hover:bg-surface-gray-1'" :data-testid="`dash-effort-team-${t || 'all'}`" @click="team = t; picked = null">{{ t || 'All teams' }}</button>
      </div>
    </div>

    <p v-if="!all.length" class="py-10 text-center text-sm text-ink-gray-5">No calls in this period.</p>
    <div v-else class="mt-3 grid gap-5 xl:grid-cols-[1fr_22rem]">
      <!-- the chart -->
      <div ref="box" class="relative min-w-0" :style="{ height: `${H}px` }" @mouseleave="hover = null">
        <svg :width="width" :height="H" class="absolute inset-0" role="img" :aria-label="`${card.x.label} against ${Y.label}`">
          <!-- the best and the weakest corner, lightly tinted -->
          <rect :x="px(mx)" :y="PAD.top" :width="Math.max(0, width - PAD.right - px(mx))" :height="Math.max(0, py(my) - PAD.top)" fill="#0596690d" />
          <rect :x="PAD.left" :y="py(my)" :width="Math.max(0, px(mx) - PAD.left)" :height="Math.max(0, H - PAD.bottom - py(my))" fill="#dc26260b" />
          <g v-for="t in ys.ticks" :key="`y${t}`">
            <line :x1="PAD.left" :x2="width - PAD.right" :y1="py(t)" :y2="py(t)" class="stroke-current text-ink-gray-2" stroke-dasharray="2 4" />
            <text :x="PAD.left - 8" :y="py(t)" text-anchor="end" dominant-baseline="middle" class="fill-current text-[10px] tabular-nums text-ink-gray-5">{{ fmtY(t) }}</text>
          </g>
          <text v-for="t in xs.ticks" :key="`x${t}`" :x="px(t)" :y="H - PAD.bottom + 15" text-anchor="middle" class="fill-current text-[10px] tabular-nums text-ink-gray-5">{{ t }}</text>
          <text :x="PAD.left" :y="12" class="fill-current text-[11px] font-medium text-ink-gray-6">{{ Y.label }}{{ view === 'teams' && Y.fmt !== 'pct' ? ' (per IS)' : '' }}</text>
          <text :x="width - PAD.right" :y="H - 4" text-anchor="end" class="fill-current text-[11px] font-medium text-ink-gray-6">{{ card.x.label }}{{ view === 'teams' ? ' per IS' : '' }}</text>
          <!-- the company's middle values, labelled on the lines -->
          <line :x1="px(mx)" :x2="px(mx)" :y1="PAD.top" :y2="H - PAD.bottom" class="stroke-current text-ink-gray-5" stroke-dasharray="5 4" />
          <line :x1="PAD.left" :x2="width - PAD.right" :y1="py(my)" :y2="py(my)" class="stroke-current text-ink-gray-5" stroke-dasharray="5 4" />
          <text :x="px(mx) + 5" :y="PAD.top + 10" class="fill-current text-[10px] text-ink-gray-6">Median {{ r1(mx) }} / day</text>
          <text :x="width - PAD.right - 4" :y="py(my) - 5" text-anchor="end" class="fill-current text-[10px] text-ink-gray-6">Median {{ fmtY(my) }}</text>
          <!-- the four bands, named quietly in their corners -->
          <text :x="width - PAD.right - 4" :y="PAD.top + 24" text-anchor="end" class="text-[11px] font-medium" fill="#059669">Star</text>
          <text :x="width - PAD.right - 4" :y="H - PAD.bottom - 8" text-anchor="end" class="text-[11px] font-medium" fill="#d97706">Hard worker</text>
          <text :x="PAD.left + 6" :y="PAD.top + 24" class="text-[11px] font-medium" fill="#2563eb">Smart worker</text>
          <text :x="PAD.left + 6" :y="H - PAD.bottom - 8" class="text-[11px] font-medium" fill="#dc2626">Needs attention</text>
          <!-- people -->
          <template v-if="view === 'people'">
            <circle v-for="p in shown" :key="p.id" :cx="px(p.x)" :cy="py(p.y[yKey])" :r="hover?.id === p.id ? 7 : 5" :fill="colorOf(p)" :fill-opacity="hover && hover.id !== p.id ? 0.3 : 0.8"
              class="cursor-pointer" stroke="white" stroke-width="1" data-testid="dash-effort-dot" @mouseenter="hover = p" @click="emit('scope', p.id)" />
            <!-- the chosen team's own figure -->
            <g v-if="teamMark && teamMark.y[yKey] != null" :transform="`translate(${px(teamMark.x)},${py(teamMark.y[yKey])})`" class="pointer-events-none" data-testid="dash-effort-teammark">
              <rect x="-7" y="-7" width="14" height="14" transform="rotate(45)" fill="#111827" stroke="white" stroke-width="2" />
              <text x="12" y="4" class="fill-current text-[11px] font-semibold text-ink-gray-9">{{ team }} average</text>
            </g>
          </template>
          <!-- teams -->
          <template v-else>
            <g v-for="t in teamRows" :key="t.key" class="cursor-pointer" data-testid="dash-effort-team-dot" @mouseenter="hover = t" @click="openTeam(t.key)">
              <circle :cx="px(t.x)" :cy="py(t.y[yKey] ?? my)" :r="bubble(t)" :fill="colorOf(t)" :fill-opacity="hover && hover.key !== t.key ? 0.3 : 0.75" stroke="white" stroke-width="2" />
              <text :x="px(t.x)" :y="py(t.y[yKey] ?? my)" text-anchor="middle" dominant-baseline="middle" class="pointer-events-none text-[11px] font-semibold" fill="white">{{ t.label }}</text>
            </g>
          </template>
        </svg>
        <div v-if="hover" class="pointer-events-none absolute z-10 w-52 rounded-8 border bg-surface-modal px-3 py-2 text-xs shadow-lg" :style="{ left: `${tip.left}px`, top: `${tip.top}px` }">
          <div class="font-medium text-ink-gray-9">{{ hover.name || hover.label }}</div>
          <div class="text-ink-gray-5">{{ hover.code ? `${hover.code} · ${hover.team}` : `${hover.size} IS` }}</div>
          <div class="mt-1.5 flex justify-between"><span class="text-ink-gray-6">{{ card.x.label }}{{ hover.size ? ' per IS' : '' }}</span><b class="tabular-nums text-ink-gray-9">{{ hover.x }}</b></div>
          <div class="flex justify-between"><span class="text-ink-gray-6">{{ Y.label }}</span><b class="tabular-nums text-ink-gray-9">{{ fmtY(hover.y[yKey]) }}</b></div>
        </div>
      </div>

      <!-- People: the four bands and who is in the one opened -->
      <div v-if="view === 'people'" class="min-w-0">
        <div class="grid grid-cols-2 gap-1.5">
          <button v-for="b in BANDS" :key="b.key" type="button" class="rounded-8 border px-2.5 py-2 text-left" :class="open === b.key ? 'border-outline-gray-4 bg-surface-gray-2' : 'border-outline-gray-1 hover:bg-surface-gray-1'"
            :data-testid="`dash-effort-group-${b.key}`" @click="picked = b.key">
            <span class="flex items-center gap-1.5 text-xs font-medium text-ink-gray-7"><span class="size-2 rounded-full" :style="{ background: b.color }" />{{ b.label }}</span>
            <span class="text-lg font-semibold tabular-nums text-ink-gray-9">{{ counts[b.key] }}</span>
            <span class="block text-[11px] leading-tight text-ink-gray-5">{{ b.hint }}</span>
          </button>
        </div>
        <div class="mt-2 overflow-hidden rounded-8 border">
          <div class="flex items-center justify-between bg-surface-gray-1 px-2.5 py-1.5 text-[11px] text-ink-gray-5"><span>Person</span><span>Calls a day · {{ Y.label }}</span></div>
          <ul class="dms-scroll max-h-[10rem] divide-y overflow-y-auto" data-testid="dash-effort-list">
            <li v-for="p in listed" :key="p.id">
              <button type="button" class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-surface-gray-1" @click="emit('scope', p.id)" @mouseenter="hover = p" @mouseleave="hover = null">
                <span class="min-w-0 flex-1"><span class="block truncate text-ink-gray-8">{{ p.name }}</span><span class="block text-[11px] text-ink-gray-5">{{ p.code }} · {{ p.team }}</span></span>
                <span class="whitespace-nowrap text-right text-xs tabular-nums text-ink-gray-6">{{ p.x }} · <b class="font-medium text-ink-gray-9">{{ fmtY(p.y[yKey]) }}</b></span>
              </button>
            </li>
            <li v-if="!listed.length" class="px-2.5 py-3 text-center text-xs text-ink-gray-5">Nobody in this band.</li>
          </ul>
        </div>
      </div>

      <!-- Teams: each team's figures, and how its people spread over the bands (why it sits where it does) -->
      <div v-else class="min-w-0">
        <div class="overflow-hidden rounded-8 border">
          <div class="grid grid-cols-[1fr_auto_auto] gap-x-3 bg-surface-gray-1 px-2.5 py-1.5 text-[11px] text-ink-gray-5"><span>Team</span><span class="text-right">Calls / day</span><span class="w-16 text-right">{{ Y.label.replace(' a day', '') }}</span></div>
          <button v-for="t in teamRows" :key="t.key" type="button" class="block w-full border-t px-2.5 py-2 text-left hover:bg-surface-gray-1" :title="`Open the people of ${t.label}`" :data-testid="`dash-effort-teamrow-${t.key}`" @click="openTeam(t.key)" @mouseenter="hover = t" @mouseleave="hover = null">
            <span class="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 text-sm">
              <span class="flex min-w-0 items-center gap-1.5"><span class="size-2 shrink-0 rounded-full" :style="{ background: colorOf(t) }" /><b class="truncate font-medium text-ink-gray-9">{{ t.label }}</b><span class="text-xs text-ink-gray-5">{{ t.size }} IS</span></span>
              <span class="text-right tabular-nums text-ink-gray-7">{{ t.x }}</span>
              <span class="w-16 text-right font-medium tabular-nums text-ink-gray-9">{{ fmtY(t.y[yKey]) }}</span>
            </span>
            <!-- its people over the four bands -->
            <span class="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-gray-2">
              <span v-for="b in BANDS" :key="b.key" class="h-full" :style="{ width: `${(t.mix[b.key] / t.size) * 100}%`, background: b.color }" :title="`${b.label}: ${t.mix[b.key]}`" />
            </span>
            <span class="mt-0.5 flex justify-between text-[10px] tabular-nums text-ink-gray-5"><span>{{ t.mix.high }} star{{ t.mix.high === 1 ? '' : 's' }}</span><span>{{ t.mix.focus }} need{{ t.mix.focus === 1 ? 's' : '' }} attention</span></span>
          </button>
        </div>
        <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-gray-5">
          <span v-for="b in BANDS" :key="b.key" class="inline-flex items-center gap-1"><span class="size-2 rounded-full" :style="{ background: b.color }" />{{ b.label }}</span>
        </div>
      </div>
    </div>
    <p v-if="card.idle" class="mt-2 text-[11px] text-ink-gray-5">{{ card.idle }} IS made no call in this period and are not shown.</p>
  </div>
</template>
