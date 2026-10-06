<script setup lang="ts">
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Password from 'primevue/password'
import FormAlert from '@/components/FormAlert.vue'
import FormField from '@/components/FormField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useLogout } from '@/composables/useLogout'
import { collectErrors, matches, newPassword, required } from '@/lib/validation'
import { postLoginPath } from '@/router/guards'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const logout = useLogout()

// Dicatat saat halaman dibuka: setelah berhasil, tanda wajib ganti langsung hilang dari store.
const forced = session.user?.mustChangePassword ?? false

const form = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })
const { submitting, fieldErrors, formError, submit } = useFormSubmit(() =>
  session.changePassword(form.currentPassword, form.newPassword),
)

const fields = [
  { id: 'currentPassword', label: 'Password saat ini', autocomplete: 'current-password' },
  { id: 'newPassword', label: 'Password baru', autocomplete: 'new-password' },
  { id: 'confirmPassword', label: 'Ulangi password baru', autocomplete: 'new-password' },
] as const

async function onSubmit(): Promise<void> {
  const changed = await submit(
    collectErrors(form, {
      currentPassword: [required('Password saat ini')],
      newPassword: newPassword('Password baru'),
      confirmPassword: [matches(() => form.newPassword, 'Konfirmasi password tidak sama')],
    }),
  )
  if (changed && session.user) {
    await router.replace(postLoginPath(session.user))
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <h1 class="text-lg font-semibold">Ganti password</h1>
    <Message v-if="forced" severity="info" :closable="false">
      Anda wajib mengganti password sebelum melanjutkan.
    </Message>
    <FormAlert :message="formError" />

    <FormField
      v-for="item in fields"
      :id="item.id"
      :key="item.id"
      v-slot="field"
      :label="item.label"
      :error="fieldErrors[item.id]"
    >
      <Password
        v-model="form[item.id]"
        :input-id="field.id"
        :input-props="{ autocomplete: item.autocomplete, 'aria-describedby': field.describedBy }"
        :invalid="field.invalid"
        :feedback="false"
        toggle-mask
        fluid
      />
    </FormField>

    <Button type="submit" label="Simpan password" :loading="submitting" :disabled="submitting" fluid />
    <Button
      v-if="forced"
      type="button"
      label="Keluar"
      severity="secondary"
      variant="text"
      data-testid="logout"
      fluid
      @click="logout"
    />
    <Button
      v-else
      type="button"
      label="Batal"
      severity="secondary"
      variant="text"
      fluid
      @click="router.back()"
    />
  </form>
</template>
