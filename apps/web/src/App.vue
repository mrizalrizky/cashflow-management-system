<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import ConfirmDialog from 'primevue/confirmdialog'
import ProgressSpinner from 'primevue/progressspinner'
import Toast from 'primevue/toast'
import ErrorState from '@/components/ErrorState.vue'
import AppLayout from '@/layouts/AppLayout.vue'
import AuthLayout from '@/layouts/AuthLayout.vue'
import { pageLoadFailed } from '@/router/chunk-errors'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const session = useSessionStore()

// Sebelum sesi dipulihkan dan rute pertama selesai dipilih, belum diketahui halaman mana yang
// boleh tampil; menampilkan kerangka aplikasi di saat itu akan berkedip di depan halaman login.
const booting = computed(() => !session.ready || route.matched.length === 0)
function reloadPage(): void {
  window.location.reload()
}

const layout = computed(() => (route.meta.layout === 'auth' ? AuthLayout : AppLayout))
</script>

<template>
  <div v-if="pageLoadFailed" class="flex min-h-dvh items-center justify-center p-4">
    <ErrorState
      message="Halaman gagal dimuat. Periksa koneksi Anda, lalu coba lagi."
      @retry="reloadPage"
    />
  </div>
  <div v-else-if="booting" class="flex min-h-dvh items-center justify-center">
    <ProgressSpinner aria-label="Memuat" />
  </div>
  <component :is="layout" v-else>
    <RouterView />
  </component>
  <Toast position="top-center" />
  <ConfirmDialog />
</template>
