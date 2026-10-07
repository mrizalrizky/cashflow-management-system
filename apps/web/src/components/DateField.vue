<script setup lang="ts">
import { computed } from 'vue'
import DatePicker from 'primevue/datepicker'
import { fromLocalDate, toLocalDate } from '@/lib/format'

/** Pemilih tanggal kalender. Nilainya `YYYY-MM-DD` atau null, tanpa pengaruh zona waktu. */
defineProps<{
  id: string
  invalid?: boolean
  placeholder?: string
  /** Nama untuk pembaca layar bila kolom ini tidak punya label yang terlihat. */
  ariaLabel?: string
}>()

const model = defineModel<string | null>({ required: true })

const date = computed(() => toLocalDate(model.value))

function onPick(value: Date | Date[] | (Date | null)[] | null | undefined): void {
  model.value = value instanceof Date ? fromLocalDate(value) : null
}
</script>

<template>
  <DatePicker
    :model-value="date"
    :input-id="id"
    date-format="dd M yy"
    :invalid="invalid"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    show-icon
    show-button-bar
    fluid
    @update:model-value="onPick"
  />
</template>
