<script setup lang="ts">
import { reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import FormAlert from '@/components/FormAlert.vue'
import FormField from '@/components/FormField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { collectErrors, email, required } from '@/lib/validation'
import { postLoginPath } from '@/router/guards'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const form = reactive({ email: '', password: '' })
const { submitting, fieldErrors, formError, submit } = useFormSubmit(() =>
  session.login(form.email, form.password),
)

async function onSubmit(): Promise<void> {
  const loggedIn = await submit(
    collectErrors(form, {
      email: [required('Email'), email()],
      password: [required('Password')],
    }),
  )
  if (loggedIn && session.user) {
    await router.replace(postLoginPath(session.user, route.query.redirect))
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
    <h1 class="text-lg font-semibold">Masuk</h1>
    <FormAlert :message="formError" />

    <FormField id="email" v-slot="field" label="Email" :error="fieldErrors.email">
      <InputText
        :id="field.id"
        v-model="form.email"
        type="email"
        autocomplete="username"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
        fluid
      />
    </FormField>

    <FormField id="password" v-slot="field" label="Password" :error="fieldErrors.password">
      <Password
        v-model="form.password"
        :input-id="field.id"
        :input-props="{ autocomplete: 'current-password', 'aria-describedby': field.describedBy }"
        :invalid="field.invalid"
        :feedback="false"
        toggle-mask
        fluid
      />
    </FormField>

    <Button type="submit" label="Masuk" :loading="submitting" :disabled="submitting" fluid />
  </form>
</template>
