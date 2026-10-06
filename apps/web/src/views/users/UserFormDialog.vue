<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import type { Role, User } from '@/api/types'
import { createUser, updateUser, type UpdateUserInput } from '@/api/users'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import PasswordField from '@/components/PasswordField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { ROLE_OPTIONS } from '@/lib/labels'
import { collectErrors, email, newPassword, required } from '@/lib/validation'

const props = defineProps<{
  /** User yang diedit; null berarti membuat user baru. */
  user: User | null
}>()
const emit = defineEmits<{ saved: [user: User] }>()
const visible = defineModel<boolean>('visible', { required: true })

const editing = computed(() => props.user !== null)
const form = reactive({ name: '', email: '', role: null as Role | null, password: '' })

function changedFields(user: User): UpdateUserInput {
  const changes: UpdateUserInput = {}
  if (form.name.trim() !== user.name) changes.name = form.name.trim()
  // API menyimpan email dalam huruf kecil, jadi beda huruf besar saja bukan perubahan.
  if (form.email.trim().toLowerCase() !== user.email) changes.email = form.email.trim()
  if (form.role && form.role !== user.role) changes.role = form.role
  return changes
}

/** Mengembalikan user yang tersimpan, atau null bila tidak ada yang berubah. */
async function save(): Promise<User | null> {
  if (!props.user) {
    return createUser({
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role!,
      password: form.password,
    })
  }
  const changes = changedFields(props.user)
  return Object.keys(changes).length > 0 ? updateUser(props.user.id, changes) : null
}

// API menjawab email kembar dengan 409 tanpa rincian field.
const { submitting, fieldErrors, formError, submit, reset } = useFormSubmit(save, {
  fieldForStatus: { 409: 'email' },
})

// Tiap kali dibuka, formulir diisi ulang dan pesan error dari pembukaan sebelumnya dibuang.
watch(
  visible,
  (open) => {
    if (!open) return
    form.name = props.user?.name ?? ''
    form.email = props.user?.email ?? ''
    form.role = props.user?.role ?? null
    form.password = ''
    reset()
  },
  { immediate: true },
)

async function onSubmit(): Promise<void> {
  const result = await submit(
    collectErrors(form, {
      name: [required('Nama')],
      email: [required('Email'), email()],
      role: [(value) => (value ? null : 'Peran wajib diisi')],
      password: editing.value ? [] : newPassword('Password sementara'),
    }),
  )
  if (!result.ok) return
  if (result.value) emit('saved', result.value)
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
        :options="ROLE_OPTIONS"
        option-label="label"
        option-value="value"
        placeholder="Pilih peran"
        :invalid="field.invalid"
        :aria-labelledby="field.labelId"
        fluid
      />
    </FormField>

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
