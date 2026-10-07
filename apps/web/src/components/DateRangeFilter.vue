<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DateField from '@/components/DateField.vue'

export interface DateRange {
  from?: string
  to?: string
}

/**
 * Dua tanggal untuk menyaring sebuah daftar. Rentang yang terbalik (awal setelah akhir) tidak
 * diteruskan sebagai filter; pengguna diberi tahu di bawah kolomnya.
 */
defineProps<{
  /** Awalan id kedua kolom, supaya unik di halaman. */
  idPrefix: string
}>()

const range = defineModel<DateRange>({ required: true })

const from = ref<string | null>(range.value.from ?? null)
const to = ref<string | null>(range.value.to ?? null)
// Tanggal kalender `YYYY-MM-DD` bisa dibandingkan langsung sebagai teks.
const backwards = computed(() => from.value !== null && to.value !== null && from.value > to.value)

watch([from, to], () => {
  range.value = backwards.value ? {} : { from: from.value ?? undefined, to: to.value ?? undefined }
})

/** Mengosongkan kedua tanggal, mis. saat semua filter direset. */
function clear(): void {
  from.value = null
  to.value = null
}

defineExpose({ clear })
</script>

<template>
  <div>
    <div class="grid grid-cols-2 gap-2">
      <DateField
        :id="`${idPrefix}-from`"
        v-model="from"
        :invalid="backwards"
        placeholder="Dari tanggal"
        aria-label="Dari tanggal"
      />
      <DateField
        :id="`${idPrefix}-to`"
        v-model="to"
        :invalid="backwards"
        placeholder="Sampai tanggal"
        aria-label="Sampai tanggal"
      />
    </div>
    <small v-if="backwards" role="alert" class="text-red-600">
      Tanggal awal tidak boleh setelah tanggal akhir
    </small>
  </div>
</template>
