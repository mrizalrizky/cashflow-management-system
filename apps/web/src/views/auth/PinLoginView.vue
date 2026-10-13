<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import { pinStatus } from '@/api/auth'
import { ApiError } from '@/api/http'
import FormAlert from '@/components/FormAlert.vue'
import PinField from '@/components/PinField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { pinRules } from '@/lib/pin'
import { collectErrors } from '@/lib/validation'
import { postLoginPath } from '@/router/guards'
import { PATHS } from '@/router/paths'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const form = reactive({ pin: '' })
const { submitting, fieldErrors, formError, submit } = useFormSubmit(() => session.login(form.pin))

onMounted(async () => {
  try {
    // Belum ada PIN (pemasangan baru, atau baru direset): buat dulu.
    if (!(await pinStatus()).pinSet) await router.replace(PATHS.setupPin)
  } catch {
    // Server tidak terjangkau: form tetap tampil; pesannya muncul saat mencoba masuk.
  }
})

async function onSubmit(): Promise<void> {
  const result = await submit(collectErrors(form, { pin: pinRules('PIN') }))
  if (result.ok) {
    await router.replace(postLoginPath(route.query.redirect))
  } else if (result.error instanceof ApiError && result.error.statusCode === 409) {
    // PIN belum ada (mis. baru direset di server setelah halaman ini dibuka): buat dulu.
    await router.replace(PATHS.setupPin)
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <h1 class="text-lg font-semibold">Masuk</h1>
    <FormAlert :message="formError" />
    <PinField id="pin" v-model="form.pin" label="PIN" autocomplete="current-password" :error="fieldErrors.pin" />
    <Button type="submit" label="Masuk" :loading="submitting" :disabled="submitting" fluid />
  </form>
</template>
