<script setup lang="ts" generic="T extends string | boolean">
import Select from 'primevue/select'
import type { Option } from '@/lib/labels'

/** Dropdown filter yang bisa dikosongkan; kosong berarti "semua". */
defineProps<{ options: Option<T>[]; placeholder: string; label: string }>()

const model = defineModel<T | null | undefined>({ required: true })
</script>

<template>
  <Select
    v-model="model"
    :options="options"
    option-label="label"
    option-value="value"
    :placeholder="placeholder"
    :aria-label="label"
    show-clear
    fluid
  />
</template>
