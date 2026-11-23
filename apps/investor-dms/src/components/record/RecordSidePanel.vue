<script setup>
// Right-hand panel (D03 §2.6; GEN-012; Fig 5234 / 13881). Read-only; values change only through the Data tab.
// Quick actions: call (Phone Numbers list, Fig 5635), email, WhatsApp (greyed when nothing can be sent),
// profile (Transaction Platform, Investor only - OPEN_QUESTIONS A1/D5).
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Popover, Tooltip, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { CUSTOMER_TYPE_BY_PAN } from '@/data/masters'
import { phoneBook, startCall, windowOpen } from '@/services/calls'
import { clientName, fullName, remDays } from '@/services/lifecycle'
import { isSupervisor, isAdmin } from '@/services/access'
import { fmtPanelDate, now } from '@/utils/format'

const props = defineProps({ client: Object, readonly: Boolean })
const emit = defineEmits(['open-tab'])
const db = useDb(); const router = useRouter()
const c = computed(() => props.client)
const p = computed(() => c.value.members[0])
const openSec = ref({ primary: true, group: true, owner: true })
const customerType = computed(() => { const pan = p.value.pan || p.value.extra?.pan; return pan && pan.length >= 4 ? CUSTOMER_TYPE_BY_PAN[pan[3].toUpperCase()] || '-' : '-' })
const mobiles = computed(() => p.value.contacts.filter((x) => x.mobile && !x.pendingAdd))
const nextEvent = computed(() => db.events.filter((e) => e.clientId === c.value.id && !e.cancelled && e.start > now()).sort((a, b) => a.start - b.start)[0])
const canCall = computed(() => !props.readonly && ['Pool', 'Prospect', 'Lead', 'Investor'].includes(c.value.stage))
const book = computed(() => phoneBook(c.value))
const showPool = computed(() => c.value.stage === 'Pool')
function dial(mobile, name, close) {
  close?.()
  try { startCall(c.value, mobile, name) } catch (e) { toast.error(e.message) }
}
const allNumbers = computed(() => book.value.flatMap((b) => b.numbers.map((n) => ({ n, name: b.name }))))
function callClick(open) { if (allNumbers.value.length === 1) dial(allNumbers.value[0].n, allNumbers.value[0].name) } // single number dials directly (D04 §2.1)
const tagClass = (t) => (t === 'PRIMARY' ? 'border-outline-blue-3 bg-surface-blue-1 text-ink-blue-7' : 'border-outline-gray-2 bg-surface-gray-1 text-ink-gray-6')
</script>
<template>
  <aside class="dms-scroll hidden w-[310px] shrink-0 overflow-y-auto border-l bg-surface-base md:block">
    <div class="flex h-[46px] items-center border-b px-5 text-base font-medium text-ink-gray-8 tabular" title="Family ID" data-testid="panel-family-id">{{ c.familyId || c.cid || c.id }}</div>
    <div class="flex gap-3 border-b px-5 py-4">
      <div class="flex size-12 shrink-0 items-center justify-center rounded-6 bg-surface-gray-3 text-xl text-ink-gray-6">{{ (p.first_name || '?')[0] }}</div>
      <div class="min-w-0">
        <div class="truncate text-xl text-ink-gray-9">{{ clientName(c) }}</div>
        <div class="mt-2 flex gap-1.5">
          <Popover v-if="canCall && allNumbers.length > 1" align="start">
            <template #trigger><button class="flex size-8 items-center justify-center rounded-4 bg-surface-gray-2 hover:bg-surface-gray-3" title="Call"><span class="lucide-phone size-4" /></button></template>
            <template #default="{ close }">
              <div class="w-72">
                <div class="border-b px-2 pb-2 text-base font-semibold text-ink-gray-9">Phone Numbers</div>
                <div v-for="b in book" :key="b.key" class="border-b px-2 py-2 last:border-0">
                  <div class="mb-1 flex items-center justify-between"><span class="text-sm font-medium">{{ b.name }}</span><span class="rounded-4 border px-1.5 text-2xs font-medium" :class="tagClass(b.tag)">{{ b.tag }}</span></div>
                  <button v-for="n in b.numbers" :key="n" class="flex w-full items-center gap-2 rounded-4 px-1 py-1 text-sm hover:bg-surface-gray-2" @click="dial(n, b.name, close)"><span class="lucide-phone size-3.5 text-ink-gray-6" />{{ showPool ? n.slice(0, 5) + 'XXXXX' : n }}</button>
                </div>
              </div>
            </template>
          </Popover>
          <button v-else class="flex size-8 items-center justify-center rounded-4 bg-surface-gray-2 hover:bg-surface-gray-3 disabled:opacity-40" :disabled="!canCall" title="Call" @click="callClick"><span class="lucide-phone size-4" /></button>
          <Tooltip :text="c.stage === 'Pool' ? 'Pool records can only be called (POOL-006)' : 'Email'">
            <button class="flex size-8 items-center justify-center rounded-4 bg-surface-gray-2 hover:bg-surface-gray-3" @click="emit('open-tab', 'emails')"><span class="lucide-mail size-4" /></button>
          </Tooltip>
          <Tooltip :text="windowOpen(c) ? 'WhatsApp' : 'WhatsApp – messaging opens for 12 hours after an eligible call'">
            <button class="flex size-8 items-center justify-center rounded-4 bg-surface-gray-2 hover:bg-surface-gray-3" @click="emit('open-tab', 'whatsapp')"><span class="icon-whatsapp size-4" /></button>
          </Tooltip>
          <Tooltip :text="c.stage === 'Investor' ? 'Portfolio – opens this investor on the Transaction Platform' : 'Portfolio is available only for Investors'">
            <button aria-label="Portfolio" class="flex size-8 items-center justify-center rounded-4 bg-surface-gray-2 hover:bg-surface-gray-3 disabled:opacity-40" :disabled="c.stage !== 'Investor'" @click="router.push(`/portfolio/${c.id}`)"><span class="lucide-briefcase size-4" /></button>
          </Tooltip>
        </div>
      </div>
    </div>
    <!-- Primary Details -->
    <div class="px-5 py-3">
      <button class="flex w-full items-center gap-1.5 py-1 text-lg text-ink-gray-8" @click="openSec.primary = !openSec.primary"><span :class="openSec.primary ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-4" />Primary Details</button>
      <dl v-if="openSec.primary" class="mt-1 grid grid-cols-[110px_1fr] gap-y-2 pl-5 text-sm">
        <dt class="text-ink-gray-6">Gender</dt><dd class="text-right text-ink-gray-7">{{ p.gender || '-' }}</dd>
        <dt class="text-ink-gray-6">Mobile No.</dt>
        <dd class="space-y-1 text-right">
          <button v-for="m in mobiles" :key="m.id" class="ml-auto flex items-center gap-1 text-ink-gray-7 hover:text-ink-gray-9 disabled:cursor-default" :disabled="!canCall" @click="dial(m.mobile, fullName(p))">
            <span class="lucide-phone size-3" />{{ showPool ? m.mobile.slice(0, 5) + 'XXXXX' : m.mobile }}
          </button>
        </dd>
        <dt class="text-ink-gray-6">Customer Type</dt><dd class="text-right text-ink-gray-7">{{ customerType }}</dd>
        <dt class="text-ink-gray-6">Language</dt><dd class="text-right text-ink-gray-7">{{ p.language || '-' }}</dd>
        <template v-if="!showPool">
          <dt class="text-ink-gray-6">Call Status</dt><dd class="text-right text-ink-gray-7">{{ c.callStatus || '-' }}</dd>
          <dt class="text-ink-gray-6">Last Called</dt><dd class="text-right text-ink-gray-7">{{ fmtPanelDate(c.lastCallAt) }}</dd>
          <dt class="text-ink-gray-6">Event</dt><dd class="text-right text-ink-gray-7">{{ nextEvent ? fmtPanelDate(nextEvent.start) : '-' }}</dd>
        </template>
        <template v-if="c.stage === 'Investor' || c.stage === 'Unassigned'">
          <dt class="text-ink-gray-6">Inv. Status</dt><dd class="text-right text-ink-gray-7">{{ c.invStatus || '-' }}</dd>
          <dt class="text-ink-gray-6">Last Inv. Date</dt><dd class="text-right text-ink-gray-7">{{ fmtPanelDate(c.lastInvDate) }}</dd>
        </template>
      </dl>
    </div>
    <!-- Group -->
    <div class="border-t px-5 py-3">
      <button class="flex w-full items-center gap-1.5 py-1 text-lg text-ink-gray-8" @click="openSec.group = !openSec.group"><span :class="openSec.group ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-4" />Group</button>
      <div v-if="openSec.group" class="mt-1 space-y-3 pl-5 text-sm">
        <dl v-for="m in c.members.slice(1)" :key="m.key" class="grid grid-cols-[110px_1fr] gap-y-1.5">
          <dt class="text-ink-gray-6">Name</dt><dd class="text-right text-ink-gray-8">{{ fullName(m) }}</dd>
          <dt class="text-ink-gray-6">RWP</dt><dd class="text-right text-ink-gray-7">{{ m.relationship }}</dd>
          <dt class="text-ink-gray-6">Mobile No.</dt>
          <dd class="space-y-1 text-right"><button v-for="x in m.contacts.filter((x) => !x.pendingAdd)" :key="x.id" class="ml-auto flex items-center gap-1 text-ink-gray-7 disabled:cursor-default" :disabled="!canCall" @click="dial(x.mobile, fullName(m))"><span class="lucide-phone size-3" />{{ showPool ? x.mobile.slice(0, 5) + 'XXXXX' : x.mobile }}</button></dd>
        </dl>
        <p v-if="c.members.length < 2" class="text-ink-gray-5">No group members.</p>
      </div>
    </div>
    <!-- Ownership (supervisor-only, GEN-006): Assigned To is in the record header; Data Code and Source IS stay here -->
    <div v-if="isSupervisor() && c.stage === 'Investor'" class="border-t px-5 py-3">
      <button class="flex w-full items-center gap-1.5 py-1 text-lg text-ink-gray-8" @click="openSec.owner = !openSec.owner"><span :class="openSec.owner ? 'lucide-chevron-down' : 'lucide-chevron-right'" class="size-4" />Ownership</button>
      <dl v-if="openSec.owner" class="mt-1 grid grid-cols-[110px_1fr] gap-y-2 pl-5 text-sm">
        <dt class="text-ink-gray-6">Data Code</dt><dd class="text-right text-ink-gray-7">{{ c.dataCode || '-' }}</dd>
        <dt class="text-ink-gray-6">Source IS</dt><dd class="text-right text-ink-gray-7">{{ db.userById(c.sourceIs)?.name || '-' }}<div v-if="db.userById(c.sourceIs)" class="text-xs tabular text-ink-gray-5">{{ db.userById(c.sourceIs).mhf_id }}</div></dd>
      </dl>
    </div>
  </aside>
</template>
