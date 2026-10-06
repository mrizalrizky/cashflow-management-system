<script setup lang="ts">
import { APP_NAME } from '@/lib/app'
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-surface-50 p-4">
    <div class="w-full max-w-sm">
      <p class="mb-6 text-center text-xl font-semibold">{{ APP_NAME }}</p>
      <div class="rounded-xl border border-surface-200 bg-surface-0 p-6 shadow-sm">
        <slot />
      </div>
    </div>
  </div>
</template>
