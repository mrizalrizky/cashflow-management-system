<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import type { TransactionFilters as Filters } from '@/api/transactions'
import type { TxStatus } from '@/api/types'
import PageHeader from '@/components/PageHeader.vue'
import { useTransactionOptions } from '@/composables/useTransactionOptions'
import { TX_STATUS_OPTIONS } from '@/lib/labels'
import { useSessionStore } from '@/stores/session'
import TransactionFilters from './TransactionFilters.vue'
import TransactionFormDialog from './TransactionFormDialog.vue'
import TransactionOptionsError from './TransactionOptionsError.vue'
import TransactionTable from './TransactionTable.vue'
import TransferDialog from './TransferDialog.vue'

const { isAdmin, role } = storeToRefs(useSessionStore())
// Staf hanya melihat transaksinya sendiri; koordinator tidak pernah melihat overhead.
const isStaff = computed(() => role.value === 'STAFF')
const seesOverhead = computed(() => role.value !== 'PROJECT_MANAGER')

const options = useTransactionOptions()
/**
 * Halaman lain bisa membuka daftar ini pada satu status, mis. dashboard ke yang menunggu
 * (`?status=PENDING`). Dibaca sekali saat halaman dibuka; nilai yang tidak dikenal diabaikan.
 */
function statusFromAddress(): TxStatus | undefined {
  const asked = useRoute().query.status
  return TX_STATUS_OPTIONS.find((option) => option.value === asked)?.value
}

const initialStatus = statusFromAddress()
const filters = ref<Filters>(initialStatus ? { status: initialStatus } : {})

const table = ref<InstanceType<typeof TransactionTable> | null>(null)
const formOpen = ref(false)
const transferOpen = ref(false)

// Pemberitahuan dan perpindahan halaman diurus dialognya; halaman ini cukup memuat ulang.
function reloadTable(): void {
  void table.value?.reload()
}
</script>

<template>
  <PageHeader :title="isStaff ? 'Transaksi Saya' : 'Transaksi'">
    <template #actions>
      <Button
        v-if="isAdmin"
        label="Transfer antar akun"
        icon="pi pi-arrow-right-arrow-left"
        severity="secondary"
        data-testid="add-transfer"
        @click="transferOpen = true"
      />
      <Button
        label="Catat transaksi"
        icon="pi pi-plus"
        data-testid="add-transaction"
        @click="formOpen = true"
      />
    </template>
  </PageHeader>

  <TransactionOptionsError :options="options" class="mb-4" />

  <TransactionFilters
    v-model="filters"
    :options="options"
    :allow-overhead="seesOverhead"
    :transfer-switch="isAdmin"
  />

  <TransactionTable ref="table" :filters="filters" :show-creator="!isStaff" />

  <TransactionFormDialog
    v-model:visible="formOpen"
    :transaction="null"
    :options="options"
    @saved="reloadTable"
  />
  <TransferDialog
    v-if="isAdmin"
    v-model:visible="transferOpen"
    :options="options"
    @saved="reloadTable"
  />
</template>
