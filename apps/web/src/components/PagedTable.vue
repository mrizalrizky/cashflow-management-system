<script setup lang="ts" generic="T, F extends object">
import DataTable, { type DataTablePageEvent } from 'primevue/datatable'
import ErrorState from '@/components/ErrorState.vue'
import TableCard from '@/components/TableCard.vue'
import type { PagedList } from '@/composables/usePagedList'

/**
 * Tabel berhalaman untuk sebuah `usePagedList`: menangani keadaan memuat, gagal, kosong,
 * dan perpindahan halaman. Kolom diberikan lewat slot.
 */
const props = defineProps<{
  list: PagedList<T, F>
  /** Teks saat belum ada data sama sekali. */
  emptyText: string
  /** Teks saat filter tidak menemukan apa pun. */
  noMatchText: string
}>()

const { items, total, page, pageSize, loading, error, filtered } = props.list

function onPage(event: DataTablePageEvent): void {
  props.list.setPage(event.page + 1, event.rows)
}
</script>

<template>
  <ErrorState v-if="error" :message="error" @retry="list.reload" />
  <TableCard v-else>
    <DataTable
      :value="items"
      data-key="id"
      :loading="loading"
      lazy
      paginator
      :first="(page - 1) * pageSize"
      :rows="pageSize"
      :total-records="total"
      :rows-per-page-options="[20, 50, 100]"
      @page="onPage"
    >
      <template #empty>
        <p class="py-6 text-center text-surface-500">{{ filtered ? noMatchText : emptyText }}</p>
      </template>
      <slot />
    </DataTable>
  </TableCard>
</template>
