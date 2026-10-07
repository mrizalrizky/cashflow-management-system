<script setup lang="ts">
import { computed } from 'vue'
import type { TxType } from '@/api/types'
import { formatRupiah } from '@/lib/money'

const props = withDefaults(
  defineProps<{
    type: TxType
    /** String digit. */
    amount: string
    /** `false` bila transaksi tidak (atau belum) dihitung dalam saldo, mis. masih menunggu. */
    counted?: boolean
  }>(),
  { counted: true },
)

const text = computed(() => `${props.type === 'IN' ? '+' : '-'}${formatRupiah(props.amount)}`)
const tone = computed(() => {
  if (!props.counted) return 'text-surface-500'
  return props.type === 'IN' ? 'text-green-700' : 'text-red-700'
})
</script>

<template>
  <span
    class="font-medium whitespace-nowrap tabular-nums"
    :class="tone"
    :title="counted ? undefined : 'Belum dihitung dalam saldo'"
  >
    {{ text }}
  </span>
</template>
