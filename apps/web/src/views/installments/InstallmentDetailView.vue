<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import { useConfirm } from 'primevue/useconfirm'
import { deleteInstallment, getInstallment } from '@/api/installments'
import type { Installment } from '@/api/types'
import ErrorState from '@/components/ErrorState.vue'
import MoneyText from '@/components/MoneyText.vue'
import PageHeader from '@/components/PageHeader.vue'
import TransactionStatusTag from '@/components/TransactionStatusTag.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { useNotify } from '@/composables/useNotify'
import { dangerConfirm } from '@/lib/confirm'
import { formatCalendarDate, formatMonth } from '@/lib/format'
import { progressText } from '@/lib/installments'
import { PATHS, transactionPath } from '@/router/paths'
import InstallmentFormDialog from './InstallmentFormDialog.vue'
import InstallmentStatusTag from './InstallmentStatusTag.vue'

const NOT_FOUND_STATUSES = [400, 404]

const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const notify = useNotify()
const installmentId = computed(() => String(route.params.id))

const { data: installment, loading, error, errorStatus, reload } = useAsyncData(() =>
  getInstallment(installmentId.value),
)
watch(
  installmentId,
  () => {
    installment.value = null
    void reload()
  },
  { immediate: true },
)

const notFound = computed(
  () => errorStatus.value !== null && NOT_FOUND_STATUSES.includes(errorStatus.value),
)

const editing = ref(false)

function onSaved(saved: Installment): void {
  notify.success(`${saved.name} disimpan`)
  void reload()
}

async function remove(): Promise<void> {
  try {
    await deleteInstallment(installmentId.value)
    notify.success('Cicilan dihapus')
    await router.push(PATHS.installments)
  } catch (failure) {
    notify.error(failure, 'Cicilan gagal dihapus')
  }
}

function askDelete(): void {
  confirm.require(
    dangerConfirm({
      header: 'Hapus cicilan',
      message: 'Cicilan ini dihapus. Tindakan ini tidak bisa dibatalkan.',
      acceptLabel: 'Hapus',
      accept: () => void remove(),
    }),
  )
}
</script>

<template>
  <RouterLink
    :to="PATHS.installments"
    class="mb-3 inline-flex items-center gap-2 text-sm text-primary-700 hover:underline"
  >
    <i class="pi pi-arrow-left" aria-hidden="true" />
    Kembali ke daftar cicilan
  </RouterLink>

  <p v-if="notFound" class="py-6 text-surface-600">Cicilan tidak ditemukan.</p>
  <ErrorState v-else-if="error && !installment" :message="error" @retry="reload" />
  <div v-else-if="!installment" class="flex justify-center py-10">
    <ProgressSpinner v-if="loading" aria-label="Memuat" />
  </div>

  <template v-else>
    <PageHeader :title="installment.name">
      <template #actions>
        <InstallmentStatusTag :status="installment.status" />
        <Button label="Ubah" icon="pi pi-pencil" severity="secondary" @click="editing = true" />
        <!-- Cicilan yang punya pembayaran, termasuk yang dibatalkan, tidak bisa dihapus. -->
        <Button
          v-if="installment.transactions.length === 0"
          label="Hapus"
          icon="pi pi-trash"
          severity="danger"
          variant="outlined"
          data-testid="delete-installment"
          @click="askDelete"
        />
      </template>
    </PageHeader>

    <dl class="mb-6 grid gap-4 rounded-xl border border-surface-200 bg-surface-0 p-4 sm:grid-cols-2">
      <div>
        <dt class="text-sm text-surface-600">Per bulan</dt>
        <dd class="font-medium"><MoneyText :amount="installment.monthlyAmount" /></dd>
      </div>
      <div>
        <dt class="text-sm text-surface-600">Periode</dt>
        <dd class="font-medium">
          {{ formatMonth(installment.startMonth) }} – {{ formatMonth(installment.endMonth) }}
        </dd>
      </div>
      <div>
        <dt class="text-sm text-surface-600">Kemajuan</dt>
        <dd class="font-medium" data-testid="installment-progress">{{ progressText(installment) }}</dd>
      </div>
      <div v-if="installment.notes">
        <dt class="text-sm text-surface-600">Catatan</dt>
        <dd class="whitespace-pre-line">{{ installment.notes }}</dd>
      </div>
    </dl>

    <section class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">Pembayaran</h2>
      <p v-if="installment.transactions.length === 0" class="text-surface-500">Belum ada pembayaran</p>
      <ul v-else class="divide-y divide-surface-200 rounded-xl border border-surface-200 bg-surface-0">
        <li
          v-for="payment in installment.transactions"
          :key="payment.id"
          class="flex flex-wrap items-center justify-between gap-2 p-3"
        >
          <div class="min-w-0">
            <RouterLink :to="transactionPath(payment.id)" class="font-medium text-primary-700 hover:underline">
              {{ payment.description }}
            </RouterLink>
            <p class="text-sm text-surface-600">{{ formatCalendarDate(payment.transactionDate) }}</p>
          </div>
          <div class="flex items-center gap-2">
            <MoneyText :amount="payment.amount" />
            <TransactionStatusTag :status="payment.status" />
          </div>
        </li>
      </ul>
    </section>

    <InstallmentFormDialog v-model:visible="editing" :installment="installment" @saved="onSaved" />
  </template>
</template>
