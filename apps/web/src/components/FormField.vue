<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Dipakai sebagai id input, supaya label dan pesan error terhubung dengannya. */
  id: string
  label: string
  error?: string
}>()

const labelId = computed(() => `${props.id}-label`)
const errorId = computed(() => `${props.id}-error`)
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :id="labelId" :for="id" class="text-sm font-medium">{{ label }}</label>
    <!--
      `labelId` untuk kontrol yang bukan elemen input asli (mis. Select), yang tidak
      terhubung lewat atribut `for` dan perlu `aria-labelledby`.
    -->
    <slot
      :id="id"
      :label-id="labelId"
      :invalid="Boolean(error)"
      :described-by="error ? errorId : undefined"
    />
    <small v-if="error" :id="errorId" role="alert" class="text-red-600">{{ error }}</small>
  </div>
</template>
