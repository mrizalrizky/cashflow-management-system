<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Textarea from 'primevue/textarea'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'

const MAX_LENGTH = 500

/**
 * Dialog untuk tindakan yang wajib disertai alasan (menolak, membatalkan, void). `submit`
 * menjalankan tindakannya; bila gagal, pesannya tampil di dialog dan alasannya tetap ada.
 */
const props = defineProps<{
  title: string
  /** Nama isiannya, mis. "Alasan penolakan". */
  label: string
  confirmLabel: string
  /** Keterangan tambahan tentang akibat tindakan ini. */
  note?: string
  submit: (reason: string) => Promise<unknown>
}>()

const visible = defineModel<boolean>('visible', { required: true })

const reason = ref('')
const trimmed = computed(() => reason.value.trim())

const { submitting, fieldErrors, formError, submit, reset } = useFormSubmit(() =>
  props.submit(trimmed.value),
)

watch(visible, (open) => {
  if (!open) return
  reason.value = ''
  reset()
})

function validate(): Record<string, string> {
  if (!trimmed.value) return { reason: `${props.label} wajib diisi` }
  if (trimmed.value.length > MAX_LENGTH) {
    return { reason: `${props.label} maksimal ${MAX_LENGTH} karakter` }
  }
  return {}
}

async function onSubmit(): Promise<void> {
  const result = await submit(validate())
  if (result.ok) visible.value = false
}
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    :title="title"
    :submitting="submitting"
    :form-error="formError"
    :submit-label="confirmLabel"
    @submit="onSubmit"
  >
    <p v-if="note" class="text-sm text-surface-600">{{ note }}</p>
    <FormField id="reason-text" v-slot="field" :label="label" :error="fieldErrors.reason">
      <Textarea
        :id="field.id"
        v-model="reason"
        rows="3"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
        fluid
      />
      <small class="text-right text-surface-500">{{ trimmed.length }}/{{ MAX_LENGTH }}</small>
    </FormField>
  </FormDialog>
</template>
