<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import { listAccounts, updateAccount, type AccountFilters } from '@/api/accounts'
import type { Account } from '@/api/types'
import ActiveTag from '@/components/ActiveTag.vue'
import FilterBar from '@/components/FilterBar.vue'
import FilterSelect from '@/components/FilterSelect.vue'
import PagedTable from '@/components/PagedTable.vue'
import RowActionButton from '@/components/RowActionButton.vue'
import ToggleActiveButton from '@/components/ToggleActiveButton.vue'
import { useDebouncedInput } from '@/composables/useDebouncedInput'
import { useNotify } from '@/composables/useNotify'
import { usePagedList } from '@/composables/usePagedList'
import { useToggleActive } from '@/composables/useToggleActive'
import { ACCOUNT_TYPE_OPTIONS, ACTIVE_OPTIONS, accountTypeLabel } from '@/lib/labels'
import { formatRupiah } from '@/lib/money'
import AccountFormDialog from './AccountFormDialog.vue'

const notify = useNotify()

const list = usePagedList<Account, AccountFilters>(listAccounts, {
  search: undefined,
  type: undefined,
  isActive: undefined,
})
const { filters } = list

const search = useDebouncedInput((value) => {
  filters.search = value || undefined
})

const formOpen = ref(false)
const selected = ref<Account | null>(null)

function openForm(account: Account | null): void {
  selected.value = account
  formOpen.value = true
}

function onSaved(account: Account): void {
  notify.success(`${account.name} disimpan`)
  void list.reload()
}

const toggleActive = useToggleActive<Account>({
  update: (id, isActive) => updateAccount(id, { isActive }),
  onChanged: () => void list.reload(),
  describe: () => 'Akun ini tidak bisa lagi dipilih untuk transaksi baru.',
})

onMounted(list.reload)
</script>

<template>
  <div class="mb-4 flex justify-end">
    <Button label="Tambah akun" icon="pi pi-plus" data-testid="add-account" @click="openForm(null)" />
  </div>

  <FilterBar>
    <InputText
      id="account-search"
      v-model="search"
      placeholder="Cari nama akun"
      aria-label="Cari nama akun"
      fluid
    />
    <FilterSelect
      v-model="filters.type"
      :options="ACCOUNT_TYPE_OPTIONS"
      placeholder="Semua jenis"
      label="Jenis"
    />
    <FilterSelect
      v-model="filters.isActive"
      :options="ACTIVE_OPTIONS"
      placeholder="Semua status"
      label="Status"
    />
  </FilterBar>

  <PagedTable :list="list" empty-text="Belum ada akun" no-match-text="Tidak ada akun yang cocok">
    <Column header="Nama">
      <template #body="{ data }: { data: Account }">
        <span class="font-medium">{{ data.name }}</span>
      </template>
    </Column>
    <Column header="Jenis">
      <template #body="{ data }: { data: Account }">{{ accountTypeLabel(data.type) }}</template>
    </Column>
    <Column header="Saldo awal" class="hidden text-right md:table-cell">
      <template #body="{ data }: { data: Account }">{{ formatRupiah(data.openingBalance) }}</template>
    </Column>
    <Column header="Saldo" class="text-right">
      <template #body="{ data }: { data: Account }">
        <span
          class="font-medium"
          :class="{ 'text-red-600': data.balance.startsWith('-') }"
          :data-testid="`balance-${data.id}`"
          >{{ formatRupiah(data.balance) }}</span
        >
      </template>
    </Column>
    <Column header="Status">
      <template #body="{ data }: { data: Account }"><ActiveTag :active="data.isActive" /></template>
    </Column>
    <Column header="Aksi" class="text-right">
      <template #body="{ data }: { data: Account }">
        <div class="flex justify-end gap-1">
          <RowActionButton
            icon="pi pi-pencil"
            :label="`Ubah ${data.name}`"
            :test-id="`edit-${data.id}`"
            @click="openForm(data)"
          />
          <ToggleActiveButton :item="data" @toggle="toggleActive(data)" />
        </div>
      </template>
    </Column>
  </PagedTable>

  <AccountFormDialog v-model:visible="formOpen" :account="selected" @saved="onSaved" />
</template>
