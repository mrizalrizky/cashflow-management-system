<script setup lang="ts">
import { computed } from 'vue'
import MoneyText from '@/components/MoneyText.vue'

const TONES = { plain: '', income: 'text-green-700', expense: 'text-red-700' } as const

/** Satu angka ringkasan dengan labelnya. Isi tambahan (mis. batang kemajuan) lewat slot. */
const props = defineProps<{
  label: string
  /** String digit; boleh diawali `-`. */
  amount: string
  hint?: string
  tone?: keyof typeof TONES
}>()

// Nominal negatif diwarnai `MoneyText` sendiri, apa pun jenis kartunya.
const toneClass = computed(() =>
  props.amount.startsWith('-') ? '' : TONES[props.tone ?? 'plain'],
)
</script>

<template>
  <div class="min-w-0 rounded-xl border border-surface-200 bg-surface-0 p-4">
    <p class="text-sm text-surface-500">{{ label }}</p>
    <p class="text-xl font-semibold" :class="toneClass" data-testid="stat-amount">
      <MoneyText :amount="amount" />
    </p>
    <p v-if="hint" class="text-sm text-surface-500">{{ hint }}</p>
    <slot />
  </div>
</template>
