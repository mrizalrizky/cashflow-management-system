<script setup lang="ts">
import type { Role, User } from '@/api/types'
import { createUser, updateUser, type CreateUserInput } from '@/api/users'
import FormDialog from '@/components/FormDialog.vue'
import PasswordField from '@/components/PasswordField.vue'
import SelectField from '@/components/SelectField.vue'
import TextField from '@/components/TextField.vue'
import { useEntityDialog } from '@/composables/useEntityDialog'
import { omit } from '@/lib/changes'
import { ROLE_OPTIONS } from '@/lib/labels'
import { collectErrors, email, newPassword, required } from '@/lib/validation'

const props = defineProps<{
  /** User yang diedit; null berarti membuat user baru. */
  user: User | null
}>()
const emit = defineEmits<{ saved: [user: User] }>()
const visible = defineModel<boolean>('visible', { required: true })

interface Form {
  name: string
  email: string
  role: Role | null
  password: string
}

const { form, editing, submitting, fieldErrors, formError, onSubmit } = useEntityDialog<
  User,
  Form,
  CreateUserInput
>({
  visible,
  entity: () => props.user,
  blank: () => ({ name: '', email: '', role: null, password: '' }),
  fromEntity: (user) => ({ name: user.name, email: user.email, role: user.role, password: '' }),
  toInput: (values) => ({
    name: values.name.trim(),
    // API menyimpan email dalam huruf kecil, jadi beda huruf besar saja bukan perubahan.
    email: values.email.trim().toLowerCase(),
    role: values.role!,
    password: values.password,
  }),
  validate: (values, isEditing) =>
    collectErrors(values, {
      name: [required('Nama')],
      email: [required('Email'), email()],
      role: [(value) => (value ? null : 'Peran wajib diisi')],
      // Password hanya diisi saat membuat; mengubahnya lewat "Reset password".
      password: isEditing ? [] : newPassword('Password sementara'),
    }),
  create: createUser,
  update: (user, changes) => updateUser(user.id, omit(changes, 'password')),
  onSaved: (user) => emit('saved', user),
  // API menjawab email kembar dengan 409 tanpa rincian field.
  fieldForStatus: { 409: 'email' },
})
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    :title="editing ? 'Ubah pengguna' : 'Tambah pengguna'"
    :submitting="submitting"
    :form-error="formError"
    @submit="onSubmit"
  >
    <TextField
      id="user-name"
      v-model="form.name"
      label="Nama"
      :error="fieldErrors.name"
    />
    <TextField
      id="user-email"
      v-model="form.email"
      label="Email"
      type="email"
      :error="fieldErrors.email"
    />
    <SelectField
      id="user-role"
      v-model="form.role"
      label="Peran"
      :options="ROLE_OPTIONS"
      placeholder="Pilih peran"
      :error="fieldErrors.role"
    />

    <PasswordField
      v-if="!editing"
      id="user-password"
      v-model="form.password"
      label="Password sementara"
      autocomplete="new-password"
      hint="Pengguna wajib menggantinya saat login pertama."
      :error="fieldErrors.password"
    />
  </FormDialog>
</template>
