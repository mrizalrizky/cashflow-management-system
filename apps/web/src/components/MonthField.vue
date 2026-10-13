<script setup lang="ts">
import { computed } from 'vue'
import DatePicker from 'primevue/datepicker'

/** Pemilih bulan. Nilainya `YYYY-MM` atau null, tanpa pengaruh zona waktu. */
defineOptions({ name: 'MonthField' })
defineProps<{
  id: string
  invalid?: boolean
}>()

const model = defineModel<string | null>({ required: true })

const date = computed(() =>
  model.value ? new Date(Number(model.value.slice(0, 4)), Number(model.value.slice(5, 7)) - 1, 1) : null,
)

function onPick(value: Date | Date[] | (Date | null)[] | null | undefined): void {
  model.value =
    value instanceof Date ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}` : null
}
</script>

<template>
  <DatePicker
    :model-value="date"
    :input-id="id"
    view="month"
    date-format="MM yy"
    :invalid="invalid"
    show-icon
    fluid
    @update:model-value="onPick"
  />
</template>
