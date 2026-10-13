<script setup lang="ts">
import { computed } from 'vue'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import { createInstallment, updateInstallment, type InstallmentInput } from '@/api/installments'
import type { Installment } from '@/api/types'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import MonthField from '@/components/MonthField.vue'
import TextField from '@/components/TextField.vue'
import { useEntityDialog } from '@/composables/useEntityDialog'
import { formatMonth } from '@/lib/format'
import { endMonthOf, MONTHS_MAX, MONTHS_MIN } from '@/lib/installments'
import { amountRules } from '@/lib/transaction-rules'
import { collectErrors, required } from '@/lib/validation'

const props = defineProps<{
  /** Cicilan yang diubah; null berarti menambah cicilan baru. */
  installment: Installment | null
}>()
const emit = defineEmits<{ saved: [installment: Installment] }>()
const visible = defineModel<boolean>('visible', { required: true })

interface Form {
  name: string
  monthlyAmount: string
  startMonth: string | null
  /** Teks, seperti yang diketik; diubah menjadi angka saat dikirim. */
  months: string
  notes: string
}

function monthsRule(value: unknown): string | null {
  const months = Number(value)
  return Number.isInteger(months) && months >= MONTHS_MIN && months <= MONTHS_MAX
    ? null
    : `Jumlah bulan ${MONTHS_MIN} sampai ${MONTHS_MAX}`
}

const { form, editing, submitting, fieldErrors, formError, onSubmit } = useEntityDialog<
  Installment,
  Form,
  InstallmentInput
>({
  visible,
  entity: () => props.installment,
  blank: () => ({ name: '', monthlyAmount: '', startMonth: null, months: '', notes: '' }),
  fromEntity: (installment) => ({
    name: installment.name,
    monthlyAmount: installment.monthlyAmount,
    startMonth: installment.startMonth,
    months: String(installment.months),
    notes: installment.notes ?? '',
  }),
  toInput: (values) => ({
    name: values.name.trim(),
    monthlyAmount: values.monthlyAmount,
    startMonth: values.startMonth ?? '',
    months: Number(values.months),
    notes: values.notes.trim() === '' ? null : values.notes.trim(),
  }),
  validate: (values) =>
    collectErrors(values, {
      name: [required('Nama')],
      monthlyAmount: amountRules('Nominal per bulan'),
      startMonth: [(value) => (value ? null : 'Bulan mulai wajib diisi')],
      months: [monthsRule],
    }),
  create: createInstallment,
  update: (installment, changes) => updateInstallment(installment.id, changes),
  onSaved: (installment) => emit('saved', installment),
})

const endMonth = computed(() => endMonthOf(form.startMonth, Number(form.months)))
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    :title="editing ? 'Ubah cicilan' : 'Tambah cicilan'"
    :submitting="submitting"
    :form-error="formError"
    @submit="onSubmit"
  >
    <TextField id="installment-name" v-model="form.name" label="Nama" :error="fieldErrors.name" />
    <FormField
      id="installment-amount"
      v-slot="field"
      label="Nominal per bulan (Rp)"
      :error="fieldErrors.monthlyAmount"
    >
      <MoneyInput
        :id="field.id"
        v-model="form.monthlyAmount"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
      />
    </FormField>
    <div class="grid gap-4 sm:grid-cols-2">
      <FormField id="installment-start" v-slot="field" label="Bulan mulai" :error="fieldErrors.startMonth">
        <MonthField :id="field.id" v-model="form.startMonth" :invalid="field.invalid" />
      </FormField>
      <FormField id="installment-months" v-slot="field" label="Jumlah bulan" :error="fieldErrors.months">
        <InputText
          :id="field.id"
          v-model="form.months"
          inputmode="numeric"
          :invalid="field.invalid"
          :aria-describedby="field.describedBy"
          fluid
        />
      </FormField>
    </div>
    <p class="text-sm text-surface-600" data-testid="installment-end">
      Selesai: <span class="font-medium">{{ endMonth ? formatMonth(endMonth) : '-' }}</span>
    </p>
    <FormField id="installment-notes" v-slot="field" label="Catatan" :error="fieldErrors.notes">
      <Textarea :id="field.id" v-model="form.notes" rows="2" :aria-describedby="field.describedBy" fluid />
    </FormField>
  </FormDialog>
</template>
