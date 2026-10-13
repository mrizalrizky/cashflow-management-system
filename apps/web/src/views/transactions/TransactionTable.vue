<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import { listTransactions, type TransactionFilters } from '@/api/transactions'
import type { Transaction } from '@/api/types'
import PagedTable from '@/components/PagedTable.vue'
import SignedAmount from '@/components/SignedAmount.vue'
import TransactionStatusTag from '@/components/TransactionStatusTag.vue'
import { usePagedList } from '@/composables/usePagedList'
import { formatCalendarDate } from '@/lib/format'
import { transactionPath } from '@/router/paths'

/** Semua filter dalam keadaan kosong; dipakai untuk mengosongkan filter yang dilepas. */
const NO_FILTERS: Record<keyof TransactionFilters, undefined> = {
  search: undefined,
  dateFrom: undefined,
  dateTo: undefined,
  type: undefined,
  status: undefined,
  accountId: undefined,
  categoryId: undefined,
  includeTransfers: undefined,
}

/**
 * Tabel transaksi berhalaman. `filters` adalah pilihan pengguna; `scope` adalah batas tetap
 * dari halaman pemakainya dan tidak dianggap sebagai filter.
 */
const props = withDefaults(
  defineProps<{
    filters?: TransactionFilters
    scope?: TransactionFilters
  }>(),
  { filters: () => ({}), scope: () => ({}) },
)

const list = usePagedList<Transaction, TransactionFilters>(
  (params) => listTransactions({ ...params, ...props.scope }),
  { ...NO_FILTERS, ...props.filters },
)

watch(
  () => props.filters,
  (next) => Object.assign(list.filters, NO_FILTERS, next),
  { deep: true },
)
watch(
  () => props.scope,
  () => void list.reload(),
  { deep: true },
)

onMounted(list.reload)

defineExpose({ reload: list.reload })
</script>

<template>
  <PagedTable
    :list="list"
    empty-text="Belum ada transaksi"
    no-match-text="Tidak ada transaksi yang cocok"
  >
    <Column header="Tanggal" class="whitespace-nowrap">
      <template #body="{ data }: { data: Transaction }">
        {{ formatCalendarDate(data.transactionDate) }}
      </template>
    </Column>
    <Column header="Keterangan">
      <template #body="{ data }: { data: Transaction }">
        <RouterLink
          :to="transactionPath(data.id)"
          class="font-medium text-primary-700 hover:underline"
        >
          {{ data.description }}
        </RouterLink>
        <p class="text-sm text-surface-500">{{ data.category.name }}</p>
        <Tag v-if="data.isTransfer" severity="info" value="Transfer" class="mt-1" />
      </template>
    </Column>
    <Column header="Akun" class="hidden md:table-cell">
      <template #body="{ data }: { data: Transaction }">{{ data.account.name }}</template>
    </Column>
    <Column header="Jumlah" class="text-right">
      <template #body="{ data }: { data: Transaction }">
        <SignedAmount
          :type="data.type"
          :amount="data.amount"
          :counted="data.status === 'APPROVED'"
        />
      </template>
    </Column>
    <Column header="Status">
      <template #body="{ data }: { data: Transaction }">
        <TransactionStatusTag :status="data.status" />
      </template>
    </Column>
  </PagedTable>
</template>
