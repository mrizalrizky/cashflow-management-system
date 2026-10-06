<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Tag from 'primevue/tag'
import { fetchHealth, type HealthState } from '@/api/health'

const state = ref<HealthState | 'loading'>('loading')

onMounted(async () => {
  state.value = await fetchHealth()
})
</script>

<template>
  <main class="mx-auto max-w-md p-6">
    <h1 class="text-2xl font-semibold">Arus Kas</h1>
    <p class="mt-4" data-testid="health">
      <Tag v-if="state === 'loading'" severity="secondary" value="Memeriksa API…" />
      <Tag v-else-if="state === 'up'" severity="success" value="API terhubung" />
      <Tag v-else severity="danger" value="API tidak terhubung" />
    </p>
  </main>
</template>
