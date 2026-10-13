<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import { getTransaction } from '@/api/transactions'
import type { Transaction } from '@/api/types'
import ErrorState from '@/components/ErrorState.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProofList from '@/components/ProofList.vue'
import ProofPicker from '@/components/ProofPicker.vue'
import ReasonDialog from '@/components/ReasonDialog.vue'
import SignedAmount from '@/components/SignedAmount.vue'
import TransactionStatusTag from '@/components/TransactionStatusTag.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { useNotify } from '@/composables/useNotify'
import { describeFailedUploads, useProofUpload } from '@/composables/useProofUpload'
import { TRANSFER_VOID_NOTE, useTransactionActions } from '@/composables/useTransactionActions'
import {
  useTransactionOptions,
  type TransactionOptions,
} from '@/composables/useTransactionOptions'
import { formatCalendarDate, formatDate } from '@/lib/format'
import { txTypeLabel } from '@/lib/labels'
import { MAX_PROOFS } from '@/lib/proof-files'
import { PATHS } from '@/router/paths'
import TransactionFormDialog from './TransactionFormDialog.vue'

// 404: tidak ada atau bukan haknya. 400: id di alamat bukan id yang sah (salah ketik).
const NOT_FOUND_STATUSES = [400, 404]

const route = useRoute()
const notify = useNotify()

const transactionId = computed(() => String(route.params.id))

const { data: transaction, loading, error, errorStatus, reload } = useAsyncData(() =>
  getTransaction(transactionId.value),
)
watch(
  transactionId,
  () => {
    // Transaksi sebelumnya tidak ditampilkan selagi transaksi lain dimuat.
    transaction.value = null
    void reload()
  },
  { immediate: true },
)

// Transaksi di luar jangkauan dijawab API sama seperti transaksi yang tidak ada.
const notFound = computed(
  () => errorStatus.value !== null && NOT_FOUND_STATUSES.includes(errorStatus.value),
)

function show(latest: Transaction): void {
  transaction.value = latest
}

const actions = useTransactionActions({ onChanged: show })

function byWhom(person: { name: string }, at: string | null): string {
  return `${person.name} · ${formatDate(at)}`
}

/** Baris keterangan sederhana; jumlah dan proyek punya tampilannya sendiri di template. */
const facts = computed(() => {
  const tx = transaction.value
  if (!tx) return []
  return [
    { id: 'type', label: 'Tipe', value: txTypeLabel(tx.type) },
    { id: 'date', label: 'Tanggal', value: formatCalendarDate(tx.transactionDate) },
    { id: 'account', label: 'Akun', value: tx.account.name },
    { id: 'category', label: 'Kategori', value: tx.category.name },
    { id: 'created', label: 'Dicatat oleh', value: byWhom(tx.createdBy, tx.createdAt) },
    tx.voidedBy && { id: 'voided', label: 'Dibatalkan oleh', value: byWhom(tx.voidedBy, tx.voidedAt) },
    tx.voidReason && { id: 'void-reason', label: 'Alasan pembatalan', value: tx.voidReason },
  ].filter((fact) => fact !== null && fact !== '')
})

// Bukti tambahan.
const proof = useProofUpload()
const newFiles = ref<File[]>([])

async function uploadProof(): Promise<void> {
  if (!transaction.value || newFiles.value.length === 0) return
  const { failed } = await proof.upload(transaction.value.id, newFiles.value)
  // Yang gagal tetap di daftar supaya bisa diganti atau dicoba lagi.
  newFiles.value = failed.map(({ file }) => file)
  if (failed.length > 0) notify.warn(`Gagal diunggah: ${describeFailedUploads(failed)}`)
  else notify.success('Bukti diunggah')
  await reload()
}

// Form ubah; pilihannya baru dimuat saat pertama kali dibutuhkan.
const options = shallowRef<TransactionOptions | null>(null)
const formOpen = ref(false)

function openForm(): void {
  options.value ??= useTransactionOptions()
  formOpen.value = true
}
</script>

<template>
  <RouterLink
    :to="PATHS.transactions"
    class="mb-3 inline-flex items-center gap-2 text-sm text-primary-700 hover:underline"
    data-testid="back-to-transactions"
  >
    <i class="pi pi-arrow-left" aria-hidden="true" />
    Kembali ke daftar transaksi
  </RouterLink>

  <p v-if="notFound" class="py-6 text-surface-600">Transaksi tidak ditemukan.</p>
  <ErrorState v-else-if="error && !transaction" :message="error" @retry="reload" />
  <div v-else-if="!transaction" class="flex justify-center py-10">
    <ProgressSpinner v-if="loading" aria-label="Memuat" />
  </div>

  <template v-else>
    <PageHeader :title="transaction.description">
      <template #actions>
        <TransactionStatusTag :status="transaction.status" />
        <Button
          v-if="transaction.permissions.canEdit"
          label="Ubah"
          icon="pi pi-pencil"
          severity="secondary"
          :disabled="actions.busy.value"
          data-testid="edit-transaction"
          @click="openForm"
        />
        <Button
          v-if="transaction.permissions.canVoid"
          label="Void"
          icon="pi pi-undo"
          severity="danger"
          variant="outlined"
          :disabled="actions.busy.value"
          data-testid="void-transaction"
          @click="actions.void(transaction)"
        />
      </template>
    </PageHeader>

    <!-- Yang tampil mungkin bukan keadaan terbaru: muat ulang setelah sebuah perubahan gagal. -->
    <Message v-if="error" severity="warn" :closable="false" class="mb-4">
      <div class="flex flex-wrap items-center gap-3">
        <span>Data terbaru gagal dimuat: {{ error }}</span>
        <Button
          label="Coba lagi"
          size="small"
          severity="secondary"
          :loading="loading"
          data-testid="retry-reload"
          @click="reload"
        />
      </div>
    </Message>

    <Message v-if="transaction.isTransfer" severity="info" :closable="false" class="mb-4">
      {{ TRANSFER_VOID_NOTE }}
    </Message>

    <dl class="mb-6 grid gap-4 rounded-xl border border-surface-200 bg-surface-0 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div class="min-w-0">
        <dt class="text-sm text-surface-500">Jumlah</dt>
        <dd class="text-lg" data-testid="tx-amount">
          <SignedAmount
            :type="transaction.type"
            :amount="transaction.amount"
            :counted="transaction.status === 'APPROVED'"
          />
        </dd>
      </div>
      <div v-if="transaction.isTransfer" class="min-w-0">
        <dt class="text-sm text-surface-500">Jenis</dt>
        <dd class="font-medium" data-testid="tx-transfer">Transfer antar akun</dd>
      </div>
      <div v-for="fact in facts" :key="fact.id" class="min-w-0">
        <dt class="text-sm text-surface-500">{{ fact.label }}</dt>
        <dd class="font-medium break-words whitespace-pre-line" :data-testid="`tx-${fact.id}`">
          {{ fact.value }}
        </dd>
      </div>
    </dl>

    <!-- Riwayat perubahan ada di log audit, yang hanya bisa dibuka admin. -->
    <RouterLink
      :to="{ path: PATHS.auditLog, query: { entityType: 'transaction', entityId: transaction.id } }"
      class="mb-6 inline-flex items-center gap-2 text-sm text-primary-700 hover:underline"
      data-testid="transaction-history"
    >
      <i class="pi pi-history" aria-hidden="true" />
      Riwayat perubahan
    </RouterLink>

    <section class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">Bukti</h2>
      <ProofList
        :attachments="transaction.attachments"
        :can-remove="transaction.permissions.canAttach"
        @removed="reload"
      />
      <template v-if="transaction.permissions.canAttach">
        <ProofPicker
          v-model="newFiles"
          :max="MAX_PROOFS - transaction.attachments.length"
          :disabled="proof.uploading.value"
        />
        <div>
          <Button
            label="Unggah"
            icon="pi pi-upload"
            :loading="proof.uploading.value"
            :disabled="newFiles.length === 0 || proof.uploading.value"
            data-testid="upload-proof"
            @click="uploadProof"
          />
        </div>
      </template>
    </section>

    <TransactionFormDialog
      v-if="options"
      v-model:visible="formOpen"
      :transaction="transaction"
      :options="options"
      @saved="show"
    />
    <ReasonDialog
      v-if="actions.reasonRequest.value"
      v-model:visible="actions.reasonOpen.value"
      v-bind="actions.reasonRequest.value"
    />
  </template>
</template>
