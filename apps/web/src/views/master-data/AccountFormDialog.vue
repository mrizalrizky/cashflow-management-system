<script setup lang="ts">
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import { createAccount, updateAccount, type CreateAccountInput } from '@/api/accounts'
import type { Account, AccountType } from '@/api/types'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import { useEntityDialog } from '@/composables/useEntityDialog'
import { ACCOUNT_TYPE_OPTIONS } from '@/lib/labels'
import { collectErrors, money, required } from '@/lib/validation'

const props = defineProps<{
  /** Akun yang diubah; null berarti membuat akun baru. */
  account: Account | null
}>()
const emit = defineEmits<{ saved: [account: Account] }>()
const visible = defineModel<boolean>('visible', { required: true })

interface Form {
  name: string
  type: AccountType | null
  openingBalance: string
}

const { form, editing, submitting, fieldErrors, formError, onSubmit } = useEntityDialog<
  Account,
  Form,
  CreateAccountInput
>({
  visible,
  entity: () => props.account,
  blank: () => ({ name: '', type: null, openingBalance: '' }),
  fromEntity: (account) => ({
    name: account.name,
    type: account.type,
    openingBalance: account.openingBalance,
  }),
  toInput: (values) => ({
    name: values.name.trim(),
    type: values.type!,
    openingBalance: values.openingBalance || '0',
  }),
  validate: (values) =>
    collectErrors(values, {
      name: [required('Nama')],
      type: [(value) => (value ? null : 'Jenis wajib diisi')],
      openingBalance: [money('Saldo awal', { required: false, allowNegative: true })],
    }),
  create: createAccount,
  update: (account, changes) => updateAccount(account.id, changes),
  onSaved: (account) => emit('saved', account),
  // API menjawab nama kembar dengan 409 tanpa rincian field.
  fieldForStatus: { 409: 'name' },
})
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    :title="editing ? 'Ubah akun' : 'Tambah akun'"
    :submitting="submitting"
    :form-error="formError"
    @submit="onSubmit"
  >
    <FormField id="account-name" v-slot="field" label="Nama" :error="fieldErrors.name">
      <InputText
        :id="field.id"
        v-model="form.name"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
        fluid
      />
    </FormField>

    <FormField id="account-type" v-slot="field" label="Jenis" :error="fieldErrors.type">
      <Select
        v-model="form.type"
        :options="ACCOUNT_TYPE_OPTIONS"
        option-label="label"
        option-value="value"
        placeholder="Pilih jenis"
        :invalid="field.invalid"
        :aria-labelledby="field.labelId"
        fluid
      />
    </FormField>

    <FormField
      id="account-opening"
      v-slot="field"
      label="Saldo awal (Rp)"
      :error="fieldErrors.openingBalance"
    >
      <MoneyInput
        :id="field.id"
        v-model="form.openingBalance"
        allow-negative
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
      />
      <small class="text-surface-500">Boleh minus bila rekening sedang minus. Kosong berarti 0.</small>
    </FormField>
  </FormDialog>
</template>
