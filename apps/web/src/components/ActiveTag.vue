<script setup lang="ts">
import Tag from 'primevue/tag'

defineProps<{ active: boolean }>()
</script>

<template>
  <Tag :severity="active ? 'success' : 'secondary'" :value="active ? 'Aktif' : 'Nonaktif'" />
</template>
