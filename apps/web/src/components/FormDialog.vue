<script setup lang="ts">
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import FormAlert from '@/components/FormAlert.vue'

/** Kerangka dialog berisi formulir: judul, pesan error umum, tombol Batal dan Simpan. */
defineProps<{
  title: string
  submitting: boolean
  formError: string | null
  submitLabel?: string
}>()
defineEmits<{ submit: [] }>()

const visible = defineModel<boolean>('visible', { required: true })
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="title"
    modal
    :draggable="false"
    :style="{ width: '28rem' }"
    :breakpoints="{ '640px': '95vw' }"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="$emit('submit')">
      <FormAlert :message="formError" />
      <slot />
      <div class="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          label="Batal"
          severity="secondary"
          variant="text"
          @click="visible = false"
        />
        <Button
          type="submit"
          :label="submitLabel ?? 'Simpan'"
          :loading="submitting"
          :disabled="submitting"
        />
      </div>
    </form>
  </Dialog>
</template>
