<script setup>
import { FrappeUIProvider } from 'frappe-ui'
import { useRoute } from 'vue-router'
import DesktopLayout from '@/layouts/DesktopLayout.vue'
const route = useRoute()
</script>
<template>
  <FrappeUIProvider>
    <router-view v-if="route.meta.bare" />
    <DesktopLayout v-else>
      <router-view :key="route.path" />
    </DesktopLayout>
  </FrappeUIProvider>
</template>
