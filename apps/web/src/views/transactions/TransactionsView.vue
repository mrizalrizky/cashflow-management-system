<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import Message from 'primevue/message'
import type { TransactionFilters as Filters } from '@/api/transactions'
import PageHeader from '@/components/PageHeader.vue'
import { useTransactionOptions } from '@/composables/useTransactionOptions'
import { useSessionStore } from '@/stores/session'
import TransactionFilters from './TransactionFilters.vue'
import TransactionFormDialog from './TransactionFormDialog.vue'
import TransactionTable from './TransactionTable.vue'
import TransferDialog from './TransferDialog.vue'

const { isAdmin, role } = storeToRefs(useSessionStore())
// Staf hanya melihat transaksinya sendiri; koordinator tidak pernah melihat overhead.
const isStaff = computed(() => role.value === 'STAFF')
const seesOverhead = computed(() => role.value !== 'PROJECT_MANAGER')

const options = useTransactionOptions()
const filters = ref<Filters>({})

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

  <Message v-if="options.error.value" severity="warn" :closable="false" class="mb-4">
    <div class="flex flex-wrap items-center gap-3">
      <span>Pilihan filter gagal dimuat: {{ options.error.value }}</span>
      <Button
        label="Muat ulang pilihan"
        size="small"
        severity="secondary"
        data-testid="reload-options"
        @click="options.reload"
      />
    </div>
  </Message>

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
