<script setup>
// One form, three uses (same Figma layout):
//  mode 'prospect'  - Create Prospect (Fig 12052; PL-001; X02 CREATE_PROSPECT_FORM) -> Send for Approval
//  mode 'member'    - Add Group Member (Fig 30148; D03 §20) -> Send for Approval (adds Relationship with Primary*)
//  review=request   - approver view (Fig 12221 / 30305): approval flow footer + Reject / Approve; fields editable.
import { ref, computed, watch } from 'vue'
import { Dialog, Button, FormControl, Checkbox, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { GENDERS, CONTACT_TYPES, ADDRESS_TYPES, RELATIONSHIPS } from '@/data/masters'
import { submitRequest, approve, reject, isMyTurn } from '@/services/approvals'
import { assertRoom, plCount } from '@/services/lifecycle'
import { visibleUserIds } from '@/services/access'
import { newFamilyId } from '@/services/family'
import { assertCreatable } from '@/services/numberCheck'

const props = defineProps({ mode: { type: String, default: 'prospect' }, clientId: String, request: Object })
const open = defineModel('open', { default: false })
const emit = defineEmits(['done'])
const db = useDb()
const uid = () => 'r' + Math.random().toString(36).slice(2, 8)

const blank = () => ({
  first_name: '', middle_name: '', last_name: '', gender: '', date_of_birth: '', pan: '', relationship: props.mode === 'member' ? '' : 'Primary',
  contacts: [{ id: uid(), type: 'Residence', mobile: '', is_whatsapp: false }], emails: [{ id: uid(), email: '' }],
  addresses: [{ id: uid(), type: 'Present', address: '', city: '', pin: '', state: '', country: 'India' }], product: [], extra: {},
  assignedTo: db.sessionUserId,
})
const f = ref(blank())
const errors = ref({})
watch(open, (v) => {
  if (!v) return
  errors.value = {}
  if (props.request) {
    const src = props.mode === 'member' ? props.request.payload.member : props.request.payload.client.members[0]
    f.value = { ...JSON.parse(JSON.stringify(src)), assignedTo: props.request.payload.client?.assignedTo }
  } else f.value = blank()
})
const reviewing = computed(() => !!props.request)
const canDecide = computed(() => props.request && props.request.status === 'Pending' && isMyTurn(props.request))
// VP and President create Prospects for their own (personal) book only (product owner, 06 Nov 2026)
const personalOnly = computed(() => ['VP', 'President'].includes(db.me?.role))
const assignees = computed(() => db.users.filter((u) => u.active && u.role !== 'Admin' && (personalOnly.value ? u.id === db.sessionUserId : db.me.role === 'Admin' || visibleUserIds().includes(u.id))).map((u) => ({ label: `${u.name} (${u.role})`, value: u.id })))
const title = computed(() => (props.mode === 'member' ? 'Add Group Member' : 'Create Prospect'))

function validate() {
  const e = {}
  const v = f.value
  if (!v.first_name.trim()) e.first_name = 'First Name is mandatory.'
  if (props.mode === 'member' && !v.relationship) e.relationship = 'Relationship with Primary is mandatory.'
  if (v.date_of_birth && new Date(v.date_of_birth) > new Date()) e.date_of_birth = 'Date of Birth cannot be in the future.'
  if (v.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.pan.toUpperCase())) e.pan = 'PAN format must be AAAAA9999A.'
  const mobiles = v.contacts.filter((c) => c.mobile)
  if (!mobiles.length) e.contacts = 'At least one mobile number is required.'
  if (mobiles.some((c) => !/^\d{10}$/.test(c.mobile))) e.contacts = 'Mobile numbers must be 10 digits.'
  if (v.emails.some((x) => x.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email))) e.emails = 'Enter a valid email address.'
  if (v.addresses.some((a) => a.pin && !/^\d{6}$/.test(a.pin))) e.addresses = 'PIN must be 6 digits.'
  if (props.mode === 'prospect' && !v.assignedTo) e.assignedTo = 'Assigned To is mandatory.'
  errors.value = e
  return !Object.keys(e).length
}
function person() {
  const v = JSON.parse(JSON.stringify(f.value))
  v.pan = v.pan?.toUpperCase() || ''
  v.contacts = v.contacts.filter((c) => c.mobile); v.emails = v.emails.filter((x) => x.email); v.addresses = v.addresses.filter((a) => a.address || a.city)
  delete v.assignedTo
  return { ...v, key: 'p', language: v.language || '' }
}
const checking = ref(false)
async function send() {
  if (!validate()) return
  try {
    // one family, one advisor: a number or PAN of an existing client family can't be entered again (split prompt §6.7.3, F3)
    checking.value = true
    try { await assertCreatable([person()], props.mode === 'member' ? props.clientId : null) } finally { checking.value = false }
    if (props.mode === 'prospect') {
      assertRoom(f.value.assignedTo) // 1500 checked at submission (D02 §4.11)
      const id = `CRM-LEAD-2026-${String(++db.seq).padStart(5, '0')}`
      const client = { id, familyId: newFamilyId(), stage: 'Prospect', members: [person()], assignedTo: f.value.assignedTo, poolState: null, batchOf: null, takeoverDate: null, lastCallAt: null, callStatus: null, counters: { notConnected: 0, notInterested: 0, releases: 0, poolCalls: 0 }, source: 'Manual', importDate: Date.now(), ownershipHistory: [], documents: [], createdAt: Date.now(), totalCalls: 0 }
      const req = submitRequest({ category: 'New Prospect', payload: { client } })
      toast.success(req.status === 'Approved' ? 'Prospect created' : 'Sent for approval. The Prospect is created after final approval.')
    } else {
      const c = db.clientById(props.clientId)
      // No limit on group members (product owner, 06 Nov 2026). The 1500 limit counts groups (records).
      const member = { ...person(), key: 'new', relationship: f.value.relationship }
      const req = submitRequest({ clientId: c.id, category: 'Group Member', payload: { op: 'add', member } })
      toast.success(req.status === 'Approved' ? 'Group member added' : 'Group member sent for approval')
    }
    open.value = false; emit('done')
  } catch (e) { toast.error(e.message) }
}
function doApprove() {
  if (!validate()) return
  try {
    const payload = props.mode === 'member' ? { ...props.request.payload, member: { ...person(), relationship: f.value.relationship } } : { client: { ...props.request.payload.client, members: [person()], assignedTo: f.value.assignedTo } }
    approve(props.request, null, payload)
    toast.success(props.request.status === 'Approved' ? 'Approved – change applied' : 'Approved – sent to the next level')
    open.value = false; emit('done')
  } catch (e) { toast.error(e.message) }
}
function doReject() { try { reject(props.request); toast.success('Request rejected'); open.value = false; emit('done') } catch (e) { toast.error(e.message) } }
const stateCls = { Approved: 'bg-surface-green-2 text-ink-green-7 border-outline-green-3', Pending: 'bg-surface-amber-2 text-ink-amber-7 border-outline-amber-3', Waiting: 'bg-surface-gray-2 text-ink-gray-6', Skipped: 'bg-surface-gray-2 text-ink-gray-5', Rejected: 'bg-surface-red-2 text-ink-red-7' }
const addRow = (k, row, max) => { if (!max || f.value[k].length < max) f.value[k].push({ id: uid(), ...row }) }
</script>
<template>
  <Dialog v-model:open="open" :title="title" size="3xl">
    <div class="space-y-4">
      <div class="grid grid-cols-3 gap-4">
        <FormControl v-model="f.first_name" label="First Name" required placeholder="First Name" :error="errors.first_name" />
        <FormControl v-model="f.middle_name" label="Middle Name" placeholder="Middle Name" />
        <FormControl v-model="f.last_name" label="Last Name" placeholder="Last Name" />
        <FormControl v-model="f.gender" label="Gender" type="select" :options="GENDERS" placeholder="Gender" />
        <FormControl v-model="f.date_of_birth" label="Date of Birth" type="date" :error="errors.date_of_birth" />
        <FormControl v-if="mode === 'prospect'" v-model="f.pan" label="PAN" placeholder="PAN NUMBER" :error="errors.pan" />
        <FormControl v-else v-model="f.relationship" label="Relationship with Primary" required type="select" :options="RELATIONSHIPS" :error="errors.relationship" />
      </div>
      <div class="space-y-3 rounded-6 bg-surface-gray-1 p-3">
        <section class="rounded-6 border bg-surface-base p-3">
          <div class="mb-2 text-base font-medium">Contact</div>
          <table class="w-full text-sm"><thead class="bg-surface-gray-2 text-ink-gray-6"><tr><th class="px-2 py-1.5 text-left font-normal">Contact Type</th><th class="px-2 text-left font-normal">Mobile No.</th><th class="px-2 text-center font-normal">Is WhatsApp Number</th><th /></tr></thead>
            <tbody><tr v-for="(r, i) in f.contacts" :key="r.id" class="border-b">
              <td class="p-1"><select v-model="r.type" class="w-full rounded-4 border-outline-gray-2 py-1 text-sm"><option v-for="o in CONTACT_TYPES" :key="o">{{ o }}</option></select></td>
              <td class="p-1"><input v-model="r.mobile" maxlength="10" placeholder="10-digit mobile" class="w-full rounded-4 border-outline-gray-2 py-1 text-sm" /></td>
              <td class="p-1 text-center"><Checkbox v-model="r.is_whatsapp" /></td>
              <td class="w-8"><button v-if="f.contacts.length > 1" class="lucide-x size-3.5 text-ink-gray-5" @click="f.contacts.splice(i, 1)" /></td>
            </tr></tbody></table>
          <button class="mt-2 text-sm text-ink-gray-7" :disabled="f.contacts.length >= 10" @click="addRow('contacts', { type: 'Residence', mobile: '', is_whatsapp: false }, 10)">+ Add Row</button>
          <p v-if="errors.contacts" class="mt-1 text-sm text-ink-red-7">{{ errors.contacts }}</p>
        </section>
        <section class="rounded-6 border bg-surface-base p-3">
          <div class="mb-2 text-base font-medium">Email</div>
          <div v-for="(r, i) in f.emails" :key="r.id" class="mb-1 flex gap-2"><input v-model="r.email" placeholder="Email Address" class="flex-1 rounded-4 border-outline-gray-2 py-1 text-sm" /><button v-if="f.emails.length > 1" class="lucide-x size-3.5 text-ink-gray-5" @click="f.emails.splice(i, 1)" /></div>
          <button class="mt-1 text-sm text-ink-gray-7" @click="addRow('emails', { email: '' })">+ Add Row</button>
          <p v-if="errors.emails" class="mt-1 text-sm text-ink-red-7">{{ errors.emails }}</p>
        </section>
        <section class="rounded-6 border bg-surface-base p-3">
          <div class="mb-2 text-base font-medium">Address</div>
          <div v-for="(r, i) in f.addresses" :key="r.id" class="mb-1 grid grid-cols-[110px_1fr_100px_70px_100px_80px_20px] gap-1.5">
            <select v-model="r.type" class="rounded-4 border-outline-gray-2 py-1 text-sm"><option v-for="o in ADDRESS_TYPES" :key="o">{{ o }}</option></select>
            <input v-model="r.address" placeholder="Address" class="rounded-4 border-outline-gray-2 py-1 text-sm" />
            <input v-model="r.city" placeholder="City" class="rounded-4 border-outline-gray-2 py-1 text-sm" />
            <input v-model="r.pin" placeholder="PIN" maxlength="6" class="rounded-4 border-outline-gray-2 py-1 text-sm" />
            <input v-model="r.state" placeholder="State" class="rounded-4 border-outline-gray-2 py-1 text-sm" />
            <input v-model="r.country" placeholder="Country" class="rounded-4 border-outline-gray-2 py-1 text-sm" />
            <button v-if="f.addresses.length > 1" class="lucide-x size-3.5 text-ink-gray-5" @click="f.addresses.splice(i, 1)" />
          </div>
          <button class="mt-1 text-sm text-ink-gray-7" @click="addRow('addresses', { type: 'Present', address: '', city: '', pin: '', state: '', country: 'India' }, 10)">+ Add Row</button>
          <p v-if="errors.addresses" class="mt-1 text-sm text-ink-red-7">{{ errors.addresses }}</p>
        </section>
        <div v-if="mode === 'prospect'" class="ml-auto w-72">
          <FormControl v-model="f.assignedTo" label="Assigned to" required type="select" :options="assignees" :error="errors.assignedTo" />
          <p class="mt-1 text-xs text-ink-gray-5">Current Prospect + Lead count: {{ plCount(f.assignedTo) }} / 1500</p>
        </div>
      </div>
    </div>
    <template #actions>
      <div class="flex items-center gap-3">
        <div v-if="reviewing" class="flex flex-1 flex-wrap items-center gap-1.5 text-xs">
          <span class="font-medium uppercase tracking-wide text-ink-gray-5">Approval flow:</span>
          <template v-for="(s, i) in request.chain" :key="i">
            <span v-if="i" class="lucide-chevron-right size-3 text-ink-gray-4" />
            <span class="rounded-full border px-2 py-0.5" :class="stateCls[s.state]">{{ db.userById(s.userId)?.name }} · {{ s.state === 'Approved' ? 'DONE' : s.state }}</span>
          </template>
        </div>
        <div class="ml-auto flex gap-2">
          <template v-if="reviewing">
            <template v-if="canDecide">
              <Button theme="red" variant="subtle" label="Reject" @click="doReject" />
              <Button variant="solid" label="Approve" @click="doApprove" />
            </template>
            <span v-else class="text-sm text-ink-gray-5">{{ request.status === 'Pending' ? 'Waiting for another approver' : request.status }}</span>
          </template>
          <Button v-else variant="solid" label="Send for Approval" :loading="checking" @click="send" />
        </div>
      </div>
    </template>
  </Dialog>
</template>
