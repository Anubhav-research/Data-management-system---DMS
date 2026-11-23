<script setup>
// IS Mapping - book transfer (Admin only; D06 §7; MAP-001..011; Fig 23736, 24446, 24602, 24070).
// Investor DMS: Investors and Data Codes only; Investors move by WHOLE Data Code (MAP-007). Prospects and Leads are
// mapped in Prospect DMS. Every moved family is reported to Prospect DMS by the family log (F2), and other groups of
// the same family move together (DECISION-20).
import { ref, computed, watch } from 'vue'
import { Dialog, Button, Badge, TextInput, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { holdings, validateTransfer, executeTransfer, plCount } from '@/services/lifecycle'
import { fmtDateTime, timeAgo } from '@/utils/format'
import SettingsShell from '@/components/settings/SettingsShell.vue'
import QuickSelect from '@/components/QuickSelect.vue'

const db = useDb()
const uname = (id) => db.userById(id)?.name || '-'
const umhf = (id) => db.userById(id)?.mhf_id || ''
// TL, VP and President also hold a personal book and work fully as an Investment Specialist,
// so every non-Admin user counts as a specialist here (KPI, holdings and transfer receivers).
const isSpecialist = (u) => u.role !== 'Admin'
const specialists = computed(() => db.users.filter(isSpecialist))
const lastUpdated = (id) => {
  const t = db.transfers.find((x) => x.from === id || x.to.some((r) => r.userId === id))
  return t?.at || null
}
const holdingRows = computed(() => specialists.value.map((u) => ({ u, h: holdings(u.id), last: lastUpdated(u.id) })))
const kpis = computed(() => {
  const all = holdingRows.value
  return [
    { label: 'Total Investment Specialist', value: specialists.value.length, sub: 'IS, TL, VP & President' },
    { label: 'Total Investors', value: all.reduce((s, r) => s + r.h.investors, 0), sub: 'Across all IS' },
    { label: 'Data Codes', value: db.users.reduce((s, u) => s + (u.dataCodes?.length || 0), 0), sub: 'Currently mapped' },
  ]
})
// IS Holdings filters / paging (5, 20, 50)
const status = ref(undefined)
const q = ref('')
const pageSize = ref(5)
const page = ref(1)
const filtered = computed(() => holdingRows.value.filter((r) => (!status.value || (status.value === 'Active') === r.u.active) && (!q.value || `${r.u.name} ${r.u.mhf_id}`.toLowerCase().includes(q.value.toLowerCase()))))
watch([status, q, pageSize], () => (page.value = 1))
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
const pageRows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const canTransfer = (r) => r.h.investors > 0

// Recent transfers - one row per receiver
const transferRows = computed(() => db.transfers.flatMap((t) => t.to.map((r, i) => ({ key: `${t.id}-${i}`, at: t.at, from: t.from, to: r.userId, prospects: r.prospects || 0, leads: r.leads || 0, investors: r.investors || 0, codes: r.codes || [], movedBy: t.movedBy }))))
const historyOpen = ref(false)
const historyQ = ref('')
const historyRows = computed(() => transferRows.value.filter((r) => !historyQ.value || `${uname(r.from)} ${uname(r.to)} ${umhf(r.from)} ${umhf(r.to)}`.toLowerCase().includes(historyQ.value.toLowerCase())))

// ---------------- Transfer wizard ----------------
const tOpen = ref(false)
const step = ref('allocate')
const src = ref(null)
const plan = ref({ prospects: [], leads: [], codes: {} })
const err = ref('')
const srcH = computed(() => (src.value ? holdings(src.value) : { prospects: 0, leads: 0, investors: 0, codes: [] }))
const codeCount = (code) => db.clients.filter((c) => c.assignedTo === src.value && c.stage === 'Investor' && c.dataCode === code).length
const receivers = computed(() => db.users.filter((u) => u.active && isSpecialist(u) && u.id !== src.value).map((u) => ({ label: `${u.name} (${u.mhf_id})`, value: u.id }))) // inactive can't receive [CONFIRM D06 §7.6]
// a specialist already picked in another row of the same section is not offered again
const receiversFor = (k, i) => receivers.value.filter((r) => !plan.value[k].some((a, j) => j !== i && a.userId === r.value))
function openTransfer(u) { src.value = u.id; plan.value = { prospects: [{ userId: '', count: '' }], leads: [{ userId: '', count: '' }], codes: Object.fromEntries(holdings(u.id).codes.map((c) => [c, ''])) }; step.value = 'allocate'; err.value = ''; tOpen.value = true }
const allocated = (k) => plan.value[k].reduce((s, a) => s + Number(a.count || 0), 0)
// Each row may take at most what the other rows leave: the section total can never exceed the source's count
const rowMax = (k, i) => Math.max(0, srcH.value[k] - plan.value[k].reduce((s, a, j) => s + (j === i ? 0 : Number(a.count || 0)), 0))
const rowOver = (k, i) => Number(plan.value[k][i].count || 0) > rowMax(k, i)
const overError = (k) => {
  const name = k === 'prospects' ? 'Prospects' : 'Leads'
  if (allocated(k) > srcH.value[k]) return `${uname(src.value)} has only ${srcH.value[k]} ${name}. You have allocated ${allocated(k)} — reduce it by ${allocated(k) - srcH.value[k]}.`
  if (plan.value[k].some((a) => Number(a.count) < 0 || (a.count !== '' && !Number.isInteger(Number(a.count))))) return `Enter a whole number of ${name}.`
  if (plan.value[k].some((a) => !a.userId && Number(a.count) > 0)) return `Select a specialist for every row with a count.`
  return ''
}
const hasOver = computed(() => !!(overError('prospects') || overError('leads')))
const anyAllocation = computed(() => allocated('prospects') + allocated('leads') > 0 || Object.values(plan.value.codes).some(Boolean))
const impact = computed(() => {
  const map = {}
  const add = (u, k, n) => { if (!u || !n) return; map[u] = map[u] || { prospects: 0, leads: 0, investors: 0 }; map[u][k] += n }
  plan.value.prospects.forEach((a) => add(a.userId, 'prospects', Number(a.count || 0)))
  plan.value.leads.forEach((a) => add(a.userId, 'leads', Number(a.count || 0)))
  Object.entries(plan.value.codes).forEach(([code, u]) => add(u, 'investors', codeCount(code)))
  return Object.entries(map).map(([u, d]) => ({ u, d, h: holdings(u) }))
})
const srcAfter = computed(() => ({ prospects: srcH.value.prospects - allocated('prospects'), leads: srcH.value.leads - allocated('leads'), investors: srcH.value.investors - Object.entries(plan.value.codes).filter(([, u]) => u).reduce((s, [c]) => s + codeCount(c), 0) }))
function check() {
  err.value = ''
  if (hasOver.value) return (err.value = overError('prospects') || overError('leads'))
  try { validateTransfer(src.value, cleanPlan()) } catch (e) { err.value = e.message }
  return err.value
}
function cleanPlan() {
  const rows = (k) => plan.value[k].filter((a) => a.userId && Number(a.count) > 0).map((a) => ({ userId: a.userId, count: Number(a.count) }))
  return { prospects: rows('prospects'), leads: rows('leads'), codes: Object.fromEntries(Object.entries(plan.value.codes).filter(([, u]) => u)) }
}
function review() { if (!check()) step.value = 'review' }
function confirm() {
  try {
    const s = executeTransfer(src.value, cleanPlan()) // re-checks 1500 at confirm (D06 §7.9)
    toast.success(`Transfer completed for ${Object.keys(s).length} specialist(s)`)
    tOpen.value = false
  } catch (e) { err.value = e.message; step.value = 'allocate' }
}
</script>
<template>
  <SettingsShell title="IS Mapping" description="View investment specialist holdings and transfer ownership when required.">
    <div class="grid grid-cols-3 gap-4">
      <div v-for="k in kpis" :key="k.label" class="rounded-7 border bg-surface-base p-5">
        <div class="text-sm text-ink-gray-6">{{ k.label }}</div>
        <div class="mt-2 text-4xl font-semibold text-ink-gray-9 tabular">{{ k.value.toLocaleString('en-IN') }}</div>
        <div class="mt-1 h-4 text-xs text-ink-gray-5">{{ k.sub }}</div>
      </div>
    </div>

    <section class="mt-6 rounded-7 border bg-surface-base">
      <div class="flex items-center justify-between border-b px-5 py-4">
        <h2 class="text-lg font-semibold text-ink-gray-9">IS Holdings</h2>
        <div class="flex items-center gap-2">
          <QuickSelect v-model="status" label="All Status" :options="['Active', 'Inactive']" />
          <div class="w-60"><TextInput v-model="q" placeholder="Search specialist..." /></div>
        </div>
      </div>
      <table class="w-full text-base">
        <thead class="text-sm text-ink-gray-5"><tr class="border-b">
          <th class="px-5 py-2.5 text-left font-normal">Investment Specialist</th>
          <th class="px-3 text-left font-normal">Investors</th><th class="px-3 text-left font-normal">Data Codes</th><th class="px-3 text-left font-normal">Status</th><th class="px-3 text-left font-normal">Last Updated</th><th class="px-5" />
        </tr></thead>
        <tbody>
          <tr v-for="r in pageRows" :key="r.u.id" class="border-b last:border-0">
            <td class="px-5 py-3"><div class="font-medium text-ink-gray-9">{{ r.u.name }}</div><div class="text-sm text-ink-gray-5">{{ r.u.mhf_id }}</div></td>
            <td class="px-3 tabular">{{ r.h.investors || '-' }}</td>
            <td class="px-3"><span class="rounded-4 bg-surface-gray-2 px-2 py-0.5 text-sm text-ink-gray-7">{{ r.u.dataCodes?.length ? `${r.u.dataCodes.length} code${r.u.dataCodes.length > 1 ? 's' : ''}` : '-' }}</span></td>
            <td class="px-3"><Badge :theme="r.u.active ? 'green' : 'gray'" :label="r.u.active ? 'Active' : 'Inactive'"><template #prefix><span class="size-1.5 rounded-full" :class="r.u.active ? 'bg-surface-green-7' : 'bg-surface-gray-6'" /></template></Badge></td>
            <td class="px-3 text-ink-gray-6">{{ r.last ? timeAgo(r.last) : '-' }}</td>
            <td class="px-5 text-right"><button v-if="canTransfer(r)" class="text-ink-blue-link hover:underline" @click="openTransfer(r.u)">Transfer</button></td>
          </tr>
          <tr v-if="!pageRows.length"><td colspan="6" class="px-5 py-10 text-center text-sm text-ink-gray-5">No specialists match.</td></tr>
        </tbody>
      </table>
      <div class="flex items-center justify-between border-t px-5 py-3 text-sm text-ink-gray-6">
        <div class="flex gap-1"><button v-for="s in [5, 20, 50]" :key="s" class="rounded-4 border px-2.5 py-1" :class="pageSize === s ? 'border-outline-blue-5 text-ink-blue-7' : ''" @click="pageSize = s">{{ s }}</button></div>
        <span>Showing {{ filtered.length ? (page - 1) * pageSize + 1 : 0 }}–{{ Math.min(page * pageSize, filtered.length) }} of {{ filtered.length }}</span>
        <div class="flex items-center gap-2"><span>Page {{ page }} of {{ pages }}</span><Button size="sm" label="Prev" :disabled="page === 1" @click="page--" /><Button size="sm" label="Next" :disabled="page === pages" @click="page++" /></div>
      </div>
    </section>

    <section class="mt-6 rounded-7 border bg-surface-base">
      <div class="flex items-center justify-between border-b px-5 py-4">
        <h2 class="text-lg font-semibold text-ink-gray-9">Recent Transfers</h2>
        <Button label="View all history" @click="historyOpen = true" />
      </div>
      <table class="w-full text-base">
        <thead class="text-sm text-ink-gray-5"><tr class="border-b">
          <th v-for="h in ['Date & Time', 'From', 'To', 'Investors', 'Data Codes', 'Moved by']" :key="h" class="px-5 py-2.5 text-left font-normal">{{ h }}</th>
        </tr></thead>
        <tbody>
          <tr v-for="r in transferRows.slice(0, 5)" :key="r.key" class="border-b last:border-0">
            <td class="px-5 py-3 text-ink-gray-6">{{ fmtDateTime(r.at) }}</td>
            <td class="px-5"><div class="font-medium">{{ uname(r.from) }}</div><div class="text-sm text-ink-gray-5">{{ umhf(r.from) }}</div></td>
            <td class="px-5"><div class="font-medium">{{ uname(r.to) }}</div><div class="text-sm text-ink-gray-5">{{ umhf(r.to) }}</div></td>
            <td class="px-5 tabular">{{ r.investors || '-' }}</td>
            <td class="px-5">{{ r.codes.join(', ') || '-' }}</td><td class="px-5">{{ db.userById(r.movedBy)?.role === 'Admin' ? 'Admin' : uname(r.movedBy) }}</td>
          </tr>
          <tr v-if="!transferRows.length"><td colspan="6" class="px-5 py-10 text-center text-sm text-ink-gray-5">No transfers yet.</td></tr>
        </tbody>
      </table>
    </section>

    <!-- All Reassignment History (Fig 24070) -->
    <Dialog v-model:open="historyOpen" title="All Reassignment History" size="5xl">
      <p class="-mt-2 mb-3 text-sm text-ink-gray-6">Every specialist-to-specialist transfer, in full. Permanent and not editable.</p>
      <div class="mb-3 w-72"><TextInput v-model="historyQ" placeholder="Search specialist..." /></div>
      <div class="max-h-[60vh] overflow-auto">
        <table class="w-full text-base">
          <thead class="sticky top-0 bg-surface-gray-2 text-sm text-ink-gray-6"><tr>
            <th v-for="h in ['Date & Time', 'From', 'To', 'Investors', 'Data Codes', 'Reassign by']" :key="h" class="px-3 py-2 text-left font-normal">{{ h }}</th>
          </tr></thead>
          <tbody><tr v-for="r in historyRows" :key="r.key" class="border-b">
            <td class="px-3 py-2">{{ fmtDateTime(r.at) }}</td><td class="px-3">{{ uname(r.from) }} <span class="text-xs text-ink-gray-5">{{ umhf(r.from) }}</span></td>
            <td class="px-3">{{ uname(r.to) }} <span class="text-xs text-ink-gray-5">{{ umhf(r.to) }}</span></td>
            <td class="px-3 tabular">{{ r.investors || '-' }}</td>
            <td class="px-3">{{ r.codes.join(', ') || '-' }}</td><td class="px-3">{{ uname(r.movedBy) }}</td>
          </tr></tbody>
        </table>
      </div>
    </Dialog>

    <!-- Transfer Specialist Data (Fig 24446) + Review Transfer (Fig 24602) -->
    <Dialog v-model:open="tOpen" size="3xl" :title="step === 'allocate' ? 'Transfer Specialist Data' : 'Review Transfer'">
      <template v-if="step === 'allocate'">
        <p class="-mt-2 mb-4 text-sm text-ink-gray-6">Select destination and decide what should move.</p>
        <div class="rounded-6 border bg-surface-gray-1 p-4">
          <div class="font-medium text-ink-gray-9">{{ uname(src) }} ({{ umhf(src) }})</div>
          <div class="text-sm text-ink-gray-6">Source Investment Specialist — everything below moves out of this book</div>
          <div class="mt-3 grid grid-cols-2 gap-3">
            <div v-for="[l, v] in [['Investors', srcH.investors], ['Data Codes', srcH.codes.length]]" :key="l" class="rounded-4 bg-surface-base p-2 text-center">
              <div class="text-2xl font-semibold tabular">{{ v }}</div><div class="text-xs text-ink-gray-5">{{ l }}</div>
            </div>
          </div>
        </div>
        <div class="mt-5">
          <div class="text-sm font-semibold uppercase tracking-wide text-ink-gray-8">Investors — Data Codes</div>
          <p class="mb-2 text-xs text-ink-gray-5">Allocate each source data code to the specialist who should own it in full.</p>
          <div v-if="!srcH.codes.length" class="text-sm text-ink-gray-5">No Data Codes with investors in this book.</div>
          <div v-for="code in srcH.codes" :key="code" class="mb-1.5 flex items-center gap-3 rounded-6 border p-3">
            <div class="flex-1"><div class="font-medium tabular">{{ code }}</div><div class="text-xs text-ink-gray-5">{{ codeCount(code) }} investors</div></div>
            <select v-model="plan.codes[code]" class="w-64 rounded-4 border-outline-gray-2 py-1.5 text-sm"><option value="">Keep with source</option><option v-for="r in receivers" :key="r.value" :value="r.value">{{ r.label }}</option></select>
            <span class="text-xs text-ink-gray-5">Full code allocation</span>
          </div>
        </div>
        <div class="mt-5 rounded-6 border border-outline-blue-2 bg-surface-blue-1 p-3 text-sm">
          <div class="mb-1 font-medium text-ink-blue-8">Impact preview — every specialist touched by this transfer</div>
          <div class="text-ink-gray-8">{{ uname(src) }} (source) · Investors {{ srcAfter.investors }}</div>
          <div v-for="r in impact" :key="r.u" class="text-ink-gray-8" >
            {{ uname(r.u) }}({{ umhf(r.u) }}) · Investors {{ r.h.investors }}<b v-if="r.d.investors" class="text-ink-green-7"> +{{ r.d.investors }}</b>
          </div>
        </div>
      </template>
      <template v-else>
        <p class="-mt-2 mb-4 text-sm text-ink-gray-6">Check the final allocation before confirming.</p>
        <div class="space-y-2">
          <div class="rounded-6 border p-3"><div class="font-medium">{{ uname(src) }} (source)</div><div class="text-sm text-ink-gray-6">Investors {{ srcAfter.investors }}</div></div>
          <div v-for="r in impact" :key="r.u" class="rounded-6 border p-3">
            <div class="font-medium">{{ uname(r.u) }}</div>
            <div class="text-sm text-ink-gray-6">Investors {{ r.h.investors }} <b v-if="r.d.investors" class="text-ink-green-7">+{{ r.d.investors }}</b></div>
          </div>
        </div>
        <p class="mt-4 rounded-6 bg-surface-blue-1 p-3 text-sm text-ink-blue-8">After confirmation, holdings and the audit history will update together. The families of the moved investors follow in Prospect DMS through the family log (F2). There is no undo; a reverse transfer is needed.</p>
      </template>
      <p v-if="err" class="mt-3 rounded-4 bg-surface-red-2 px-3 py-2 text-sm text-ink-red-7">{{ err }}</p>
      <template #actions>
        <div class="flex justify-end gap-2">
          <template v-if="step === 'allocate'"><Button label="Cancel" @click="tOpen = false" /><Button variant="solid" label="Review Transfer" :disabled="!anyAllocation" @click="review" /></template>
          <template v-else><Button label="Back" @click="step = 'allocate'" /><Button variant="solid" theme="blue" label="Confirm Transfer" @click="confirm" /></template>
        </div>
      </template>
    </Dialog>
  </SettingsShell>
</template>
