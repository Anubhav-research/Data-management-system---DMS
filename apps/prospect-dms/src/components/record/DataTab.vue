<script setup>
// Data tab (D03 §11-§22; DT-001..018; APP-001/002; X02 DATA_TAB_*; Fig 5234, 26227, 26733, 13881, 29779).
// - Person tabs: Personal + Group Member-n; ⋮ menu Add / Remove group member (one group request at a time).
// - Name / mobile / email add-edit-delete need approval -> button reads "Send for Approval"; all other fields save at once.
// - Is WhatsApp Number tick saves without approval (APP-002).
// - Prospect DMS: a member tagged INVESTOR shows name + tag only; nothing can be edited (split prompt §5.3 step 4).
import { ref, computed, watch } from 'vue'
import { Button, Dropdown, TabButtons, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { fmtDate } from '@/utils/format'
import { DATA_SECTIONS, IDENTITY_FIELDS, VERIFIED_FIELDS } from '@/data/dataTabSchema'
import { PRODUCT_INTEREST, CONTACT_TYPES, ADDRESS_TYPES, RELATIONSHIPS, LIMITS } from '@/data/masters'
import { pendingFor, pendingChangeIndex, submitRequest } from '@/services/approvals'
import { fullName, verifyMemberPan, RuleError } from '@/services/lifecycle'
import DataField from './DataField.vue'
import ApprovalBar from './ApprovalBar.vue'
import RemoveMemberWizard from './RemoveMemberWizard.vue'
import PersonFormModal from '@/components/modals/PersonFormModal.vue'

const props = defineProps({ client: Object, readonly: Boolean, since: Number })
const db = useDb()
const c = computed(() => props.client)
const personIdx = ref(0)
const side = ref('unverified')
const draft = ref(null)
const marked = ref({ contacts: new Set(), emails: new Set() })
const errors = ref({})
const openSections = ref(new Set(DATA_SECTIONS.filter((s) => s.open).map((s) => s.key)))
const rowSel = ref({ contacts: [], emails: [], addresses: [] })
const uid = () => 'r' + Math.random().toString(36).slice(2, 9)
const panResult = ref('') // last Verify click result for this person: '' | 'nomatch'

const member = computed(() => c.value.members[personIdx.value] || c.value.members[0])
const normalize = (m) => ({ ...m, extra: { ...(m.extra || {}), pan: (m.extra || {}).pan ?? m.pan ?? '' }, product: m.product || [] })
function resetDraft() {
  const m = member.value
  draft.value = JSON.parse(JSON.stringify(normalize(m)))
  marked.value = { contacts: new Set(), emails: new Set() }
  rowSel.value = { contacts: [], emails: [], addresses: [] }
  errors.value = {}
}
watch([personIdx, () => c.value.id], () => { panResult.value = ''; resetDraft() }, { immediate: true })
watch(() => JSON.stringify(member.value), () => { if (!dirty.value) resetDraft() })

const pending = computed(() => pendingFor(c.value.id))
const pendIdx = computed(() => pendingChangeIndex(c.value.id))
const groupReq = computed(() => pending.value.find((r) => r.category === 'Group Member'))
const removalKeys = computed(() => (groupReq.value?.payload?.op === 'remove' ? groupReq.value.payload.memberKeys : []))
const isPendingField = (field) => !!pendIdx.value[`${member.value.key}:identity:${field}`]
const rowPending = (section, rowId) => pendIdx.value[`${member.value.key}:${section}:${rowId}`]
const verifiedView = computed(() => false) // the Verified (Transaction) side exists only in Investor DMS
const isInvestorPerson = computed(() => !!member.value.investor)
const isVerifiedMember = computed(() => !c.value.verifiedKeys || c.value.verifiedKeys.includes(member.value.key) || member.value.key === 'p')
const disabled = computed(() => props.readonly || verifiedView.value || isInvestorPerson.value)

// ---------- diff ----------
const NAME_FIELDS = ['first_name', 'middle_name', 'last_name']
function sensitiveChanges() {
  const o = member.value, d = draft.value, ch = []
  const mName = fullName(o)
  for (const f of NAME_FIELDS) if ((d[f] || '') !== (o[f] || '')) ch.push({ memberKey: o.key, memberName: mName, section: 'identity', field: f, label: IDENTITY_FIELDS.find((x) => x.key === f).label, old: o[f] || '', new: d[f] || '', kind: 'modify', cat: 'Name' })
  for (const [sec, rowsKey, valKey, cat, lbl] of [['contact', 'contacts', 'mobile', 'Mobile', 'Mobile No.'], ['email', 'emails', 'email', 'Email', 'Email Address']]) {
    for (const r of d[rowsKey]) {
      const orig = o[rowsKey].find((x) => x.id === r.id)
      if (marked.value[rowsKey].has(r.id)) continue
      if (!orig && r[valKey]) ch.push({ memberKey: o.key, memberName: mName, section: sec, rowId: r.id, label: `${lbl}${r.type ? ` (${r.type})` : ''}`, old: '', new: r[valKey], kind: 'add', cat, row: r })
      else if (orig && !orig.pendingAdd && orig[valKey] !== r[valKey]) ch.push({ memberKey: o.key, memberName: mName, section: sec, rowId: r.id, label: `${lbl}${r.type ? ` (${r.type})` : ''}`, old: orig[valKey], new: r[valKey], kind: 'modify', cat })
    }
    for (const id of marked.value[rowsKey]) { const orig = o[rowsKey].find((x) => x.id === id); if (orig) ch.push({ memberKey: o.key, memberName: mName, section: sec, rowId: id, label: `${lbl}${orig.type ? ` (${orig.type})` : ''}`, old: orig[valKey], new: '', kind: 'delete', cat: 'Delete Mobile/Email' }) }
  }
  return ch
}
const comparable = (m, marks) => JSON.stringify({ ...m, contacts: m.contacts.filter((r) => !marks?.contacts.has(r.id)), emails: m.emails.filter((r) => !marks?.emails.has(r.id)) })
const dirty = computed(() => draft.value && (comparable(draft.value, marked.value) !== comparable(normalize(member.value))))
const needsApproval = computed(() => draft.value && sensitiveChanges().length > 0)

// ---------- validation (D03 §11.5) ----------
function validate() {
  const d = draft.value, e = {}
  if (!d.first_name?.trim()) e.first_name = 'First Name is mandatory.'
  if (personIdx.value > 0 && !d.relationship) e.relationship = 'Relationship with Primary is mandatory.'
  if (d.date_of_birth && new Date(d.date_of_birth) > new Date()) e.date_of_birth = 'Date of Birth cannot be in the future.'
  const live = d.contacts.filter((r) => !marked.value.contacts.has(r.id))
  if (!live.some((r) => r.mobile)) e.contacts = 'At least one mobile number must remain. Change the number instead of deleting the last one.'
  if (live.some((r) => r.mobile && !/^\d{10}$/.test(r.mobile))) e.contacts = 'Mobile numbers must be 10 digits.'
  const liveE = d.emails.filter((r) => !marked.value.emails.has(r.id))
  if (member.value.emails.length && !liveE.some((r) => r.email)) e.emails = 'The last email address cannot be deleted. Change it instead.'
  if (liveE.some((r) => r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))) e.emails = 'Enter a valid email address.'
  if (d.addresses.some((a) => a.pin && !/^\d{6}$/.test(a.pin))) e.addresses = 'PIN must be 6 digits.'
  const x = d.extra || {}
  if (x.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(x.pan).toUpperCase())) e.pan = 'PAN format must be AAAAA9999A.'
  if (x.organ_donor && !x.organ_donor_id) e.organ_donor_id = 'Organ Donor ID is mandatory when Organ Donor is ticked.'
  for (const s of DATA_SECTIONS) for (const f of s.fields || []) if (f.notFuture && x[f.key] && new Date(x[f.key]) > new Date()) e[f.key] = `${f.label} cannot be in the future.`
  for (const s of DATA_SECTIONS.filter((s) => s.kind === 'table')) for (const r of x[s.key] || []) for (const col of s.columns) if (col.type === 'currency' && r[col.key] !== '' && r[col.key] != null && !(Number(r[col.key]) > 0)) e[s.key] = 'Amounts must be whole rupees above zero.'
  errors.value = e
  return !Object.keys(e).length
}

// ---------- save ----------
function save() {
  if (!validate()) { toast.error('Please fix the highlighted fields.'); return }
  const o = member.value, d = draft.value
  const ch = sensitiveChanges()
  // 1) apply non-sensitive changes immediately (DT-006)
  const before = JSON.stringify(o)
  for (const k of Object.keys(d)) if (!['contacts', 'emails', 'key', ...NAME_FIELDS].includes(k)) o[k] = JSON.parse(JSON.stringify(d[k]))
  for (const r of d.contacts) { const orig = o.contacts.find((x) => x.id === r.id); if (orig) { orig.type = r.type; orig.is_whatsapp = r.is_whatsapp } }
  if (d.extra?.pan) { o.pan = String(d.extra.pan).toUpperCase(); o.extra.pan = o.pan }
  const directChanged = JSON.stringify(o) !== before
  if (directChanged) db.addActivity(c.value.id, 'data', `updated ${fullName(o)}'s details`)
  // 2) sensitive changes -> approval request (APP-001)
  if (ch.length) {
    const tmp = 'tmp-' + Date.now()
    for (const x of ch.filter((x) => x.kind === 'add')) (x.section === 'contact' ? o.contacts : o.emails).push({ ...x.row, pendingAdd: true, reqId: tmp })
    try {
      const cats = [...new Set(ch.map((x) => x.cat))]
      const req = submitRequest({ clientId: c.value.id, categories: cats, changes: ch.map(({ row, cat, ...rest }) => rest) })
      for (const list of [o.contacts, o.emails]) for (const r of list) if (r.reqId === tmp) r.reqId = req.id
      toast.success(req.status === 'Approved' ? 'Saved' : `Sent for approval (${ch.length} change${ch.length > 1 ? 's' : ''}). ${directChanged ? 'Other changes were saved.' : ''}`)
    } catch (e) {
      for (const list of [o.contacts, o.emails]) for (let i = list.length - 1; i >= 0; i--) if (list[i].reqId === tmp) list.splice(i, 1)
      toast.error(e.message)
    }
  } else toast.success('Saved')
  resetDraft()
}

// ---------- rows ----------
function addRow(key, row, max) {
  if (max && draft.value[key].length >= max) return toast.error(`Maximum ${max} rows.`)
  draft.value[key].unshift({ id: uid(), ...row }) // newest first (D01 §1.4)
}
function removeSelected(key) {
  const ids = rowSel.value[key]
  if (key === 'addresses') draft.value.addresses = draft.value.addresses.filter((r) => !ids.includes(r.id))
  else for (const id of ids) {
    const isNew = !member.value[key].some((x) => x.id === id)
    if (isNew) draft.value[key] = draft.value[key].filter((r) => r.id !== id)
    else marked.value[key].add(id) // deletion needs approval (D03 §22.2)
  }
  marked.value = { ...marked.value }
  rowSel.value[key] = []
}
function toggleRowSel(key, id) { const a = rowSel.value[key]; rowSel.value[key] = a.includes(id) ? a.filter((x) => x !== id) : [...a, id] }
function tableAdd(sec) { draft.value.extra[sec.key] = [{ id: uid() }, ...(draft.value.extra[sec.key] || [])] }
function tableRemove(sec, id) { draft.value.extra[sec.key] = draft.value.extra[sec.key].filter((r) => r.id !== id) }
function toggleSection(k) { const s = new Set(openSections.value); s.has(k) ? s.delete(k) : s.add(k); openSections.value = s }
function verifiedValue(key) { return isVerifiedMember.value && VERIFIED_FIELDS.includes(key) ? member.value[key] : '' }

// ---------- Client ID per person + PAN verification (product-owner decisions 06 Nov 2026) ----------
// Each person shows their own Client ID; the primary's is the record ID (D03 §2.1: system-set, never reused).
// For an Investor the Client ID is the Transaction Platform CID (product owner, 06 Nov 2026); unverified members keep their DMS ID.
const isInvestorStage = computed(() => false)
const personClientId = computed(() => {
  if (isInvestorStage.value) { const cid = personIdx.value === 0 ? c.value.cid : member.value.cid; if (cid) return cid }
  return personIdx.value === 0 ? c.value.id : member.value.clientId || '—'
})
const clientIdLabel = computed(() => (isInvestorStage.value && (personIdx.value === 0 ? c.value.cid : member.value.cid) ? 'Client ID (CID)' : 'Client ID'))
const panState = computed(() => (member.value.panVerified ? 'ok' : panResult.value))
function verifyPan() {
  try {
    const r = verifyMemberPan(c.value, member.value.key, draft.value.extra.pan)
    panResult.value = r === 'ok' ? '' : r
    if (r === 'ok') {
      // keep the draft in step with the verified person so unrelated edits stay intact
      Object.assign(draft.value, { pan: member.value.pan, panVerified: true, panVerifiedAt: member.value.panVerifiedAt })
      draft.value.extra.pan = member.value.pan
      toast.success('PAN format checked. Platform registration is checked in Convert to Investor.')
    } else toast.error('No match found on the Transaction Platform.')
  } catch (e) { toast.error(e instanceof RuleError ? e.message : String(e.message)) }
}

// ---------- group members ----------
const addOpen = ref(false)
const removeOpen = ref(false)
const memberMenu = computed(() => [
  { label: 'Add group member', icon: 'lucide-user-plus', disabled: !!groupReq.value, onClick: () => (addOpen.value = true) },
  { label: 'Remove group member', icon: 'lucide-user-minus', disabled: !!groupReq.value || c.value.members.filter((m, i) => i > 0 && !m.investor).length < 1, onClick: () => (removeOpen.value = true) },
])
const personTabs = computed(() => c.value.members.map((m, i) => ({ i, key: m.key, label: i === 0 ? 'Personal' : `Group Member-${i}`, red: removalKeys.value.includes(m.key), investor: !!m.investor })))
const fieldShown = (f, vals) => (typeof f.showIf === 'function' ? f.showIf(vals) : f.showIf ? !!vals[f.showIf] : true)
</script>
<template>
  <div v-if="draft" class="space-y-4 p-5">
    <div class="text-xs font-medium uppercase tracking-wider text-ink-gray-5">Data</div>
    <ApprovalBar v-for="r in pending" :key="r.id" :request="r" :client="c" />

    <div v-if="false" class="flex items-center gap-3">
      <span class="text-sm font-medium text-ink-gray-7">{{ side === 'verified' ? 'Verified Data' : 'Unverified Data' }}</span>
      <TabButtons v-model="side" :options="[{ label: 'Unverified (DMS)', value: 'unverified' }, { label: 'Verified (Transaction)', value: 'verified' }]" />
      <span v-if="verifiedView" class="text-xs text-ink-gray-5">Read-only – from the Transaction Platform (simulated). Only platform fields are filled.</span>
    </div>

    <!-- person tabs + actions -->
    <div class="flex items-end justify-between border-b">
      <div class="dms-toolbar-scroll flex gap-5 overflow-x-auto overflow-y-hidden">
        <button v-for="t in personTabs" :key="t.key" class="-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2 text-base"
          :class="personIdx === t.i ? 'border-ink-gray-9 font-medium text-ink-gray-9' : 'border-transparent text-ink-gray-6'" @click="personIdx = t.i">
          {{ t.label }}<span v-if="t.investor" class="rounded-4 border border-outline-green-3 px-1 text-2xs font-semibold text-ink-green-7">INVESTOR</span><span v-if="t.red" class="size-1.5 rounded-full bg-surface-red-7" title="Part of a pending removal" />
        </button>
      </div>
      <div class="flex items-center gap-2 pb-1.5">
        <Dropdown v-if="!readonly && !verifiedView" :options="memberMenu" align="end"><Button icon="lucide-ellipsis-vertical" /></Dropdown>
        <Button v-if="!readonly && !verifiedView && !isInvestorPerson" variant="solid" :disabled="!dirty" :label="needsApproval ? 'Send for Approval' : 'Save'" @click="save" />
        <Button v-if="dirty" variant="ghost" label="Discard" @click="resetDraft" />
      </div>
    </div>

    <!-- investor member: name + Investor tag only (DECISION-13) -->
    <div v-if="isInvestorPerson" class="rounded-6 border p-4" data-testid="investor-masked">
      <div class="flex items-center gap-2 text-lg text-ink-gray-9">{{ fullName(member) }}<span class="rounded-4 border border-outline-green-3 bg-surface-green-1 px-1.5 text-xs font-semibold text-ink-green-7">INVESTOR</span></div>
      <dl class="mt-3 grid grid-cols-[160px_1fr] gap-y-1.5 text-sm">
        <dt class="text-ink-gray-6">Client ID</dt><dd class="text-ink-gray-8 tabular" data-testid="investor-cid">{{ member.investor.cid || member.cid || '—' }}</dd>
        <dt class="text-ink-gray-6">Family ID</dt><dd class="text-ink-gray-8 tabular">{{ c.familyId }}</dd>
        <dt class="text-ink-gray-6">Conversion date</dt><dd class="text-ink-gray-8">{{ fmtDate(member.investor.convertedAt) }}</dd>
        <dt class="text-ink-gray-6">Other details</dt><dd class="text-ink-gray-5">{{ member.investor.dataRemoved ? 'Removed from Prospect DMS' : '••••' }}</dd>
      </dl>
      <p v-if="member.investor.separateFamily" class="mt-3 rounded-4 bg-surface-amber-1 px-3 py-2 text-sm text-ink-amber-8" data-testid="investor-separate">Registered in a different family on the Transaction Platform{{ member.investor.platformFamilyId ? ` (${member.investor.platformFamilyId})` : '' }}. In Investor DMS this person is a separate investor group, not with {{ c.members.filter((x) => x.investor && !x.investor.separateFamily).map(fullName).join(', ') || 'the other investors of this family' }}.</p>
      <p class="mt-3 text-xs text-ink-gray-5">This person is an investor, handled in Investor DMS. Prospect DMS shows only the name and the Investor tag. Their earlier history stays read-only in the other tabs.</p>
    </div>
    <!-- sections -->
    <section v-for="s in isInvestorPerson ? [] : DATA_SECTIONS" :key="s.key" class="rounded-6 border">
      <button class="flex w-full items-center justify-between rounded-t-6 bg-surface-gray-1 px-4 py-2.5 text-left" @click="toggleSection(s.key)">
        <span class="text-base font-medium text-ink-gray-8">{{ s.label }}<span v-if="s.kind === 'address'" class="block text-xs font-normal text-ink-gray-5">Repeatable row component</span></span>
        <span class="flex items-center gap-3 text-xs text-ink-gray-5"><span v-if="s.kind === 'identity'" class="text-sm text-ink-gray-6" data-testid="person-client-id">{{ clientIdLabel }}: <span class="font-medium text-ink-gray-8">{{ personClientId }}</span></span><span v-if="s.kind === 'address' && openSections.has(s.key)">Expanded</span><span :class="openSections.has(s.key) ? 'lucide-chevron-up' : 'lucide-chevron-down'" class="size-4" /></span>
      </button>
      <div v-if="openSections.has(s.key)" class="p-4">
        <!-- Identity -->
        <div v-if="s.kind === 'identity'" class="grid grid-cols-3 gap-x-4 gap-y-3">
          <div v-for="f in IDENTITY_FIELDS" :key="f.key" class="relative">
            <template v-if="f.type === 'relationship'">
              <DataField v-if="personIdx === 0" :field="{ ...f, type: 'text' }" model-value="Primary" disabled />
              <DataField v-else v-model="draft.relationship" :field="{ ...f, type: 'select' }" :options="RELATIONSHIPS" :disabled="disabled" :error="errors.relationship" />
            </template>
            <template v-else>
              <DataField v-if="verifiedView" :field="f" :model-value="verifiedValue(f.key)" disabled />
              <DataField v-else v-model="draft[f.key]" :field="f" :disabled="disabled || isPendingField(f.key)" :error="errors[f.key]" />
              <span v-if="isPendingField(f.key)" class="absolute right-0 top-0 flex items-center gap-1 rounded-4 border border-outline-blue-3 bg-surface-blue-1 px-1.5 text-2xs text-ink-blue-7"><span class="lucide-eye size-3" />Review change</span>
            </template>
          </div>
        </div>
        <!-- Product interest (no approval) -->
        <div v-else-if="s.kind === 'product'" class="grid grid-cols-4 gap-y-2.5">
          <label v-for="p in PRODUCT_INTEREST" :key="p.key" class="flex items-center gap-2 text-sm text-ink-gray-7">
            <input v-model="draft.product" type="checkbox" :value="p.key" :disabled="disabled" class="rounded-1" />{{ p.label }}
          </label>
        </div>
        <!-- Contact -->
        <div v-else-if="s.kind === 'contact'">
          <table class="w-full text-sm"><thead class="bg-surface-gray-2 text-left text-ink-gray-6"><tr><th class="w-8" /><th class="px-2 py-1.5 font-normal">Contact Type</th><th class="px-2 font-normal">Mobile No. *</th><th class="px-2 text-center font-normal">Is WhatsApp Number</th><th /></tr></thead>
            <tbody>
              <tr v-if="verifiedView"><td colspan="5" class="px-2 py-2 text-ink-gray-5">{{ isVerifiedMember ? 'Platform contact data is not shown in this demo.' : '—' }}</td></tr>
              <tr v-for="r in verifiedView ? [] : draft.contacts" :key="r.id" class="border-b" :class="marked.contacts.has(r.id) && 'bg-surface-red-1'">
                <td class="px-2"><input type="checkbox" class="rounded-1" :disabled="disabled || !!rowPending('contact', r.id) || r.pendingAdd" :checked="rowSel.contacts.includes(r.id)" @change="toggleRowSel('contacts', r.id)" /></td>
                <td class="p-1"><select v-model="r.type" :disabled="disabled" class="w-full rounded-4 border-outline-gray-2 py-1 text-sm"><option v-for="o in CONTACT_TYPES" :key="o">{{ o }}</option></select></td>
                <td class="p-1"><input v-model="r.mobile" maxlength="10" :disabled="disabled || r.pendingAdd || !!rowPending('contact', r.id) || marked.contacts.has(r.id)" class="w-full rounded-4 border-outline-gray-2 py-1 text-sm tabular" /></td>
                <td class="p-1 text-center"><input v-model="r.is_whatsapp" type="checkbox" :disabled="disabled || r.pendingAdd" class="rounded-1" /></td>
                <td class="w-36 px-1 text-right">
                  <span v-if="marked.contacts.has(r.id) || rowPending('contact', r.id)?.kind === 'delete'" class="rounded-4 bg-surface-red-2 px-1.5 py-0.5 text-2xs font-medium text-ink-red-7">Deletion Request</span>
                  <span v-else-if="r.pendingAdd" class="rounded-4 bg-surface-blue-2 px-1.5 py-0.5 text-2xs text-ink-blue-7">Pending approval</span>
                  <span v-else-if="rowPending('contact', r.id)" class="rounded-4 bg-surface-blue-2 px-1.5 py-0.5 text-2xs text-ink-blue-7">Review change</span>
                </td>
              </tr>
            </tbody></table>
          <div v-if="!disabled" class="mt-2 flex gap-3 text-sm">
            <button class="text-ink-gray-7 disabled:opacity-40" :disabled="draft.contacts.length >= LIMITS.CONTACT_ROWS" @click="addRow('contacts', { type: 'Residence', mobile: '', is_whatsapp: false }, LIMITS.CONTACT_ROWS)">+ Add Row</button>
            <button v-if="rowSel.contacts.length" class="text-ink-red-6" @click="removeSelected('contacts')">− Remove</button>
          </div>
          <p v-if="errors.contacts" class="mt-1 text-xs text-ink-red-7">{{ errors.contacts }}</p>
        </div>
        <!-- Email -->
        <div v-else-if="s.kind === 'email'">
          <table class="w-full text-sm"><thead class="bg-surface-gray-2 text-left text-ink-gray-6"><tr><th class="w-8" /><th class="px-2 py-1.5 font-normal">Email Address *</th><th /></tr></thead>
            <tbody>
              <tr v-for="r in verifiedView ? [] : draft.emails" :key="r.id" class="border-b" :class="marked.emails.has(r.id) && 'bg-surface-red-1'">
                <td class="px-2"><input type="checkbox" class="rounded-1" :disabled="disabled || r.pendingAdd || !!rowPending('email', r.id)" :checked="rowSel.emails.includes(r.id)" @change="toggleRowSel('emails', r.id)" /></td>
                <td class="p-1"><input v-model="r.email" :disabled="disabled || r.pendingAdd || !!rowPending('email', r.id) || marked.emails.has(r.id)" class="w-full rounded-4 border-outline-gray-2 py-1 text-sm" /></td>
                <td class="w-36 px-1 text-right">
                  <span v-if="marked.emails.has(r.id) || rowPending('email', r.id)?.kind === 'delete'" class="rounded-4 bg-surface-red-2 px-1.5 py-0.5 text-2xs font-medium text-ink-red-7">Deletion Request</span>
                  <span v-else-if="r.pendingAdd" class="rounded-4 bg-surface-blue-2 px-1.5 py-0.5 text-2xs text-ink-blue-7">Pending approval</span>
                </td>
              </tr>
              <tr v-if="!draft.emails.length || verifiedView"><td /><td class="px-2 py-2 text-ink-gray-4">—</td><td /></tr>
            </tbody></table>
          <div v-if="!disabled" class="mt-2 flex gap-3 text-sm">
            <button class="text-ink-gray-7" @click="addRow('emails', { email: '' })">+ Add Row</button>
            <button v-if="rowSel.emails.length" class="text-ink-red-6" @click="removeSelected('emails')">− Remove</button>
          </div>
          <p v-if="errors.emails" class="mt-1 text-xs text-ink-red-7">{{ errors.emails }}</p>
        </div>
        <!-- Address (no approval) -->
        <div v-else-if="s.kind === 'address'">
          <table class="w-full text-sm"><thead class="bg-surface-gray-2 text-left text-ink-gray-6"><tr><th class="w-8" /><th class="px-2 py-1.5 font-normal">Address Type</th><th class="px-2 font-normal">Address</th><th class="px-2 font-normal">City</th><th class="px-2 font-normal">PIN</th><th class="px-2 font-normal">State</th><th class="px-2 font-normal">Country</th></tr></thead>
            <tbody>
              <tr v-for="r in verifiedView ? [] : draft.addresses" :key="r.id" class="border-b">
                <td class="px-2"><input type="checkbox" class="rounded-1" :disabled="disabled" :checked="rowSel.addresses.includes(r.id)" @change="toggleRowSel('addresses', r.id)" /></td>
                <td class="p-1"><select v-model="r.type" :disabled="disabled" class="w-full rounded-4 border-outline-gray-2 py-1 text-sm"><option v-for="o in ADDRESS_TYPES" :key="o">{{ o }}</option></select></td>
                <td class="p-1"><input v-model="r.address" :disabled="disabled" class="w-full rounded-4 border-outline-gray-2 py-1 text-sm" /></td>
                <td class="p-1"><input v-model="r.city" :disabled="disabled" class="w-full rounded-4 border-outline-gray-2 py-1 text-sm" /></td>
                <td class="p-1"><input v-model="r.pin" maxlength="6" :disabled="disabled" class="w-20 rounded-4 border-outline-gray-2 py-1 text-sm" /></td>
                <td class="p-1"><input v-model="r.state" :disabled="disabled" class="w-full rounded-4 border-outline-gray-2 py-1 text-sm" /></td>
                <td class="p-1"><input v-model="r.country" :disabled="disabled" class="w-full rounded-4 border-outline-gray-2 py-1 text-sm" /></td>
              </tr>
            </tbody></table>
          <div v-if="!disabled" class="mt-2 flex gap-3 text-sm">
            <button class="text-ink-gray-7 disabled:opacity-40" :disabled="draft.addresses.length >= LIMITS.ADDRESS_ROWS" @click="addRow('addresses', { type: 'Present', address: '', city: '', pin: '', state: '', country: 'India' }, LIMITS.ADDRESS_ROWS)">+ Add Row</button>
            <button v-if="rowSel.addresses.length" class="text-ink-red-6" @click="removeSelected('addresses')">− Remove</button>
          </div>
          <p v-if="errors.addresses" class="mt-1 text-xs text-ink-red-7">{{ errors.addresses }}</p>
        </div>
        <!-- Generic fields -->
        <div v-else-if="s.kind === 'fields'" class="grid grid-cols-3 gap-x-4 gap-y-3">
          <template v-for="f in s.fields" :key="f.key">
            <DataField v-if="fieldShown(f, draft.extra)" :model-value="verifiedView ? verifiedValue(f.key) : draft.extra[f.key]" :field="{ ...f, required: f.requiredIf ? !!draft.extra[f.requiredIf] : f.required }"
              :disabled="disabled" :error="errors[f.key]" :class="f.type === 'textarea' && 'col-span-1'" @update:model-value="(v) => (draft.extra[f.key] = v)"
              :verifiable="f.type === 'pan' && !verifiedView" :pan-state="f.type === 'pan' && !verifiedView ? panState : ''" @verify="verifyPan" @pan-input="panResult = ''" />
          </template>
        </div>
        <!-- Generic tables -->
        <div v-else-if="s.kind === 'table'">
          <div class="overflow-x-auto">
            <table class="w-full text-sm"><thead class="bg-surface-gray-2 text-left text-ink-gray-6"><tr><th v-for="col in s.columns" :key="col.key" class="whitespace-nowrap px-2 py-1.5 font-normal">{{ col.label }}</th><th class="w-8" /></tr></thead>
              <tbody>
                <tr v-for="r in verifiedView ? [] : draft.extra[s.key] || []" :key="r.id" class="border-b">
                  <td v-for="col in s.columns" :key="col.key" class="min-w-[120px] p-1"><DataField v-model="r[col.key]" :field="col" compact :disabled="disabled" /></td>
                  <td class="px-1"><button v-if="!disabled" class="lucide-trash-2 size-3.5 text-ink-gray-5 hover:text-ink-red-6" title="Remove row" @click="tableRemove(s, r.id)" /></td>
                </tr>
                <tr v-if="!(draft.extra[s.key] || []).length || verifiedView"><td :colspan="s.columns.length + 1" class="px-2 py-2 text-ink-gray-4">—</td></tr>
              </tbody></table>
          </div>
          <button v-if="!disabled" class="mt-2 text-sm text-ink-gray-7" @click="tableAdd(s)">+ Add Row</button>
          <p v-if="errors[s.key]" class="mt-1 text-xs text-ink-red-7">{{ errors[s.key] }}</p>
        </div>
      </div>
    </section>
    <PersonFormModal v-model:open="addOpen" mode="member" :client-id="c.id" />
    <RemoveMemberWizard v-model:open="removeOpen" :client="c" />
  </div>
</template>
