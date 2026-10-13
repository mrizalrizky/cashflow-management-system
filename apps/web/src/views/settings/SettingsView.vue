<script setup lang="ts">
import { reactive } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import FormAlert from '@/components/FormAlert.vue'
import PageHeader from '@/components/PageHeader.vue'
import PinField from '@/components/PinField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useNotify } from '@/composables/useNotify'
import { pinRules } from '@/lib/pin'
import { collectErrors } from '@/lib/validation'
import { PATHS } from '@/router/paths'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const notify = useNotify()

const blank = () => ({ currentPin: '', newPin: '', newPinConfirm: '' })
const form = reactive(blank())
const { submitting, fieldErrors, formError, submit } = useFormSubmit(() =>
  session.changePin(form.currentPin, form.newPin),
)

async function onSubmit(): Promise<void> {
  const errors = collectErrors(form, {
    currentPin: pinRules('PIN saat ini'),
    newPin: pinRules('PIN baru'),
  })
  if (!errors.newPin && form.newPinConfirm !== form.newPin) errors.newPinConfirm = 'PIN tidak sama'
  const result = await submit(errors)
  if (result.ok) {
    Object.assign(form, blank())
    notify.success('PIN diganti. Perangkat lain sudah dikeluarkan.')
  }
}
</script>

<template>
  <PageHeader title="Pengaturan" />

  <div class="grid gap-6 lg:grid-cols-2">
    <section class="rounded-xl border border-surface-200 bg-surface-0 p-4">
      <h2 class="mb-3 text-lg font-semibold">Ganti PIN</h2>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
        <FormAlert :message="formError" />
        <PinField
          id="current-pin"
          v-model="form.currentPin"
          label="PIN saat ini"
          autocomplete="current-password"
          :error="fieldErrors.currentPin"
        />
        <PinField
          id="new-pin"
          v-model="form.newPin"
          label="PIN baru"
          autocomplete="new-password"
          :error="fieldErrors.newPin"
        />
        <PinField
          id="new-pin-confirm"
          v-model="form.newPinConfirm"
          label="Ulangi PIN baru"
          autocomplete="new-password"
          :error="fieldErrors.newPinConfirm"
        />
        <Button
          type="submit"
          label="Simpan PIN"
          :loading="submitting"
          :disabled="submitting"
          class="self-start"
        />
      </form>
    </section>

    <section class="rounded-xl border border-surface-200 bg-surface-0 p-4">
      <h2 class="mb-3 text-lg font-semibold">Riwayat perubahan</h2>
      <p class="mb-3 text-sm text-surface-600">
        Semua perubahan data dan setiap kali masuk tercatat di log audit.
      </p>
      <RouterLink :to="PATHS.auditLog" class="font-medium text-primary-700 hover:underline">
        Buka log audit
      </RouterLink>
    </section>
  </div>
</template>
