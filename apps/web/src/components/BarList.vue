<script setup lang="ts">
import { computed } from 'vue'
import MoneyText from '@/components/MoneyText.vue'
import { largest, shareOf } from '@/lib/shares'

const TONES = { expense: 'bg-red-400', neutral: 'bg-primary-400' } as const

/**
 * Daftar nominal dengan batang sebanding terhadap yang terbesar, mis. pengeluaran per
 * kategori. Angkanya selalu tertulis; batang hanya penegas dan disembunyikan dari pembaca layar.
 */
const props = defineProps<{
  items: { id: string; name: string; amount: string }[]
  emptyText: string
  tone?: keyof typeof TONES
}>()

const top = computed(() => largest(props.items.map((item) => item.amount)))
const rows = computed(() =>
  props.items.map((item) => ({ ...item, share: shareOf(item.amount, top.value) })),
)
</script>

<template>
  <p v-if="items.length === 0" class="text-surface-500">{{ emptyText }}</p>
  <ul v-else class="flex flex-col gap-3">
    <li v-for="row in rows" :key="row.id">
      <div class="flex items-baseline justify-between gap-3">
        <span class="min-w-0 truncate">{{ row.name }}</span>
        <MoneyText :amount="row.amount" class="font-medium" />
      </div>
      <div class="mt-1 h-2 rounded-full bg-surface-100">
        <div
          v-if="row.share > 0"
          class="h-2 rounded-full"
          :class="TONES[tone ?? 'neutral']"
          :style="{ width: `${row.share}%` }"
          aria-hidden="true"
          data-testid="bar"
        />
      </div>
    </li>
  </ul>
</template>
