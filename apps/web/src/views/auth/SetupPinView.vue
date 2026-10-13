<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import { pinStatus } from '@/api/auth'
import { ApiError } from '@/api/http'
import FormAlert from '@/components/FormAlert.vue'
import PinField from '@/components/PinField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useNotify } from '@/composables/useNotify'
import { pinRules } from '@/lib/pin'
import { collectErrors } from '@/lib/validation'
import { postLoginPath } from '@/router/guards'
import { PATHS } from '@/router/paths'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const notify = useNotify()

/** PIN sudah ada (dibuat di tab atau perangkat lain): ke halaman masuk, dengan alasannya. */
async function toPinEntry(): Promise<void> {
  notify.warn('PIN sudah dibuat. Masuk dengan PIN itu.')
  await router.replace(PATHS.login)
}

onMounted(async () => {
  try {
    if ((await pinStatus()).pinSet) await toPinEntry()
  } catch {
    // Server tidak terjangkau: form tetap tampil; pesannya muncul saat mencoba menyimpan.
  }
})

const form = reactive({ pin: '', pinConfirm: '' })
const { submitting, fieldErrors, formError, submit } = useFormSubmit(() => session.setupPin(form.pin))

async function onSubmit(): Promise<void> {
  const errors = collectErrors(form, { pin: pinRules('PIN') })
  if (!errors.pin && form.pinConfirm !== form.pin) errors.pinConfirm = 'PIN tidak sama'
  const result = await submit(errors)
  if (result.ok) {
    await router.replace(postLoginPath())
  } else if (result.error instanceof ApiError && result.error.statusCode === 409) {
    // Tab lain sudah membuat PIN lebih dulu.
    await toPinEntry()
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <h1 class="text-lg font-semibold">Buat PIN</h1>
    <p class="text-sm text-surface-600">
      PIN dipakai setiap kali Anda membuka aplikasi. 6 sampai 12 angka.
    </p>
    <FormAlert :message="formError" />
    <PinField id="pin" v-model="form.pin" label="PIN" autocomplete="new-password" :error="fieldErrors.pin" />
    <PinField
      id="pin-confirm"
      v-model="form.pinConfirm"
      label="Ulangi PIN"
      autocomplete="new-password"
      :error="fieldErrors.pinConfirm"
    />
    <Button type="submit" label="Simpan PIN" :loading="submitting" :disabled="submitting" fluid />
  </form>
</template>
