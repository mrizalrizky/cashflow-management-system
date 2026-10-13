<script setup lang="ts">
import Textarea from 'primevue/textarea'
import FormField from '@/components/FormField.vue'
import { ANSWER_MAX } from '@/lib/wishlist'

/** Satu pertanyaan wishlist: teks bebas sampai 1.000 karakter, dengan penghitungnya. */
defineProps<{
  id: string
  label: string
  error?: string
}>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <FormField :id="id" v-slot="field" :label="label" :error="error">
    <Textarea
      :id="field.id"
      v-model="model"
      rows="2"
      :maxlength="ANSWER_MAX"
      :invalid="field.invalid"
      :aria-describedby="field.describedBy"
      auto-resize
      fluid
    />
    <small class="self-end text-surface-500" :data-testid="`${id}-count`">{{ model.length }}/{{ ANSWER_MAX }}</small>
  </FormField>
</template>
