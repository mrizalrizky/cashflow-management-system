<script setup lang="ts">
import Button from 'primevue/button'

/** Tombol ikon di baris tabel: nonaktifkan bila aktif, aktifkan bila nonaktif. */
defineProps<{ item: { id: string; name: string; isActive: boolean } }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <Button
    :icon="item.isActive ? 'pi pi-ban' : 'pi pi-check-circle'"
    :severity="item.isActive ? 'danger' : 'success'"
    variant="text"
    :aria-label="`${item.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${item.name}`"
    :title="item.isActive ? 'Nonaktifkan' : 'Aktifkan'"
    :data-testid="`toggle-${item.id}`"
    @click="$emit('toggle')"
  />
</template>
