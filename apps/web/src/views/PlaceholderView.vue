<script setup lang="ts">
import { useRoute } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import { APP_NAME } from '@/lib/app'

// Tampilan sementara untuk halaman yang dibangun pada fase berikutnya.
const route = useRoute()
</script>

<template>
  <PageHeader :title="route.meta.title ?? APP_NAME" />
  <p class="text-surface-600">Halaman ini dibangun pada fase berikutnya.</p>
</template>
