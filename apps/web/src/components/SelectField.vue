<script setup lang="ts" generic="T extends string | boolean">
import Select from 'primevue/select'
import FormField from '@/components/FormField.vue'
import type { Option } from '@/lib/labels'

/** Dropdown pilihan tunggal dengan label dan pesan error. */
defineProps<{
  id: string
  label: string
  error?: string
  options: Option<T>[]
  placeholder?: string
  /** Pilihannya masih dimuat. */
  loading?: boolean
}>()

const value = defineModel<T | null>({ required: true })
</script>

<template>
  <FormField :id="id" v-slot="field" :label="label" :error="error">
    <Select
      v-model="value"
      :options="options"
      option-label="label"
      option-value="value"
      :placeholder="placeholder"
      :loading="loading"
      :invalid="field.invalid"
      :aria-labelledby="field.labelId"
      fluid
    />
  </FormField>
</template>
