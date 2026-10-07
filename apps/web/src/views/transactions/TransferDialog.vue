<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import Textarea from 'primevue/textarea'
import { createTransfer } from '@/api/transactions'
import type { Transaction } from '@/api/types'
import DateField from '@/components/DateField.vue'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import SelectField from '@/components/SelectField.vue'
import { useFormSubmit } from '@/composables/useFormSubmit'
import { useNotify } from '@/composables/useNotify'
import type { TransactionOptions } from '@/composables/useTransactionOptions'
import { todayInJakarta } from '@/lib/calendar'
import type { Option } from '@/lib/labels'
import {
  amountRules,
  chosen,
  descriptionRules,
  transactionDateRules,
} from '@/lib/transaction-rules'
import { collectErrors } from '@/lib/validation'

/** Memindahkan uang antar akun. Hanya ditawarkan kepada SUPER_ADMIN; API yang membatasi. */
const props = defineProps<{ options: TransactionOptions }>()
const emit = defineEmits<{ saved: [legs: Transaction[]] }>()
const visible = defineModel<boolean>('visible', { required: true })

const notify = useNotify()

function blank() {
  return {
    fromAccountId: null as string | null,
    toAccountId: null as string | null,
    amount: '',
    transactionDate: todayInJakarta() as string | null,
    description: '',
  }
}
const form = reactive(blank())

const { submitting, fieldErrors, formError, submit, reset } = useFormSubmit(() =>
  createTransfer({
    fromAccountId: form.fromAccountId ?? '',
    toAccountId: form.toAccountId ?? '',
    amount: form.amount,
    transactionDate: form.transactionDate ?? '',
    description: form.description.trim(),
  }),
)

watch(
  visible,
  (open) => {
    if (!open) return
    Object.assign(form, blank())
    reset()
  },
  { immediate: true },
)

const accounts = computed<Option<string>[]>(() =>
  props.options.accounts.value.map((account) => ({ value: account.id, label: account.name })),
)
/** Akun asal tidak pernah bisa menjadi tujuan. */
const destinations = computed(() =>
  accounts.value.filter((account) => account.value !== form.fromAccountId),
)

function onSourceChange(accountId: string | null): void {
  if (accountId !== null && accountId === form.toAccountId) form.toAccountId = null
}

async function onSubmit(): Promise<void> {
  const result = await submit(
    collectErrors(form, {
      fromAccountId: [chosen('Akun asal')],
      toAccountId: [chosen('Akun tujuan')],
      amount: amountRules(),
      transactionDate: transactionDateRules(),
      description: descriptionRules(),
    }),
  )
  if (!result.ok) return
  notify.success('Transfer dicatat')
  emit('saved', result.value)
  visible.value = false
}
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    title="Transfer antar akun"
    :submitting="submitting"
    :form-error="formError"
    submit-label="Transfer"
    @submit="onSubmit"
  >
    <SelectField
      id="tf-from"
      v-model="form.fromAccountId"
      label="Akun asal"
      placeholder="Pilih akun asal"
      :options="accounts"
      :error="fieldErrors.fromAccountId"
      @update:model-value="onSourceChange"
    />
    <SelectField
      id="tf-to"
      v-model="form.toAccountId"
      label="Akun tujuan"
      placeholder="Pilih akun tujuan"
      :options="destinations"
      :error="fieldErrors.toAccountId"
    />

    <div class="grid gap-4 sm:grid-cols-2">
      <FormField id="tf-amount" v-slot="field" label="Jumlah (Rp)" :error="fieldErrors.amount">
        <MoneyInput
          :id="field.id"
          v-model="form.amount"
          :invalid="field.invalid"
          :aria-describedby="field.describedBy"
        />
      </FormField>
      <FormField id="tf-date" v-slot="field" label="Tanggal" :error="fieldErrors.transactionDate">
        <DateField :id="field.id" v-model="form.transactionDate" :invalid="field.invalid" />
      </FormField>
    </div>

    <FormField
      id="tf-description"
      v-slot="field"
      label="Keterangan"
      :error="fieldErrors.description"
    >
      <Textarea
        :id="field.id"
        v-model="form.description"
        rows="2"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
        fluid
      />
    </FormField>
  </FormDialog>
</template>
