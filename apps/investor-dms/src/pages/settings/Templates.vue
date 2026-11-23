<script setup>
// Settings → Email → Templates (Frappe CRM Email Templates layout). D04 §12.1: email templates are created and
// kept by Admin in the CRM settings; WhatsApp templates are approved by WhatsApp (Meta) and brought into DMS (read-only).
import { ref, computed } from 'vue'
import { Button, Dialog, Dropdown, FormControl, Switch, TabButtons, dialog, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { WA_TEMPLATES } from '@/data/masters'
import SettingsShell from '@/components/settings/SettingsShell.vue'

const db = useDb()
const tab = ref('email')
const edit = ref({ open: false, t: null, f: { name: '', subject: '', body: '' }, error: '' })
function openNew() { edit.value = { open: true, t: null, f: { name: '', subject: '', body: '' }, error: '' } }
function openEdit(t) { edit.value = { open: true, t, f: { name: t.name, subject: t.subject, body: t.body }, error: '' } }
function save() {
  const f = edit.value.f
  if (!f.name.trim() || !f.subject.trim() || !f.body.trim()) { edit.value.error = 'Name, Subject and Message are mandatory.'; return }
  if (db.emailTemplates.some((x) => x.name === f.name.trim() && x !== edit.value.t)) { edit.value.error = 'A template with this name already exists.'; return }
  if (edit.value.t) Object.assign(edit.value.t, { name: f.name.trim(), subject: f.subject.trim(), body: f.body })
  else db.emailTemplates.unshift({ id: db.nextId('ET'), name: f.name.trim(), subject: f.subject.trim(), body: f.body, enabled: true })
  edit.value.open = false
  toast.success('Template saved')
}
const menu = (t) => [
  { label: 'Edit', icon: 'lucide-pencil', onClick: () => openEdit(t) },
  { label: 'Delete', icon: 'lucide-trash-2', onClick: () => dialog.confirm({ title: 'Delete template?', message: `“${t.name}” will no longer be offered to specialists. Emails already sent are not affected.`, confirmLabel: 'Delete', theme: 'red', onConfirm: () => { db.emailTemplates = db.emailTemplates.filter((x) => x !== t); toast.success('Template deleted') } }) },
]
const enabledCount = computed(() => db.emailTemplates.filter((t) => t.enabled).length)
</script>
<template>
  <SettingsShell title="Templates" description="Ready-made messages specialists send to clients (D04 §12).">
    <template #actions><Button v-if="tab === 'email'" variant="solid" icon-left="lucide-plus" label="New" @click="openNew" /></template>
    <TabButtons v-model="tab" :options="[{ label: `Email (${enabledCount} enabled)`, value: 'email' }, { label: 'WhatsApp', value: 'wa' }]" />
    <table v-if="tab === 'email'" class="mt-4 w-full text-base">
      <thead class="text-sm text-ink-gray-5"><tr class="border-b"><th class="py-2 text-left font-normal">Template Name</th><th class="text-left font-normal">Subject</th><th class="w-20 text-left font-normal">Enabled</th><th class="w-10" /></tr></thead>
      <tbody>
        <tr v-for="t in db.emailTemplates" :key="t.id" class="border-b last:border-0">
          <td class="py-2.5"><div class="font-medium text-ink-gray-8">{{ t.name }}</div><div class="line-clamp-1 text-sm text-ink-gray-5">{{ t.body }}</div></td>
          <td class="text-ink-gray-7">{{ t.subject }}</td>
          <td><Switch v-model="t.enabled" /></td>
          <td><Dropdown :options="menu(t)" align="end"><Button variant="ghost" icon="lucide-ellipsis" :aria-label="`Actions for ${t.name}`" /></Dropdown></td>
        </tr>
        <tr v-if="!db.emailTemplates.length"><td colspan="4" class="py-10 text-center text-sm text-ink-gray-5">No email templates yet.</td></tr>
      </tbody>
    </table>
    <template v-else>
      <p class="mt-4 rounded-4 bg-surface-gray-2 px-3 py-2 text-p-sm text-ink-gray-6">WhatsApp templates must be approved by WhatsApp (Meta) before they can be used, then they are brought into DMS. They can't be edited here (D04 §12.1).</p>
      <table class="mt-3 w-full text-base">
        <thead class="text-sm text-ink-gray-5"><tr class="border-b"><th class="py-2 text-left font-normal">Template Name</th><th class="text-left font-normal">Message</th><th class="w-24 text-left font-normal">Status</th></tr></thead>
        <tbody>
          <tr v-for="t in WA_TEMPLATES" :key="t.name" class="border-b last:border-0">
            <td class="py-2.5 font-medium text-ink-gray-8">{{ t.name }}</td>
            <td class="text-sm text-ink-gray-6">{{ t.body }}</td>
            <td><span class="rounded-full bg-surface-green-2 px-2 py-0.5 text-xs text-ink-green-7">Approved</span></td>
          </tr>
        </tbody>
      </table>
    </template>

    <Dialog v-model:open="edit.open" :title="edit.t ? 'Edit Email Template' : 'New Email Template'" size="xl">
      <div class="space-y-3">
        <FormControl v-model="edit.f.name" label="Name" placeholder="e.g. meeting_followup" />
        <FormControl v-model="edit.f.subject" label="Subject" />
        <FormControl v-model="edit.f.body" type="textarea" label="Message" :rows="7" />
        <p class="text-xs text-ink-gray-5">Use {name} for the client's first name; DMS fills it in when the specialist sends the template.</p>
        <p v-if="edit.error" class="text-sm text-ink-red-7">{{ edit.error }}</p>
      </div>
      <template #actions><div class="flex justify-end gap-2"><Button label="Cancel" @click="edit.open = false" /><Button variant="solid" label="Save" @click="save" /></div></template>
    </Dialog>
  </SettingsShell>
</template>
