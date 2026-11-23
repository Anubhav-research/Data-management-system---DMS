<script setup>
// Quiz (Content Hub): the shared page, given this website's team. Counted: IS (the B2C taker role; a B2B website passes RM).
import { computed } from 'vue'
import { useDb } from '@/stores/db'
import QuizPage from '@mh/core-ui/content/QuizPage.vue'
const db = useDb()
const people = computed(() => db.users.filter((u) => u.active && u.role !== 'Admin').map((u) => ({ mhfId: u.mhf_id, name: u.name, role: u.role })))
</script>
<template><QuizPage :people="people" taker-role="IS" /></template>
