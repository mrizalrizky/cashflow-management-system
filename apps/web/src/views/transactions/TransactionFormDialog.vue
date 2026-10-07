<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import Checkbox from 'primevue/checkbox'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import { useConfirm } from 'primevue/useconfirm'
import {
  approveTransaction,
  createTransaction,
  updateTransaction,
  type ApprovedTransaction,
  type TransactionInput,
} from '@/api/transactions'
import type { ProjectOption, Transaction, TxType } from '@/api/types'
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
import { projectLabel, type TransactionOptions } from '@/composables/useTransactionOptions'
import { todayInJakarta } from '@/lib/calendar'
import { errorMessage } from '@/lib/errors'
import { TX_TYPE_OPTIONS, type Option } from '@/lib/labels'
import { MAX_PROOFS } from '@/lib/proof-files'
import {
  amountRules,
  chosen,
  descriptionRules,
  transactionDateRules,
} from '@/lib/transaction-rules'
import { negativeBalanceWarning, OVERHEAD } from '@/lib/transactions'
import { collectErrors } from '@/lib/validation'
import { transactionPath } from '@/router/paths'
import { useSessionStore } from '@/stores/session'
import TransactionOptionsError from './TransactionOptionsError.vue'

const props = defineProps<{
  /** Transaksi yang diubah; null berarti mencatat transaksi baru. */
  transaction: Transaction | null
  options: TransactionOptions
  /** Proyek yang sudah terpilih saat mencatat dari halaman sebuah proyek. */
  presetProject?: ProjectOption
}>()
const emit = defineEmits<{ saved: [transaction: Transaction] }>()
const visible = defineModel<boolean>('visible', { required: true })

const { isAdmin, role } = storeToRefs(useSessionStore())
const router = useRouter()
const notify = useNotify()
const confirm = useConfirm()
const proof = useProofUpload()

interface Form {
  type: TxType
  amount: string
  transactionDate: string | null
  accountId: string | null
  categoryId: string | null
  /** Id proyek, `OVERHEAD`, atau null bila belum dipilih. */
  projectId: string | null
  description: string
  /** Hanya SUPER_ADMIN: setujui begitu tersimpan. */
  approveNow: boolean
}

/** Bukti yang dipilih untuk transaksi baru; diunggah setelah transaksinya tersimpan. */
const files = ref<File[]>([])
const isResubmit = computed(() => props.transaction?.status === 'REJECTED')

function validate(values: Form, editing: boolean): Record<string, string> {
  const errors = collectErrors(values, {
    amount: amountRules(),
    transactionDate: transactionDateRules(),
    accountId: [chosen('Akun')],
    categoryId: [chosen('Kategori')],
    projectId: [chosen('Proyek')],
    description: descriptionRules(),
  })
  if (!editing && values.approveNow && values.type === 'OUT' && files.value.length === 0) {
    errors.proof = 'Pengeluaran perlu bukti untuk langsung disetujui'
  }
  return errors
}

/** Yang terjadi setelah transaksi baru tersimpan; menentukan pesan dan halaman berikutnya. */
interface Aftermath {
  failedUploads: FailedUpload[]
  approved: ApprovedTransaction | null
  approveError: string | null
}
let aftermath: Aftermath = { failedUploads: [], approved: null, approveError: null }

/**
 * Simpan, unggah bukti, lalu (bila diminta admin) setujui. Begitu transaksinya tersimpan,
 * tidak ada lagi yang dilempar: kegagalan sesudahnya dicatat di `aftermath`, supaya dialog
 * tetap tertutup dan transaksi yang sama tidak bisa tersimpan dua kali.
 */
async function createWithProof(input: TransactionInput): Promise<Transaction> {
  // Dicatat sebelum permintaan pertama: isi form tidak boleh mengubah apa yang sedang disimpan.
  const proofFiles = [...files.value]
  const approveNow = form.approveNow

  const created = await createTransaction(input)
  const { failed } = await proof.upload(created.id, proofFiles)
  aftermath = { failedUploads: failed, approved: null, approveError: null }
  if (!approveNow || failed.length > 0) return created

  try {
    aftermath.approved = await approveTransaction(created.id)
    return aftermath.approved
  } catch (cause) {
    aftermath.approveError = errorMessage(cause, 'Gagal menyetujui')
    return created
  }
}

function afterCreate(transaction: Transaction): void {
  const { failedUploads, approved, approveError } = aftermath
  if (failedUploads.length > 0 || approveError) {
    notify.warn(
      failedUploads.length > 0
        ? `Transaksi tersimpan, tetapi bukti berikut gagal diunggah: ${describeFailedUploads(failedUploads)}. Tambahkan lagi di halaman ini.`
        : `Transaksi tersimpan, tetapi belum disetujui: ${approveError}`,
    )
    void router.push(transactionPath(transaction.id))
    return
  }
  notify.success(approved ? 'Transaksi dicatat dan disetujui' : 'Transaksi dicatat')
  const warning = approved && negativeBalanceWarning(approved)
  if (warning) notify.warn(warning)
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
    projectId: props.presetProject?.id ?? null,
    description: '',
    approveNow: false,
  }),
  fromEntity: (transaction) => ({
    type: transaction.type,
    amount: transaction.amount,
    transactionDate: transaction.transactionDate,
    accountId: transaction.account.id,
    categoryId: transaction.category.id,
    projectId: transaction.project?.id ?? OVERHEAD,
    description: transaction.description,
    approveNow: false,
  }),
  toInput: (values) => ({
    type: values.type,
    amount: values.amount,
    transactionDate: values.transactionDate ?? '',
    description: values.description.trim(),
    accountId: values.accountId ?? '',
    categoryId: values.categoryId ?? '',
    projectId: values.projectId === OVERHEAD ? null : values.projectId,
  }),
  validate,
  create: createWithProof,
  update: (transaction, changes) => updateTransaction(transaction.id, changes),
  // Menyimpan transaksi yang ditolak berarti mengajukannya lagi, walau isinya tidak diubah.
  alwaysUpdate: (transaction) => transaction.status === 'REJECTED',
  onSaved: (saved) => {
    if (props.transaction === null) afterCreate(saved)
    else notify.success(isResubmit.value ? 'Transaksi diajukan lagi' : 'Transaksi disimpan')
    emit('saved', saved)
  },
  // Proyek di luar jangkauan pengguna dijawab API seperti proyek yang tidak ada.
  fieldForStatus: { 404: 'projectId' },
})

watch(visible, (open) => {
  if (open) files.value = []
})

function save(): void {
  const needsProofWarning =
    !editing.value &&
    form.type === 'OUT' &&
    files.value.length === 0 &&
    Object.keys(validate(form, false)).length === 0
  if (!needsProofWarning) {
    void onSubmit()
    return
  }
  confirm.require({
    header: 'Simpan tanpa bukti',
    message:
      'Pengeluaran tanpa bukti tidak bisa disetujui. Simpan dulu dan tambahkan bukti nanti?',
    acceptLabel: 'Simpan',
    rejectLabel: 'Batal',
    rejectProps: { severity: 'secondary', variant: 'text' },
    accept: () => void onSubmit(),
  })
}

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
const projectOptions = computed(() => {
  // Proyek transaksi ini, atau proyek halaman asalnya, tetap ditawarkan walau sudah tidak aktif.
  const project = current.value?.project ?? props.presetProject
  return [
    // Koordinator hanya boleh mencatat untuk proyeknya; overhead bukan pilihannya.
    ...(role.value === 'PROJECT_MANAGER'
      ? []
      : [{ value: OVERHEAD, label: 'Tanpa proyek (overhead)' }]),
    ...withCurrent(
      props.options.projects.value.map((p) => ({ value: p.id, label: projectLabel(p) })),
      project ? { value: project.id, label: projectLabel(project) } : null,
    ),
  ]
})

const title = computed(() => {
  if (!editing.value) return 'Catat transaksi'
  return isResubmit.value ? 'Perbaiki dan ajukan lagi' : 'Ubah transaksi'
})
</script>

<template>
  <FormDialog
    v-model:visible="visible"
    :title="title"
    :submitting="submitting"
    :form-error="formError"
    :submit-label="isResubmit ? 'Ajukan lagi' : undefined"
    @submit="save"
  >
    <TransactionOptionsError :options="options" />
    <Message v-if="isResubmit" severity="warn" :closable="false">
      Ditolak: {{ transaction?.rejectReason }}
    </Message>

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
    <SelectField
      id="tx-project"
      :loading="options.loading.value"
      v-model="form.projectId"
      label="Proyek"
      placeholder="Pilih proyek"
      :options="projectOptions"
      :error="fieldErrors.projectId"
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

      <label v-if="isAdmin" class="flex items-center gap-2 text-sm">
        <Checkbox v-model="form.approveNow" binary input-id="tx-approve-now" />
        <span>Langsung setujui</span>
      </label>
    </template>
  </FormDialog>
</template>
