<script setup lang="ts">
import Password from 'primevue/password'
import FormField from '@/components/FormField.vue'

/** Field password dengan label, tombol lihat/sembunyikan, dan pesan error. */
defineProps<{
  id: string
  label: string
  error?: string
  /** `current-password` untuk password yang sedang dipakai, `new-password` untuk yang baru. */
  autocomplete: 'current-password' | 'new-password'
  hint?: string
}>()

const value = defineModel<string>({ required: true })
</script>

<template>
  <FormField :id="id" v-slot="field" :label="label" :error="error">
    <Password
      v-model="value"
      :input-id="field.id"
      :input-props="{ autocomplete, 'aria-describedby': field.describedBy }"
      :invalid="field.invalid"
      :feedback="false"
      toggle-mask
      fluid
    />
    <small v-if="hint" class="text-surface-500">{{ hint }}</small>
  </FormField>
</template>
