<script setup>
// Quiz: weekly knowledge quizzes for the team, the same in every DMS website (Content Hub).
// Redesigned 21 Nov 2026 (product owner: "as a UI/UX expert"), in the Frappe CRM style of the rest of the DMS:
//   top    - this week's quiz as one clear card: what it is, Start (or Take again), and on the right
//            the team member's own progress ("3 of 5 done") or, for Admin, the % of each team that took it
//   list   - every other quiz as a list (like the DMS lists): To do / Done / All, search, period; each row says
//            what to do next (Start, Take again) - Admin sees the % of each team (B2C, B2B) instead
//   Admin  - New Quiz (HTML or PDF file), Edit, Delete, and Participation: % per team, then who took it / not yet.
// `people`: this website's team (MHF ID, name, role). Everyone with a login takes part and is counted - advisors,
// team leaders and above (product owner, 21 Nov 2026); only Admin, who publishes quizzes, is not.
// Opened from the user menu (top left) or a notification; ?play=<quiz id> opens that quiz at once.
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, TextInput, Dropdown, Dialog, FormControl, toast, dialog } from 'frappe-ui'
import HeaderTools from './HeaderTools.vue'
import QuizPlayer from './QuizPlayer.vue'
import { quizzes, loadQuizzes, quizApi, readFile, fmtSize, AUDIENCE, audienceShort } from './hub.js'
import { fmtDate, fmtDateTime, timeAgo } from '../format.js'

const props = defineProps({ people: { type: Array, default: () => [] }, takerRole: { type: String, default: 'IS' } })
const route = useRoute(); const router = useRouter()
const items = computed(() => quizzes.value.items)
const admin = computed(() => quizzes.value.admin)
const latest = computed(() => items.value[0] || null)
// Participation (Admin; product owner, 21 Nov 2026): the share of each team (B2C, B2B) that took the quiz, counted
// against the team's full list (from every website of that team, via the Content Hub). Each person
// counts once, however many times they opened it; everyone except Admin is counted.
const teams = computed(() => quizzes.value.teams || [])
function stats(x) {
  return teams.value.filter((T) => x.audience === 'All' || x.audience === T.team).map((T) => {
    const ids = new Set(T.people.map((p) => p.mhfId))
    const attempted = (x.attempts || []).filter((a) => (ids.size ? ids.has(a.mhfId) : a.team === T.team && a.role !== 'Admin')).sort((a, b) => a.first - b.first)
    const tookIds = new Set(attempted.map((a) => a.mhfId))
    return { team: T.team, label: `${T.team} team`, total: ids.size, took: attempted.length, pct: ids.size ? Math.min(100, Math.round((attempted.length / ids.size) * 100)) : null,
      attempted, notYet: T.people.filter((p) => !tookIds.has(p.mhfId)).sort((a, b) => a.name.localeCompare(b.name)), sites: T.sites }
  })
}
const barTone = (p) => (p == null ? '' : p >= 75 ? 'bg-surface-green-7' : p >= 40 ? 'bg-surface-amber-7' : 'bg-surface-red-7')
// the team member's own progress over every quiz
const doneCount = computed(() => items.value.filter((x) => x.mine).length)
const myPct = computed(() => (items.value.length ? Math.round((doneCount.value / items.value.length) * 100) : 0))

// list: every quiz except the one on top (unless searching), by status, period and words
const q = ref(''); const status = ref(null); const period = ref(0)
const PERIODS = [[0, 'Any time'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 12 months']]
const words = computed(() => q.value.toLowerCase().split(/\s+/).filter(Boolean))
const searching = computed(() => words.value.length > 0 || !!period.value)
const base = computed(() => items.value.filter((x) => (searching.value || x.id !== latest.value?.id)
  && (!period.value || Date.now() - x.publishedAt <= period.value * 86400000)
  && words.value.every((w) => `${x.title} ${x.topic}`.toLowerCase().includes(w))))
const counts = computed(() => ({ todo: base.value.filter((x) => !x.mine).length, done: base.value.filter((x) => x.mine).length, '': base.value.length }))
// first view: To do when something is left to do, else All
const tab = computed(() => (admin.value ? '' : status.value ?? (counts.value.todo ? 'todo' : '')))
const list = computed(() => base.value.filter((x) => !tab.value || (tab.value === 'done' ? !!x.mine : !x.mine)))
const TABS = [['todo', 'To do'], ['done', 'Done'], ['', 'All']]
const periodMenu = computed(() => PERIODS.map(([v, l]) => ({ label: l, icon: period.value === v ? 'lucide-check' : '', onClick: () => { period.value = v } })))
const isNew = (x) => !admin.value && !x.mine && Date.now() - x.publishedAt <= 30 * 86400000
const emptyText = computed(() => (searching.value ? 'No quiz matches your search.' : tab.value === 'todo' ? 'Nothing left to do. Well done!' : tab.value === 'done' ? 'You have not taken any of these yet.' : 'No earlier quizzes.'))

// play
const playing = ref(null); const playOpen = ref(false)
function play(x) { playing.value = x; playOpen.value = true }
const actionLabel = (x) => (admin.value ? 'Preview' : x.mine ? 'Take again' : 'Start')

// ---- Admin
const blank = () => ({ open: false, id: null, title: '', topic: '', audience: 'All', file: null, busy: false })
const form = ref(blank()); const fileInput = ref(null)
function newQuiz() { form.value = { ...blank(), open: true } }
function editQuiz(x) { form.value = { ...blank(), open: true, id: x.id, title: x.title, topic: x.topic, audience: x.audience } }
function onFile(e) {
  const f = e.target.files?.[0] || e.dataTransfer?.files?.[0]; if (e.target.value) e.target.value = ''
  if (!f) return
  if (!/\.(html?|pdf)$/i.test(f.name)) return toast.error('A quiz must be an HTML or PDF file.')
  if (f.size > 10 * 1024 * 1024) return toast.error('The file is larger than 10 MB.')
  form.value.file = f
  if (!form.value.title) form.value.title = f.name.replace(/\.(html?|pdf)$/i, '').replace(/^MoneyHoney[_ ]Quiz[_ ]/i, '').replace(/[_]+/g, ' ').replace(/\s*\d{1,2}[._-]\d{1,2}[._-]\d{2,4}\s*$/, '').trim()
}
const canSave = computed(() => form.value.title.trim() && (form.value.id || form.value.file) && !form.value.busy)
async function save() {
  const f = form.value; f.busy = true
  try {
    if (f.id) await quizApi.update(f.id, { title: f.title, topic: f.topic, audience: f.audience })
    else await quizApi.publish({ title: f.title, topic: f.topic, audience: f.audience, file: await readFile(f.file) })
    toast.success(f.id ? 'Quiz updated' : `Quiz published to ${audienceShort(f.audience).toLowerCase()} in every DMS`); form.value.open = false
  } catch (e) { toast.error(e.message) } finally { form.value.busy = false }
}
function remove(x) {
  dialog.confirm({ title: 'Delete this quiz?', message: `"${x.title}" disappears from Quiz in every DMS. Its attempt records are kept.`, confirmLabel: 'Delete', theme: 'red',
    onConfirm: async () => { try { await quizApi.remove(x.id); toast.success('Quiz deleted') } catch (e) { toast.error(e.message) } } })
}
const menu = (x) => [
  { label: 'Participation', icon: 'lucide-users', onClick: () => showWho(x) },
  { label: 'Edit', icon: 'lucide-pencil', onClick: () => editQuiz(x) },
  { label: 'Delete', icon: 'lucide-trash-2', theme: 'red', onClick: () => remove(x) },
]

// participation in depth: pick a team, then who took it / who has not yet
const who = ref({ open: false, quiz: null, team: '', tab: 'done', q: '' })
function showWho(x, team) { const s = stats(x); who.value = { open: true, quiz: x, team: team || s[0]?.team || '', tab: 'done', q: '' } }
const whoStats = computed(() => (who.value.quiz ? stats(who.value.quiz) : []))
const whoTeam = computed(() => whoStats.value.find((s) => s.team === who.value.team) || whoStats.value[0] || null)
const whoMatch = (p) => { const w = who.value.q.toLowerCase().trim(); return !w || `${p.name} ${p.mhfId}`.toLowerCase().includes(w) }
const whoRows = computed(() => (whoTeam.value ? (who.value.tab === 'done' ? whoTeam.value.attempted : whoTeam.value.notYet).filter(whoMatch) : []))

onMounted(async () => {
  await loadQuizzes()
  // Admin: give the hub this website's quiz takers, so each team's % counts against its whole list
  if (admin.value && props.people.length) { try { await quizApi.roster(props.takerRole, props.people); await loadQuizzes() } catch {} }
  const id = route.query.play; const x = id && items.value.find((i) => i.id === id)
  if (x) { play(x); router.replace({ query: { ...route.query, play: undefined } }) }
})
const icon = (x) => (x.format === 'PDF' ? 'lucide-file-text' : 'lucide-graduation-cap')
const tile = (x) => (x.format === 'PDF' ? 'bg-surface-red-1 text-ink-red-6' : 'bg-surface-orange-1 text-ink-orange-6')
</script>
<template>
  <div class="flex h-full flex-col">
    <header class="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b bg-surface-base px-5">
      <nav class="text-lg font-medium text-ink-gray-9">Quiz</nav>
      <div class="flex items-center gap-2">
        <template v-if="admin"><Button variant="solid" label="New Quiz" icon-left="lucide-plus" data-testid="new-quiz" @click="newQuiz" /><span class="mx-1 h-5 w-px bg-outline-gray-2" /></template>
        <HeaderTools />
      </div>
    </header>

    <div class="dms-scroll min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto max-w-5xl px-6 py-6">
        <div v-if="quizzes.error" class="rounded-4 bg-surface-red-1 p-3 text-base text-ink-red-7">{{ quizzes.error }}</div>
        <div v-else-if="!quizzes.loaded" class="py-16 text-center text-base text-ink-gray-5">Loading quizzes…</div>
        <div v-else-if="!items.length" class="flex flex-col items-center gap-3 py-20 text-center">
          <span class="flex size-12 items-center justify-center rounded-full bg-surface-gray-2"><span class="lucide-graduation-cap size-6 text-ink-gray-5" /></span>
          <p class="text-base text-ink-gray-6">No quiz yet.</p>
          <Button v-if="admin" variant="solid" label="New Quiz" icon-left="lucide-plus" @click="newQuiz" />
        </div>
        <template v-else>
          <!-- this week's quiz -->
          <section v-if="latest && !searching" class="overflow-hidden rounded-8 border bg-surface-base shadow-sm" data-testid="quiz-hero">
            <div class="flex flex-col md:flex-row">
              <div class="flex min-w-0 flex-1 gap-4 p-5">
                <span class="flex size-12 shrink-0 items-center justify-center rounded-8" :class="tile(latest)"><span :class="icon(latest)" class="size-6" /></span>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2 text-xs">
                    <span class="font-medium uppercase tracking-wider text-ink-gray-5">This week's quiz</span>
                    <span v-if="isNew(latest)" class="rounded-full bg-surface-blue-2 px-2 py-0.5 font-medium text-ink-blue-7">New</span>
                    <span v-if="admin && latest.audience !== 'All'" class="rounded bg-surface-gray-2 px-1.5 py-0.5 text-ink-gray-6">{{ audienceShort(latest.audience) }}</span>
                  </div>
                  <h2 class="mt-1.5 text-xl font-semibold text-ink-gray-9" data-testid="hero-title">{{ latest.title }}</h2>
                  <p v-if="latest.topic" class="mt-0.5 text-base text-ink-gray-6">{{ latest.topic }}</p>
                  <p class="mt-1 text-sm text-ink-gray-5">{{ fmtDate(latest.publishedAt) }} · {{ latest.format === 'PDF' ? 'PDF' : 'Interactive' }}</p>
                  <div class="mt-4 flex flex-wrap items-center gap-3">
                    <Button :variant="latest.mine && !admin ? 'subtle' : 'solid'" :label="admin ? 'Preview quiz' : latest.mine ? 'Take again' : 'Start quiz'"
                      :icon-left="admin ? 'lucide-eye' : latest.mine ? 'lucide-rotate-ccw' : 'lucide-play'" data-testid="hero-start" @click="play(latest)" />
                    <span v-if="latest.mine && !admin" class="flex items-center gap-1 text-sm text-ink-green-7"><span class="lucide-circle-check size-4" />Done {{ timeAgo(latest.mine.first) }}<template v-if="latest.mine.times > 1"> · taken {{ latest.mine.times }} times</template></span>
                    <span v-else-if="admin" class="text-sm text-ink-gray-5">Your preview is not counted</span>
                  </div>
                </div>
              </div>
              <!-- right: own progress, or the team's participation (Admin) -->
              <div class="flex shrink-0 flex-col justify-center gap-2 border-t bg-surface-gray-1 p-5 md:w-72 md:border-l md:border-t-0">
                <template v-if="admin">
                  <div class="text-sm text-ink-gray-6">Team participation</div>
                  <button v-for="s in stats(latest)" :key="s.team" type="button" class="rounded-4 text-left hover:bg-surface-gray-2" data-testid="hero-team" @click="showWho(latest, s.team)">
                    <div class="flex items-baseline justify-between gap-2">
                      <span class="text-sm font-medium text-ink-gray-8">{{ s.label }}</span>
                      <span v-if="s.pct != null" class="text-xl font-semibold tabular-nums text-ink-gray-9" data-testid="hero-count">{{ s.pct }}%</span>
                      <span v-else class="text-xs text-ink-gray-5">No team list yet</span>
                    </div>
                    <div v-if="s.pct != null" class="mt-1 h-1.5 rounded-full bg-surface-gray-3"><div class="h-full rounded-full" :class="barTone(s.pct)" :style="{ width: `${s.pct}%` }" /></div>
                    <div v-if="s.pct != null" class="mt-0.5 text-xs text-ink-gray-5">{{ s.took }} of {{ s.total }} took it</div>
                  </button>
                  <Button class="mt-1" label="See who took it" icon-left="lucide-users" @click="showWho(latest)" />
                </template>
                <template v-else>
                  <div class="text-sm text-ink-gray-6">Your progress</div>
                  <div class="text-2xl font-semibold tabular-nums text-ink-gray-9" data-testid="my-progress">{{ doneCount }}<span class="text-base font-normal text-ink-gray-5"> of {{ items.length }} done</span></div>
                  <div class="h-1.5 rounded-full bg-surface-gray-3"><div class="h-full rounded-full bg-surface-green-7" :style="{ width: `${myPct}%` }" /></div>
                  <p class="text-xs text-ink-gray-5">{{ doneCount === items.length ? 'You have taken every quiz.' : `${items.length - doneCount} left to take` }}</p>
                </template>
              </div>
            </div>
          </section>

          <!-- every other quiz -->
          <div class="mb-2 mt-8 flex flex-wrap items-center gap-2">
            <h3 class="mr-1 text-base font-semibold text-ink-gray-9">{{ searching ? 'Search results' : 'Earlier quizzes' }}</h3>
            <div v-if="!admin" class="flex rounded-4 bg-surface-gray-2 p-0.5" role="tablist">
              <button v-for="[v, l] in TABS" :key="v" type="button" role="tab" :aria-selected="tab === v" class="flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-sm"
                :class="tab === v ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-6 hover:text-ink-gray-8'" :data-testid="`quiz-status-${v || 'all'}`" @click="status = v">
                {{ l }}<span class="rounded-full px-1.5 text-xs tabular-nums" :class="tab === v ? 'bg-surface-gray-2 text-ink-gray-7' : 'text-ink-gray-5'">{{ counts[v] }}</span>
              </button>
            </div>
            <div class="flex-1" />
            <TextInput v-model="q" class="w-56" placeholder="Search quizzes" data-testid="quiz-search">
              <template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template>
            </TextInput>
            <Dropdown :options="periodMenu"><Button :label="PERIODS.find((p) => p[0] === period)[1]" icon-left="lucide-calendar" icon-right="lucide-chevron-down" :variant="period ? 'subtle' : 'outline'" /></Dropdown>
          </div>

          <div class="overflow-hidden rounded-8 border bg-surface-base">
            <div v-for="x in list" :key="x.id" class="group flex cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-surface-gray-1" data-testid="quiz-card" @click="play(x)">
              <span class="flex size-9 shrink-0 items-center justify-center rounded-6" :class="tile(x)"><span :class="icon(x)" class="size-4" /></span>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate text-base font-medium text-ink-gray-9">{{ x.title }}</span>
                  <span v-if="isNew(x)" class="shrink-0 rounded-full bg-surface-blue-2 px-2 py-0.5 text-xs font-medium text-ink-blue-7">New</span>
                  <span v-if="admin && x.audience !== 'All'" class="shrink-0 rounded bg-surface-gray-2 px-1.5 py-0.5 text-2xs text-ink-gray-6">{{ audienceShort(x.audience) }}</span>
                </div>
                <div class="truncate text-sm text-ink-gray-5">{{ x.topic || (x.format === 'PDF' ? 'PDF quiz' : 'Interactive quiz') }}</div>
              </div>
              <span class="hidden w-28 shrink-0 text-sm text-ink-gray-5 sm:block">{{ fmtDate(x.publishedAt) }}</span>
              <!-- status -->
              <button v-if="admin" type="button" class="hidden w-48 shrink-0 space-y-1.5 rounded-4 text-left md:block" title="Participation" data-testid="card-attempts" @click.stop="showWho(x)">
                <div v-for="s in stats(x)" :key="s.team" class="flex items-center gap-2 text-xs">
                  <span class="w-16 shrink-0 text-ink-gray-6">{{ s.label }}</span>
                  <template v-if="s.pct != null">
                    <span class="h-1.5 flex-1 rounded-full bg-surface-gray-3"><span class="block h-full rounded-full" :class="barTone(s.pct)" :style="{ width: `${s.pct}%` }" /></span>
                    <span class="w-9 shrink-0 text-right font-medium tabular-nums text-ink-gray-8">{{ s.pct }}%</span>
                  </template>
                  <span v-else class="flex-1 text-ink-gray-4">No team list yet</span>
                </div>
              </button>
              <span v-else-if="x.mine" class="hidden w-36 shrink-0 items-center gap-1 text-sm text-ink-green-7 md:flex" data-testid="card-done" :title="fmtDateTime(x.mine.first)"><span class="lucide-circle-check size-4" />Done {{ fmtDate(x.mine.first) }}</span>
              <span v-else class="hidden w-36 shrink-0 text-sm text-ink-gray-5 md:block">Not taken yet</span>
              <Button size="sm" :variant="!admin && !x.mine ? 'solid' : 'subtle'" :label="actionLabel(x)" class="shrink-0" @click.stop="play(x)" />
              <Dropdown v-if="admin" :options="menu(x)" @click.stop><Button variant="ghost" icon="lucide-ellipsis" /></Dropdown>
            </div>
            <p v-if="!list.length" class="px-4 py-12 text-center text-base text-ink-gray-5">{{ emptyText }}</p>
          </div>
        </template>
      </div>
    </div>

    <QuizPlayer v-model:open="playOpen" :quiz="playing" />

    <!-- Participation (Admin): % per team first, then who took it and who has not yet -->
    <Dialog v-model:open="who.open" :title="who.quiz ? `Participation: ${who.quiz.title}` : ''" size="3xl">
      <div v-if="who.quiz" class="space-y-4" data-testid="participation">
        <p v-if="!whoStats.length" class="rounded-4 bg-surface-gray-1 px-3 py-6 text-center text-sm text-ink-gray-6">This quiz is not for a team whose list this DMS has.</p>
        <!-- one card per team: the share who took it; click to see the people -->
        <div class="grid gap-3" :class="whoStats.length > 1 ? 'sm:grid-cols-2' : ''">
          <button v-for="s in whoStats" :key="s.team" type="button" class="rounded-6 border p-3 text-left transition-colors"
            :class="whoTeam?.team === s.team ? 'border-outline-gray-4 bg-surface-gray-1 ring-1 ring-outline-gray-4' : 'hover:bg-surface-gray-1'" :data-testid="`who-team-${s.team}`" @click="who.team = s.team; who.tab = 'done'">
            <div class="flex items-baseline justify-between">
              <span class="text-sm font-medium text-ink-gray-8">{{ s.label }}</span>
              <span v-if="s.pct != null" class="text-2xl font-semibold tabular-nums text-ink-gray-9">{{ s.pct }}%</span>
            </div>
            <template v-if="s.pct != null">
              <div class="mt-1.5 h-2 rounded-full bg-surface-gray-3"><div class="h-full rounded-full" :class="barTone(s.pct)" :style="{ width: `${s.pct}%` }" /></div>
              <div class="mt-1.5 text-xs text-ink-gray-6">{{ s.took }} of {{ s.total }} took it · {{ s.total - s.took }} not yet</div>
            </template>
            <p v-else class="mt-2 text-xs text-ink-gray-5">No {{ s.team }} team list yet: it appears once a {{ s.team }} DMS is connected.</p>
          </button>
        </div>

        <template v-if="whoTeam && whoTeam.pct != null">
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex rounded-4 bg-surface-gray-2 p-0.5 text-sm">
              <button type="button" class="rounded-[5px] px-3 py-1" :class="who.tab === 'done' ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-6'" data-testid="who-done" @click="who.tab = 'done'">Took it ({{ whoTeam.took }})</button>
              <button type="button" class="rounded-[5px] px-3 py-1" :class="who.tab === 'todo' ? 'bg-surface-base font-medium text-ink-gray-9 shadow-sm' : 'text-ink-gray-6'" data-testid="who-todo" @click="who.tab = 'todo'">Not yet ({{ whoTeam.notYet.length }})</button>
            </div>
            <div class="flex-1" />
            <TextInput v-model="who.q" class="w-52" placeholder="Find a person">
              <template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template>
            </TextInput>
          </div>
          <div class="dms-scroll max-h-[45vh] overflow-y-auto rounded-6 border">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-surface-gray-1 text-left text-xs text-ink-gray-5">
                <tr><th class="px-3 py-2 font-medium">Name</th><template v-if="who.tab === 'done'"><th class="py-2 font-medium">First taken</th><th class="py-2 pr-3 text-right font-medium" title="How many times they opened the quiz">Attempts</th></template></tr>
              </thead>
              <tbody>
                <tr v-for="p in whoRows" :key="p.mhfId" class="border-t" data-testid="who-row">
                  <td class="px-3 py-2"><div class="text-ink-gray-8">{{ p.name }}</div><div class="text-xs text-ink-gray-5">{{ p.mhfId }}</div></td>
                  <template v-if="who.tab === 'done'">
                    <td class="text-ink-gray-7" :title="fmtDateTime(p.first)">{{ fmtDate(p.first) }}</td>
                    <td class="pr-3 text-right tabular-nums text-ink-gray-7" :title="p.times > 1 ? `Last ${fmtDateTime(p.last)}` : undefined">{{ p.times }}</td>
                  </template>
                </tr>
                <tr v-if="!whoRows.length"><td colspan="3" class="px-3 py-8 text-center text-ink-gray-5">{{ who.q ? 'Nobody matches.' : who.tab === 'done' ? 'Nobody has taken it yet.' : 'Everyone has taken it.' }}</td></tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </Dialog>

    <!-- New / edit quiz (Admin) -->
    <Dialog v-model:open="form.open" :title="form.id ? 'Edit quiz' : 'New quiz'" size="lg" :dismissible="!form.busy">
      <div class="space-y-4">
        <div v-if="!form.id">
          <div class="mb-1.5 text-xs text-ink-gray-5">Quiz file (HTML or PDF) <span class="text-ink-red-6">*</span></div>
          <button v-if="!form.file" type="button" class="flex w-full flex-col items-center gap-1 rounded-6 border-2 border-dashed px-4 py-6 text-center hover:bg-surface-gray-1" @click="fileInput.click()" @dragover.prevent @drop.prevent="onFile">
            <span class="lucide-upload size-5 text-ink-gray-5" /><span class="text-base text-ink-gray-7">Choose or drop the quiz file</span><span class="text-xs text-ink-gray-5">.html (interactive) or .pdf · up to 10 MB</span>
          </button>
          <div v-else class="flex items-center gap-3 rounded-4 border p-2.5">
            <span class="lucide-file-check size-4 text-ink-gray-6" /><span class="min-w-0 flex-1 truncate text-base">{{ form.file.name }}</span><span class="text-sm text-ink-gray-5">{{ fmtSize(form.file.size) }}</span>
            <Button variant="ghost" icon="lucide-x" @click="form.file = null" />
          </div>
          <input ref="fileInput" type="file" accept=".html,.htm,.pdf" class="hidden" data-testid="quiz-file" @change="onFile" />
        </div>
        <FormControl v-model="form.title" label="Title" required placeholder="e.g. Basics of Mutual Funds" data-testid="quiz-title" />
        <FormControl v-model="form.topic" label="Topic" placeholder="e.g. NAV, SIP, fund types & regulation" />
        <FormControl v-model="form.audience" label="Who takes it" type="select" :options="AUDIENCE" />
        <p class="text-xs text-ink-gray-5">Published once, shown in every DMS website of this audience. A person counts as attempted when they start it.</p>
      </div>
      <template #actions>
        <div class="flex justify-end gap-2"><Button label="Cancel" :disabled="form.busy" @click="form.open = false" /><Button variant="solid" :loading="form.busy" :label="form.id ? 'Save' : 'Publish'" :disabled="!canSave" data-testid="quiz-save" @click="save" /></div>
      </template>
    </Dialog>
  </div>
</template>
