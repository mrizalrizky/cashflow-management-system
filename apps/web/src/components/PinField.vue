<script setup lang="ts">
import Password from 'primevue/password'
import FormField from '@/components/FormField.vue'

/** Field PIN: tersembunyi, papan angka di ponsel, dengan label dan pesan error. */
defineProps<{
  id: string
  label: string
  error?: string
  /** `current-password` untuk PIN yang sedang dipakai, `new-password` untuk yang baru. */
  autocomplete: 'current-password' | 'new-password'
}>()

const value = defineModel<string>({ required: true })
</script>

<template>
  <FormField :id="id" v-slot="field" :label="label" :error="error">
    <Password
      v-model="value"
      :input-id="field.id"
      :input-props="{
        autocomplete,
        inputmode: 'numeric',
        maxlength: 12,
        'aria-describedby': field.describedBy,
      }"
      :invalid="field.invalid"
      :feedback="false"
      toggle-mask
      fluid
    />
  </FormField>
</template>
