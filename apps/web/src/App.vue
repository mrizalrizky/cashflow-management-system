<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import ConfirmDialog from 'primevue/confirmdialog'
import ProgressSpinner from 'primevue/progressspinner'
import Toast from 'primevue/toast'
import AuthLayout from '@/layouts/AuthLayout.vue'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()

const layout = computed(() => (route.meta.layout === 'auth' ? AuthLayout : 'div'))
</script>

<template>
  <!-- Sebelum sesi selesai dipulihkan belum diketahui halaman mana yang boleh tampil. -->
  <div v-if="!session.ready" class="flex min-h-dvh items-center justify-center">
    <ProgressSpinner aria-label="Memuat" />
  </div>
  <component :is="layout" v-else>
    <RouterView />
  </component>
  <Toast position="top-center" />
  <ConfirmDialog />
</template>
