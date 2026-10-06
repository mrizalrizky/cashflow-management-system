<script setup lang="ts">
import { reactive, watch } from 'vue'
import type { User } from '@/api/types'
import { resetUserPassword } from '@/api/users'
import FormDialog from '@/components/FormDialog.vue'
import PasswordField from '@/components/PasswordField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { collectErrors, newPassword } from '@/lib/validation'

const props = defineProps<{ user: User | null }>()
const emit = defineEmits<{ saved: [user: User] }>()
const visible = defineModel<boolean>('visible', { required: true })

const form = reactive({ newPassword: '' })
const { submitting, fieldErrors, formError, submit, reset } = useFormSubmit(() =>
  resetUserPassword(props.user!.id, form.newPassword),
)

watch(visible, (open) => {
  if (!open) return
  form.newPassword = ''
  reset()
})

async function onSubmit(): Promise<void> {
  const result = await submit(
    collectErrors(form, { newPassword: newPassword('Password sementara') }),
  )
  if (!result.ok) return
  emit('saved', result.value)
  visible.value = false
}
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    title="Reset password"
    submit-label="Reset password"
    :submitting="submitting"
    :form-error="formError"
    @submit="onSubmit"
  >
    <p class="text-sm text-surface-600">
      Buat password sementara untuk <strong>{{ user?.name }}</strong
      >. Semua sesinya diakhiri dan ia wajib menggantinya saat login berikutnya.
    </p>
    <PasswordField
      id="reset-password"
      v-model="form.newPassword"
      label="Password sementara"
      autocomplete="new-password"
      :error="fieldErrors.newPassword"
    />
  </FormDialog>
</template>
