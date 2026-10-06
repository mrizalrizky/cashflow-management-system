<script setup lang="ts">
import Tag from 'primevue/tag'
import type { ProjectStatus } from '@/api/types'
import { PROJECT_STATUS_SEVERITY, projectStatusLabel } from '@/lib/labels'

defineProps<{ status: ProjectStatus }>()
</script>

<template>
  <Tag :severity="PROJECT_STATUS_SEVERITY[status]" :value="projectStatusLabel(status)" />
</template>
