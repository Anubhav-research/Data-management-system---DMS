<script setup>
// Login (GEN-001; Fig 13333). Demo: any password is accepted; the MHF ID chooses the demo user/role.
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Button } from 'frappe-ui'
import { useDb } from '@/stores/db'
import { generateWarnings } from '@/services/lifecycle'
import { SITE } from '@/site'

const db = useDb(); const router = useRouter(); const route = useRoute()
const mhf = ref('MHF500007')
const pwd = ref('demo1234')
const show = ref(false)
const error = ref('')
const users = computed(() => db.users.filter((u) => u.active))
function login() {
  error.value = ''
  const u = db.users.find((x) => x.mhf_id.toLowerCase() === mhf.value.trim().toLowerCase())
  if (!u) { error.value = 'Invalid MHF ID or password.'; return }
  if (!u.active || !u.switches?.dms) { error.value = 'Your DMS access is disabled. Contact Admin.'; return }
  if (!pwd.value) { error.value = 'Password is required.'; return }
  db.login(u.id); generateWarnings(u.id)
  router.push(route.query.next || SITE.home)
}
</script>
<template>
  <div class="flex min-h-screen flex-col bg-dms-page">
    <div class="border-t-[3px] bg-surface-base px-6 py-4 text-base text-ink-gray-8" style="border-top-color: var(--dms-accent)">Home</div>
    <div class="flex flex-1 flex-col items-center px-4 pt-16">
      <img src="/assets/mh-logo.png" alt="Money Honey" class="size-11" />
      <span class="mt-3 rounded-sm px-1.5 py-0.5 text-xs font-semibold tracking-wider text-white" style="background: var(--dms-accent)">{{ SITE.badge }}</span>
      <h1 class="mt-3 text-3xl text-ink-gray-9">{{ SITE.loginTitle }}</h1>
      <form class="mt-8 w-full max-w-[420px] space-y-4 rounded-6 border bg-surface-base p-8 shadow-sm" @submit.prevent="login">
        <label class="flex items-center gap-3 rounded-4 bg-dms-field px-3 py-2.5">
          <span class="lucide-mail size-4 text-ink-gray-5" />
          <input v-model="mhf" class="flex-1 border-0 bg-transparent p-0 text-base focus:ring-0" placeholder="MHF ID" autocomplete="username" />
        </label>
        <label class="flex items-center gap-3 rounded-4 bg-dms-field px-3 py-2.5">
          <span class="lucide-lock size-4 text-ink-gray-5" />
          <input v-model="pwd" :type="show ? 'text' : 'password'" class="flex-1 border-0 bg-transparent p-0 text-base focus:ring-0" placeholder="Password" autocomplete="current-password" />
          <button type="button" class="text-sm text-ink-gray-6" @click="show = !show">{{ show ? 'Hide' : 'Show' }}</button>
        </label>
        <p v-if="error" class="text-sm text-ink-red-7">{{ error }}</p>
        <Button type="submit" variant="solid" size="lg" class="w-full" label="Login" />
      </form>
      <div class="mt-8 w-full max-w-[420px] rounded-6 border border-dashed bg-white/70 p-4">
        <div class="mb-2 text-sm font-medium text-ink-gray-7">Demo users (fictional) – click to fill the MHF ID</div>
        <div class="grid grid-cols-2 gap-1.5">
          <button v-for="u in users" :key="u.id" class="rounded-4 px-2 py-1 text-left text-sm hover:bg-surface-gray-2" :class="mhf === u.mhf_id && 'bg-surface-gray-3'" @click="mhf = u.mhf_id">
            <span class="font-medium text-ink-gray-8">{{ u.role }}</span> · {{ u.name.split(' ')[0] }} <span class="text-ink-gray-5">{{ u.mhf_id }}</span>
          </button>
        </div>
        <p class="mt-2 text-xs text-ink-gray-5">Any password works. Demo data is kept on this website's own server, so everyone on the network sees the same data.</p>
      </div>
    </div>
  </div>
</template>
