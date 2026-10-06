<script setup lang="ts">
import { reactive, watch } from 'vue'
import Password from 'primevue/password'
import type { User } from '@/api/types'
import { resetUserPassword } from '@/api/users'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { collectErrors, newPassword } from '@/lib/validation'

const props = defineProps<{ user: User | null }>()
const emit = defineEmits<{ saved: [user: User] }>()
const visible = defineModel<boolean>('visible', { required: true })

const form = reactive({ newPassword: '' })

watch(visible, (open) => {
  if (open) form.newPassword = ''
})

let saved: User | null = null
const { submitting, fieldErrors, formError, submit } = useFormSubmit(async () => {
  saved = await resetUserPassword(props.user!.id, form.newPassword)
})

async function onSubmit(): Promise<void> {
  const succeeded = await submit(
    collectErrors(form, { newPassword: newPassword('Password sementara') }),
  )
  if (!succeeded || !saved) return
  emit('saved', saved)
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
    <FormField
      id="reset-password"
      v-slot="field"
      label="Password sementara"
      :error="fieldErrors.newPassword"
    >
      <Password
        v-model="form.newPassword"
        :input-id="field.id"
        :input-props="{ autocomplete: 'new-password', 'aria-describedby': field.describedBy }"
        :invalid="field.invalid"
        :feedback="false"
        toggle-mask
        fluid
      />
    </FormField>
  </FormDialog>
</template>
