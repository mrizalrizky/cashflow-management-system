<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Textarea from 'primevue/textarea'
import { createTransaction, updateTransaction, type TransactionInput } from '@/api/transactions'
import type { Transaction, TxType } from '@/api/types'
import DateField from '@/components/DateField.vue'
import FormDialog from '@/components/FormDialog.vue'
import FormField from '@/components/FormField.vue'
import MoneyInput from '@/components/MoneyInput.vue'
import ProofPicker from '@/components/ProofPicker.vue'
import SelectField from '@/components/SelectField.vue'
import { useEntityDialog } from '@/composables/useEntityDialog'
import { useNotify } from '@/composables/useNotify'
import {
  describeFailedUploads,
  useProofUpload,
  type FailedUpload,
} from '@/composables/useProofUpload'
import type { TransactionOptions } from '@/composables/useTransactionOptions'
import { todayInJakarta } from '@/lib/calendar'
import { TX_TYPE_OPTIONS, type Option } from '@/lib/labels'
import { MAX_PROOFS } from '@/lib/proof-files'
import {
  amountRules,
  chosen,
  descriptionRules,
  transactionDateRules,
} from '@/lib/transaction-rules'
import { collectErrors } from '@/lib/validation'
import { transactionPath } from '@/router/paths'
import TransactionOptionsError from './TransactionOptionsError.vue'

const props = defineProps<{
  /** Transaksi yang diubah; null berarti mencatat transaksi baru. */
  transaction: Transaction | null
  options: TransactionOptions
}>()
const emit = defineEmits<{ saved: [transaction: Transaction] }>()
const visible = defineModel<boolean>('visible', { required: true })

const router = useRouter()
const notify = useNotify()
const proof = useProofUpload()

interface Form {
  type: TxType
  amount: string
  transactionDate: string | null
  accountId: string | null
  categoryId: string | null
  description: string
}

/** Bukti yang dipilih untuk transaksi baru; diunggah setelah transaksinya tersimpan. */
const files = ref<File[]>([])

function validate(values: Form): Record<string, string> {
  return collectErrors(values, {
    amount: amountRules(),
    transactionDate: transactionDateRules(),
    accountId: [chosen('Akun')],
    categoryId: [chosen('Kategori')],
    description: descriptionRules(),
  })
}

/** Bukti yang gagal diunggah setelah transaksi baru tersimpan; menentukan pesan dan halaman berikutnya. */
let failedUploads: FailedUpload[] = []

/**
 * Simpan, lalu unggah bukti. Begitu transaksinya tersimpan, tidak ada lagi yang dilempar:
 * bukti yang gagal dicatat di `failedUploads`, supaya dialog tetap tertutup dan transaksi yang
 * sama tidak bisa tersimpan dua kali.
 */
async function createWithProof(input: TransactionInput): Promise<Transaction> {
  // Dicatat sebelum permintaan pertama: isi form tidak boleh mengubah apa yang sedang disimpan.
  const proofFiles = [...files.value]
  const created = await createTransaction(input)
  failedUploads = (await proof.upload(created.id, proofFiles)).failed
  return created
}

function afterCreate(transaction: Transaction): void {
  if (failedUploads.length > 0) {
    notify.warn(
      `Transaksi tersimpan, tetapi bukti berikut gagal diunggah: ${describeFailedUploads(failedUploads)}. Tambahkan lagi di halaman ini.`,
    )
    void router.push(transactionPath(transaction.id))
    return
  }
  notify.success('Transaksi dicatat')
}

const { form, editing, submitting, fieldErrors, formError, onSubmit } = useEntityDialog<
  Transaction,
  Form,
  TransactionInput
>({
  visible,
  entity: () => props.transaction,
  blank: () => ({
    type: 'OUT',
    amount: '',
    transactionDate: todayInJakarta(),
    accountId: null,
    categoryId: null,
    description: '',
  }),
  fromEntity: (transaction) => ({
    type: transaction.type,
    amount: transaction.amount,
    transactionDate: transaction.transactionDate,
    accountId: transaction.account.id,
    categoryId: transaction.category.id,
    description: transaction.description,
  }),
  toInput: (values) => ({
    type: values.type,
    amount: values.amount,
    transactionDate: values.transactionDate ?? '',
    description: values.description.trim(),
    accountId: values.accountId ?? '',
    categoryId: values.categoryId ?? '',
  }),
  validate,
  create: createWithProof,
  update: (transaction, changes) => updateTransaction(transaction.id, changes),
  onSaved: (saved) => {
    if (props.transaction === null) afterCreate(saved)
    else notify.success('Transaksi disimpan')
    emit('saved', saved)
  },
})

watch(visible, (open) => {
  if (open) files.value = []
})

function onTypeChange(type: TxType | null): void {
  // Kategori terikat pada tipe; yang tidak cocok lagi dilepas.
  const fits = props.options.categoriesFor(type).some((c) => c.id === form.categoryId)
  if (!fits) form.categoryId = null
}

/** Pilihan yang tersedia, ditambah milik transaksi ini bila sudah tidak aktif lagi. */
function withCurrent(available: Option<string>[], current: Option<string> | null): Option<string>[] {
  if (!current || available.some((option) => option.value === current.value)) return available
  return [...available, current]
}

function named(item: { id: string; name: string }): Option<string> {
  return { value: item.id, label: item.name }
}

const current = computed(() => props.transaction)
const accountOptions = computed(() =>
  withCurrent(props.options.accounts.value.map(named), current.value && named(current.value.account)),
)
const categoryOptions = computed(() =>
  withCurrent(
    props.options.categoriesFor(form.type).map(named),
    current.value?.type === form.type ? named(current.value.category) : null,
  ),
)
const title = computed(() => (editing.value ? 'Ubah transaksi' : 'Catat transaksi'))
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    :title="title"
    :submitting="submitting"
    :form-error="formError"
    @submit="onSubmit"
  >
    <TransactionOptionsError :options="options" />

    <div class="grid gap-4 sm:grid-cols-2">
      <SelectField
        id="tx-type"
        v-model="form.type"
        label="Tipe"
        :options="TX_TYPE_OPTIONS"
        :error="fieldErrors.type"
        @update:model-value="onTypeChange"
      />
      <FormField id="tx-date" v-slot="field" label="Tanggal" :error="fieldErrors.transactionDate">
        <DateField :id="field.id" v-model="form.transactionDate" :invalid="field.invalid" />
      </FormField>
    </div>

    <FormField id="tx-amount" v-slot="field" label="Jumlah (Rp)" :error="fieldErrors.amount">
      <MoneyInput
        :id="field.id"
        v-model="form.amount"
        :invalid="field.invalid"
        :aria-describedby="field.describedBy"
      />
    </FormField>

    <SelectField
      id="tx-account"
      :loading="options.loading.value"
      v-model="form.accountId"
      label="Akun"
      placeholder="Pilih akun"
      :options="accountOptions"
      :error="fieldErrors.accountId"
    />
    <SelectField
      id="tx-category"
      :loading="options.loading.value"
      v-model="form.categoryId"
      label="Kategori"
      placeholder="Pilih kategori"
      :options="categoryOptions"
      :error="fieldErrors.categoryId"
    />
    <FormField
      id="tx-description"
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

    <template v-if="!editing">
      <FormField id="tx-proof" label="Bukti" :error="fieldErrors.proof">
        <ProofPicker v-model="files" :max="MAX_PROOFS" :disabled="submitting" />
      </FormField>

    </template>
  </FormDialog>
</template>
