<script setup lang="ts">
import Button from 'primevue/button'

/** Tombol ikon di baris tabel, dengan nama yang terbaca pembaca layar. */
defineProps<{ icon: string; label: string; testId?: string }>()
</script>

<template>
  <Button
    :icon="icon"
    severity="secondary"
    variant="text"
    :aria-label="label"
    :title="label"
    :data-testid="testId"
  />
</template>
