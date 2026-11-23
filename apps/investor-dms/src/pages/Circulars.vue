<script setup>
// Circulars (Content Hub): the shared page, given this website's team so Admin sees "Read by x of y IS".
// A B2B website passes reader-role="RM".
import { computed } from 'vue'
import { useDb } from '@/stores/db'
import CircularsPage from '@mh/core-ui/content/CircularsPage.vue'
const db = useDb()
const people = computed(() => db.users.filter((u) => u.active && u.role !== 'Admin').map((u) => ({ mhfId: u.mhf_id, name: u.name, role: u.role })))
</script>
<template><CircularsPage :people="people" reader-role="IS" /></template>
