<script setup>
// Pool Source Visibility (Admin only; D06 §8; Fig 32749-33255). Nothing changes until "Apply changes".
// Unchecked sources are not handed out in specialist batches; records stay in the Pool (Admin still sees them).
import { ref, computed } from 'vue'
import { Button, Checkbox, TextInput, dialog, toast } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { fmtDate } from '@/utils/format'
import SettingsShell from '@/components/settings/SettingsShell.vue'
import QuickSelect from '@/components/QuickSelect.vue'

const db = useDb()
const draft = ref(Object.fromEntries(db.poolSources.map((s) => [s.name, s.visible])))
const q = ref('')
const show = ref(undefined)
const count = (name) => db.clients.filter((c) => c.stage === 'Pool' && c.source === name).length // Active + Inactive only
const rows = computed(() => db.poolSources.filter((s) => (!q.value || s.name.toLowerCase().includes(q.value.toLowerCase())) && (!show.value || (show.value === 'Visible') === draft.value[s.name])))
const changes = computed(() => db.poolSources.filter((s) => draft.value[s.name] !== s.visible))
function setAll(v) { db.poolSources.forEach((s) => (draft.value[s.name] = v)) }
function discard() { draft.value = Object.fromEntries(db.poolSources.map((s) => [s.name, s.visible])) }
function doApply() {
  const list = changes.value.map((s) => ({ source: s.name, visible: draft.value[s.name] }))
  db.poolSources.forEach((s) => { s.visible = draft.value[s.name]; s.isNew = false })
  db.poolSourceLog.push({ by: db.sessionUserId, at: Date.now(), changes: list }) // every apply recorded (D06 §8.5)
  toast.success('Changes applied')
}
function apply() {
  if (!Object.values(draft.value).some(Boolean)) {
    return dialog.confirm({ title: 'Hide every source?', message: 'Nothing is checked. Specialists will see "No records available right now." until a source is checked again.', confirmLabel: 'Apply changes', onConfirm: doApply })
  }
  doApply()
}
</script>
<template>
  <SettingsShell title="Pool Source Visibility" description="Choose which data sources feed the Pool. Specialists receive batches only from checked sources.">
    <section class="mb-20 rounded-7 border bg-surface-base">
      <div class="flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <div class="w-64"><TextInput v-model="q" placeholder="Search sources"><template #prefix><span class="lucide-search size-4 text-ink-gray-5" /></template></TextInput></div>
        <QuickSelect v-model="show" label="All sources" :options="[{ label: 'Visible only', value: 'Visible' }, { label: 'Hidden only', value: 'Hidden' }]" />
        <div class="ml-auto flex gap-2"><Button label="Check all" @click="setAll(true)" /><Button label="Uncheck all" @click="setAll(false)" /></div>
      </div>
      <table class="w-full text-base">
        <thead class="text-sm text-ink-gray-5"><tr class="border-b">
          <th class="w-12 px-5 py-2.5" /><th class="px-3 text-left font-normal">Source</th><th class="px-3 text-right font-normal">Records in Pool</th>
          <th class="px-3 text-left font-normal">Last imported</th><th class="px-5 text-left font-normal">Specialists see it</th>
        </tr></thead>
        <tbody>
          <tr v-for="s in rows" :key="s.name" class="border-b last:border-0" :class="!draft[s.name] && 'bg-surface-gray-1 text-ink-gray-5'">
            <td class="px-5 py-2.5"><Checkbox v-model="draft[s.name]" /></td>
            <td class="px-3">{{ s.name }}<span v-if="s.isNew" class="ml-2 rounded-4 bg-surface-violet-2 px-1.5 py-0.5 text-xs text-ink-violet-7">New</span><span v-if="draft[s.name] !== s.visible" class="ml-2 text-xs text-ink-amber-7">• changed</span></td>
            <td class="px-3 text-right tabular">{{ count(s.name).toLocaleString('en-IN') }}</td>
            <td class="px-3">{{ fmtDate(s.lastImported) }}</td>
            <td class="px-5">
              <span class="rounded-full px-2 py-0.5 text-sm" :class="draft[s.name] ? 'bg-surface-green-2 text-ink-green-7' : 'bg-surface-amber-2 text-ink-amber-7'">{{ draft[s.name] ? 'Visible' : 'Hidden' }}</span>
            </td>
          </tr>
          <tr v-if="!rows.length"><td colspan="5" class="py-10 text-center text-sm text-ink-gray-5">No sources match.</td></tr>
        </tbody>
      </table>
    </section>
    <template #footer>
      <div v-if="changes.length" class="sticky bottom-4 mx-auto flex w-fit items-center gap-4 rounded-6 border bg-surface-elevation-2 px-5 py-2.5 shadow-2xl">
        <span class="text-base font-medium">{{ changes.length }} unsaved change{{ changes.length > 1 ? 's' : '' }}</span>
        <Button label="Discard changes" @click="discard" />
        <Button variant="solid" label="Apply changes" @click="apply" />
      </div>
    </template>
  </SettingsShell>
</template>
