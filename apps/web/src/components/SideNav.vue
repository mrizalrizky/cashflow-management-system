<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { MenuItem } from '@/router/navigation'

defineProps<{ items: MenuItem[] }>()
defineEmits<{ navigate: [] }>()
</script>

<template>
  <nav aria-label="Menu utama" class="flex flex-col gap-1">
    <!-- RouterLink menambahkan aria-current="page" sendiri pada halaman yang sedang dibuka. -->
    <RouterLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-surface-700 hover:bg-surface-100"
      active-class="bg-primary-50 font-medium text-primary-700"
      @click="$emit('navigate')"
    >
      <i :class="item.icon" aria-hidden="true" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>
