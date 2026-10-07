<script setup lang="ts">
import { computed } from 'vue'
import { formatRupiah } from '@/lib/money'

/** Sebuah nominal. Yang negatif selalu bertanda minus dan berwarna merah. */
const props = defineProps<{
  /** String digit; boleh diawali `-`. */
  amount: string
  /** Beri tanda `+` pada nominal positif, mis. untuk selisih. */
  signed?: boolean
}>()

const negative = computed(() => props.amount.startsWith('-'))
const text = computed(() => {
  const plus = props.signed && !negative.value && /[1-9]/.test(props.amount)
  return `${plus ? '+' : ''}${formatRupiah(props.amount)}`
})
</script>

<template>
  <span class="whitespace-nowrap tabular-nums" :class="{ 'text-red-600': negative }">{{ text }}</span>
</template>
