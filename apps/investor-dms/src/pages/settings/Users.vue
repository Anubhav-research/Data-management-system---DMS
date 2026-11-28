<script setup>
// User Access (Admin only; D06 §9; X02 USER; Fig 31976 / 32373 - legacy shared user form, DMS is one tab
// of "Screen Access Privileges"). Role decides record visibility; switches decide per-person abilities (§9.4).
// A user cannot change their own access (§9.2). Users are not created or deleted in DMS: they come from the
// Money Honey user master. Admin edits an existing person's details and Screen Access Privileges here.
import { ref, computed } from 'vue'
import { Dialog, Button, FormControl, Switch, TabButtons, TextInput, Badge, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { settingsFilter } from '@/composables/settings'
import { ROLES, USER_SWITCHES } from '@/data/masters'
import SettingsShell from '@/components/settings/SettingsShell.vue'

const db = useDb()
const q = ref('')
// opened from the Dashboard: only the people behind the number clicked, until the filter is removed
const clearDrill = () => { settingsFilter.value = null }
const users = computed(() => db.users.filter((u) => (!settingsFilter.value || settingsFilter.value.ids.includes(u.id)) && (!q.value || `${u.name} ${u.mhf_id} ${u.role}`.toLowerCase().includes(q.value.toLowerCase()))))
const uname = (id) => db.userById(id)?.name || '-'

const open = ref(false)
const tab = ref('details')
const platform = ref('dms')
const editingId = ref(null)
const f = ref(null)
const err = ref('')
const isSelf = computed(() => editingId.value === db.sessionUserId)
const reportsOptions = computed(() => db.users.filter((u) => u.id !== editingId.value).map((u) => ({ label: `${u.name} (${u.role})`, value: u.id })))

function edit(u) { editingId.value = u.id; f.value = JSON.parse(JSON.stringify(u)); tab.value = 'details'; platform.value = 'dms'; err.value = ''; open.value = true }
function save() {
  err.value = ''
  const v = f.value
  for (const [k, l] of [['name', 'Name'], ['role', 'Role']]) if (!String(v[k] || '').trim()) return (err.value = `${l} is mandatory.`)
  if (v.role !== 'Admin' && !v.reportsTo) return (err.value = 'Reports To is mandatory.')
  const u = db.userById(editingId.value)
  const changes = []
  for (const k of ['name', 'role', 'reportsTo', 'active', 'availability']) if (u[k] !== v[k]) changes.push(`${k}: ${u[k]} → ${v[k]}`)
  for (const k of Object.keys(v.switches)) if (u.switches[k] !== v.switches[k]) changes.push(`${k}: ${u.switches[k] ? 'on' : 'off'} → ${v.switches[k] ? 'on' : 'off'}`)
  Object.assign(u, { ...v, switches: { ...v.switches } })
  if (changes.length) db.userAudit.push({ by: db.sessionUserId, at: Date.now(), userId: u.id, change: changes.join('; ') }) // §9.9 audit
  toast.success('User updated')
  open.value = false
}
</script>
<template>
  <SettingsShell title="User Access" description="Set each person's reporting line and decide what they may do in DMS.">
    <div v-if="settingsFilter" class="mb-2 flex items-center gap-2 rounded-4 bg-surface-blue-1 px-3 py-1.5 text-sm text-ink-blue-7" data-testid="silent-filter">
      <span class="lucide-layout-dashboard size-3.5 shrink-0" />
      <span class="min-w-0 truncate">From Dashboard: <b class="font-medium">{{ settingsFilter.from }}</b> · {{ users.length }} record{{ users.length === 1 ? '' : 's' }}</span>
      <button class="ml-auto shrink-0 font-medium underline" @click="clearDrill">Remove filter</button>
    </div>
    <section class="rounded-7 border bg-surface-base">
      <div class="flex items-center justify-between border-b px-5 py-3">
        <div class="w-72"><TextInput v-model="q" placeholder="Search users..."><template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template></TextInput></div>
      </div>
      <table class="w-full text-base">
        <thead class="text-sm text-ink-gray-5"><tr class="border-b">
          <th v-for="h in ['Name', 'Money Honey ID', 'Role', 'Reports To', 'Availability', 'Status', 'DMS Access']" :key="h" class="px-4 py-2.5 text-left font-normal">{{ h }}</th>
        </tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" class="cursor-pointer border-b last:border-0 hover:bg-surface-gray-1" @click="edit(u)">
            <td class="px-4 py-2.5 font-medium text-ink-gray-9">{{ u.name }}<span v-if="u.id === db.sessionUserId" class="ml-1 text-xs text-ink-gray-5">(you)</span></td>
            <td class="px-4 tabular">{{ u.mhf_id }}</td><td class="px-4">{{ u.role }}</td>
            <td class="px-4">{{ uname(u.reportsTo) }}<div v-if="u.reportsTo" class="text-xs tabular text-ink-gray-5">{{ db.userById(u.reportsTo)?.mhf_id }}</div></td>
            <td class="px-4"><span :class="u.availability === 'Absent' ? 'text-ink-amber-7' : 'text-ink-gray-7'">{{ u.availability }}</span></td>
            <td class="px-4"><Badge :theme="u.active ? 'green' : 'gray'" :label="u.active ? 'Active' : 'Inactive'" /></td>
            <td class="px-4"><Badge :theme="u.switches?.dms ? 'blue' : 'gray'" :label="u.switches?.dms ? 'Enabled' : 'Disabled'" /></td>
          </tr>
        </tbody>
      </table>
    </section>
    <section v-if="db.userAudit.length" class="mt-6 rounded-7 border bg-surface-base p-5">
      <h2 class="mb-2 text-lg font-semibold">Change log</h2>
      <div v-for="(a, i) in [...db.userAudit].reverse().slice(0, 10)" :key="i" class="border-b py-1.5 text-sm text-ink-gray-7 last:border-0">
        <b>{{ uname(a.by) }}</b> changed <b>{{ uname(a.userId) }}</b>: {{ a.change }} <span class="text-ink-gray-5">· {{ new Date(a.at).toLocaleString('en-IN') }}</span>
      </div>
    </section>

    <Dialog v-model:open="open" title="Edit User" size="3xl">
      <div v-if="f" class="space-y-4">
        <div v-if="isSelf" class="rounded-4 bg-surface-amber-2 px-3 py-2 text-sm text-ink-amber-8">You cannot change your own access (D06 §9.2).</div>
        <TabButtons v-model="tab" :options="[{ label: 'User Details', value: 'details' }, { label: 'Screen Access Privileges', value: 'access' }]" />
        <div v-if="tab === 'details'" class="grid grid-cols-2 gap-4">
          <div class="col-span-2 flex items-center gap-3"><Switch v-model="f.active" :disabled="isSelf" /><span class="text-base">{{ f.active ? 'Active' : 'Inactive' }}</span><span class="text-xs text-ink-gray-5">Inactive specialists cannot receive records and show as Inactive in IS Mapping.</span></div>
          <FormControl :model-value="f.mhf_id" label="Money Honey ID" disabled description="Login ID, from the Money Honey user master" />
          <FormControl v-model="f.name" label="Name" required :disabled="isSelf" />
          <FormControl v-model="f.role" label="Role" type="select" required :options="ROLES" :disabled="isSelf" />
          <FormControl v-model="f.reportsTo" label="Reports To" type="select" :required="f.role !== 'Admin'" :options="reportsOptions" description="Defines the approval chain and visibility" :disabled="isSelf" />
          <FormControl v-model="f.availability" label="Availability" type="select" :options="['Present', 'Absent']" required description="Absent approvers are skipped in the approval chain (APP-007)" :disabled="isSelf" />
          <FormControl class="col-span-2" label="Data Codes" :model-value="(f.dataCodes || []).join(', ') || '-'" disabled description="Issued at profile creation, permanent (system)" />
        </div>
        <div v-else>
          <div class="mb-3 flex gap-1 border-b">
            <button v-for="p in [['dms', 'CRM (DMS)'], ['tp', 'Transaction Platform'], ['bo', 'BackOffice Platform']]" :key="p[0]" class="-mb-px border-b-2 px-3 pb-2 text-base" :class="platform === p[0] ? 'border-ink-gray-9 font-medium' : 'border-transparent text-ink-gray-6'" @click="platform = p[0]">
              {{ p[1] }}<span v-if="p[0] === 'dms' && f.switches.dms" class="ml-1 inline-block size-1.5 rounded-full bg-surface-blue-7 align-middle" />
            </button>
          </div>
          <template v-if="platform === 'dms'">
            <div class="flex items-center justify-between rounded-6 border p-4">
              <div><div class="text-lg font-semibold">DMS</div><div class="text-sm text-ink-gray-6">Grant access to DMS modules.</div></div>
              <div class="flex items-center gap-3"><span v-if="f.switches.dms" class="text-sm font-medium text-ink-green-7">Full System Active</span><Switch v-model="f.switches.dms" :disabled="isSelf" /></div>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-3" :class="!f.switches.dms && 'pointer-events-none opacity-50'">
              <div v-for="s in USER_SWITCHES" :key="s.key" class="flex items-start justify-between gap-3 rounded-6 border p-3">
                <div><div class="text-base font-medium">{{ s.label }}</div><div class="text-xs text-ink-gray-5">{{ s.desc }}</div>
                  <div class="mt-1 text-2xs font-semibold tracking-wide" :class="f.switches[s.key] ? 'text-ink-blue-7' : 'text-ink-gray-5'">{{ f.switches[s.key] ? 'ENABLED' : 'DISABLED' }}</div></div>
                <Switch v-model="f.switches[s.key]" :disabled="isSelf || !f.switches.dms" />
              </div>
            </div>
            <p class="mt-3 text-xs text-ink-gray-5">Switches take effect at the person's next action. Admin screens (Import, Unassigned Investors, IS Mapping, Junk, bulk actions) follow the role and have no switch.</p>
          </template>
          <div v-else class="rounded-6 border border-dashed p-8 text-center text-sm text-ink-gray-5">Managed by that platform – outside DMS scope.</div>
        </div>
        <p v-if="err" class="text-sm text-ink-red-7">{{ err }}</p>
      </div>
      <template #actions>
        <div class="flex justify-end gap-2"><Button label="Cancel" @click="open = false" /><Button variant="solid" label="Save" :disabled="isSelf" @click="save" /></div>
      </template>
    </Dialog>
  </SettingsShell>
</template>
