<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Select from 'primevue/select'
import type { Role, User } from '@/api/types'
import { createUser, updateUser, type UpdateUserInput } from '@/api/users'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { ROLE_OPTIONS } from '@/lib/format'
import { collectErrors, email, newPassword, required } from '@/lib/validation'

const props = defineProps<{
  /** User yang diedit; null berarti membuat user baru. */
  user: User | null
}>()
const emit = defineEmits<{ saved: [user: User] }>()
const visible = defineModel<boolean>('visible', { required: true })

const editing = computed(() => props.user !== null)
const form = reactive({ name: '', email: '', role: null as Role | null, password: '' })

// Formulir diisi ulang tiap kali dialog dibuka.
watch(
  visible,
  (open) => {
    if (!open) return
    form.name = props.user?.name ?? ''
    form.email = props.user?.email ?? ''
    form.role = props.user?.role ?? null
    form.password = ''
  },
  { immediate: true },
)

function changedFields(user: User): UpdateUserInput {
  const changes: UpdateUserInput = {}
  if (form.name.trim() !== user.name) changes.name = form.name.trim()
  if (form.email.trim().toLowerCase() !== user.email) changes.email = form.email.trim()
  if (form.role && form.role !== user.role) changes.role = form.role
  return changes
}

let saved: User | null = null

async function save(): Promise<void> {
  if (!props.user) {
    saved = await createUser({
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role!,
      password: form.password,
    })
    return
  }
  const changes = changedFields(props.user)
  saved = Object.keys(changes).length > 0 ? await updateUser(props.user.id, changes) : null
}

// API menjawab email kembar dengan 409 tanpa rincian field.
const { submitting, fieldErrors, formError, submit } = useFormSubmit(save, {
  fieldForStatus: { 409: 'email' },
})

async function onSubmit(): Promise<void> {
  const succeeded = await submit(
    collectErrors(form, {
      name: [required('Nama')],
      email: [required('Email'), email()],
      role: [(value) => (value ? null : 'Peran wajib diisi')],
      password: editing.value ? [] : newPassword('Password sementara'),
    }),
  )
  if (!succeeded) return
  if (saved) emit('saved', saved)
  visible.value = false
}
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    :title="editing ? 'Ubah pengguna' : 'Tambah pengguna'"
    :submitting="submitting"
    :form-error="formError"
    @submit="onSubmit"
  >
    <FormField id="user-name" v-slot="field" label="Nama" :error="fieldErrors.name">
      <InputText
        :id="field.id"
        v-model="form.name"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
        fluid
      />
    </FormField>

    <FormField id="user-email" v-slot="field" label="Email" :error="fieldErrors.email">
      <InputText
        :id="field.id"
        v-model="form.email"
        type="email"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
        fluid
      />
    </FormField>

    <FormField id="user-role" v-slot="field" label="Peran" :error="fieldErrors.role">
      <Select
        v-model="form.role"
        :label-id="field.id"
        :options="ROLE_OPTIONS"
        option-label="label"
        option-value="value"
        placeholder="Pilih peran"
        :invalid="field.invalid"
        fluid
      />
    </FormField>

    <FormField
      v-if="!editing"
      id="user-password"
      v-slot="field"
      label="Password sementara"
      :error="fieldErrors.password"
    >
      <Password
        v-model="form.password"
        :input-id="field.id"
        :input-props="{ autocomplete: 'new-password', 'aria-describedby': field.describedBy }"
        :invalid="field.invalid"
        :feedback="false"
        toggle-mask
        fluid
      />
      <small class="text-surface-500">Pengguna wajib menggantinya saat login pertama.</small>
    </FormField>
  </FormDialog>
</template>
