<script setup lang="ts">
import Button from 'primevue/button'
import type { Period } from '@/api/types'
import DateField from '@/components/DateField.vue'
import FormField from '@/components/FormField.vue'
import { todayInJakarta } from '@/lib/calendar'
import { PERIOD_PRESETS, samePeriod } from '@/lib/periods'

/**
 * Memilih periode laporan: lewat pilihan cepat, atau dengan dua tanggal. Tanggal yang
 * dikosongkan diserahkan kepada bawaan API; `resolved` adalah periode yang benar-benar dipakai.
 */
const props = defineProps<{
  resolved: Period | null
  /** Pesan per field (`from`, `to`). */
  errors: Record<string, string>
}>()

const period = defineModel<Partial<Period>>({ required: true })

function isActive(range: Partial<Period>): boolean {
  return samePeriod(range, period.value)
}

function setDate(field: keyof Period, value: string | null): void {
  period.value = { ...period.value, [field]: value ?? undefined }
}

/** Tanggal yang dipilih; bila belum, tanggal yang dipakai API. */
function shown(field: keyof Period): string | null {
  return period.value[field] ?? props.resolved?.[field] ?? null
}
</script>

<template>
  <div class="mb-4 flex flex-col gap-3">
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="preset in PERIOD_PRESETS"
        :key="preset.id"
        :label="preset.label"
        size="small"
        :severity="isActive(preset.range(todayInJakarta())) ? 'primary' : 'secondary'"
        :aria-pressed="isActive(preset.range(todayInJakarta()))"
        :data-testid="`preset-${preset.id}`"
        @click="period = preset.range(todayInJakarta())"
      />
    </div>
    <div class="grid max-w-md grid-cols-2 gap-3">
      <FormField id="period-from" v-slot="field" label="Dari tanggal" :error="errors.from">
        <DateField
          :id="field.id"
          :model-value="shown('from')"
          :invalid="field.invalid"
          @update:model-value="setDate('from', $event)"
        />
      </FormField>
      <FormField id="period-to" v-slot="field" label="Sampai tanggal" :error="errors.to">
        <DateField
          :id="field.id"
          :model-value="shown('to')"
          :invalid="field.invalid"
          @update:model-value="setDate('to', $event)"
        />
      </FormField>
    </div>
  </div>
</template>
