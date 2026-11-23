<script setup>
// GEN-004 / Fig 4787: same message for non-existent and forbidden pages.
import { Button } from 'frappe-ui'
import { SITE } from '@/site'
</script>
<template>
  <div class="flex h-full flex-col">
    <div class="h-[52px] shrink-0 border-b" />
    <div class="flex flex-1 flex-col items-center justify-center gap-4 bg-dms-header">
      <p class="text-base text-ink-gray-7">Invalid page or not permitted to access</p>
      <Button :icon-left="SITE.homeIcon" :label="SITE.homeLabel" :route="SITE.home" />
    </div>
  </div>
</template>
