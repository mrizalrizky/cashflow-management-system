<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Drawer from 'primevue/drawer'
import SideNav from '@/components/SideNav.vue'
import { useLogout } from '@/composables/useLogout'
import { roleLabel } from '@/lib/format'
import { menuFor } from '@/router/navigation'
import { PATHS } from '@/router/paths'
import { useSessionStore } from '@/stores/session'

const APP_NAME = 'Arus Kas'

const session = useSessionStore()
const router = useRouter()
const logout = useLogout()

const drawerOpen = ref(false)
const menu = computed(() => (session.role ? menuFor(session.role) : []))
</script>

<template>
  <div class="min-h-dvh bg-surface-50 lg:flex">
    <!-- Layar lebar: menu selalu terlihat di samping. -->
    <aside
      data-testid="sidebar"
      class="hidden w-60 shrink-0 flex-col gap-4 border-r border-surface-200 bg-surface-0 p-4 lg:flex"
    >
      <p class="px-3 text-lg font-semibold">{{ APP_NAME }}</p>
      <SideNav :items="menu" />
    </aside>

    <!-- Layar kecil: menu yang sama dibuka sebagai laci. -->
    <Drawer v-model:visible="drawerOpen" :header="APP_NAME">
      <div data-testid="drawer-nav">
        <SideNav :items="menu" @navigate="drawerOpen = false" />
      </div>
    </Drawer>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex items-center gap-2 border-b border-surface-200 bg-surface-0 px-4 py-2"
      >
        <Button
          class="lg:hidden"
          icon="pi pi-bars"
          severity="secondary"
          variant="text"
          aria-label="Buka menu"
          :aria-expanded="drawerOpen"
          data-testid="menu-toggle"
          @click="drawerOpen = true"
        />
        <div v-if="session.user" class="ml-auto min-w-0 text-right leading-tight">
          <p class="truncate text-sm font-medium">{{ session.user.name }}</p>
          <p class="truncate text-xs text-surface-500">{{ roleLabel(session.user.role) }}</p>
        </div>
        <Button
          icon="pi pi-key"
          severity="secondary"
          variant="text"
          aria-label="Ganti password"
          title="Ganti password"
          data-testid="change-password"
          @click="router.push(PATHS.changePassword)"
        />
        <Button
          icon="pi pi-sign-out"
          severity="secondary"
          variant="text"
          aria-label="Keluar"
          title="Keluar"
          data-testid="logout"
          @click="logout"
        />
      </header>

      <main class="min-w-0 flex-1 p-4 lg:p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
