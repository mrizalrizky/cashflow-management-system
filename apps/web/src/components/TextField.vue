<script setup lang="ts">
import InputText from 'primevue/inputtext'
import FormField from '@/components/FormField.vue'

/** Field teks satu baris dengan label dan pesan error. */
defineProps<{
  id: string
  label: string
  error?: string
  type?: 'text' | 'email'
  autocomplete?: string
}>()

const value = defineModel<string>({ required: true })
</script>

<template>
  <FormField :id="id" v-slot="field" :label="label" :error="error">
    <InputText
      :id="field.id"
      v-model="value"
      :type="type ?? 'text'"
      :autocomplete="autocomplete"
      :invalid="field.invalid"
      :aria-describedby="field.describedBy"
      fluid
    />
  </FormField>
</template>
