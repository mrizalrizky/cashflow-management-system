<script setup lang="ts" generic="T extends { id: string }, F extends object">
import { computed } from 'vue'
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

// Dibaca lewat `props.list` tiap kali, supaya tetap benar bila induk mengganti daftarnya.
const items = computed(() => props.list.items.value)
const total = computed(() => props.list.total.value)
const page = computed(() => props.list.page.value)
const pageSize = computed(() => props.list.pageSize.value)
const loading = computed(() => props.list.loading.value)
const error = computed(() => props.list.error.value)
const filtered = computed(() => props.list.filtered.value)

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
