<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable, { type DataTablePageEvent } from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import type { User } from '@/api/types'
import { listUsers, updateUser, type UserFilters } from '@/api/users'
import ActiveTag from '@/components/ActiveTag.vue'
import ErrorState from '@/components/ErrorState.vue'
import PageHeader from '@/components/PageHeader.vue'
import TableCard from '@/components/TableCard.vue'
import ToggleActiveButton from '@/components/ToggleActiveButton.vue'
import { useDebouncedInput } from '@/composables/useDebouncedInput'
import { useNotify } from '@/composables/useNotify'
import { usePagedList } from '@/composables/usePagedList'
import { useToggleActive } from '@/composables/useToggleActive'
import { formatDate } from '@/lib/format'
import { ACTIVE_OPTIONS, ROLE_OPTIONS, roleLabel } from '@/lib/labels'
import { useSessionStore } from '@/stores/session'
import ResetPasswordDialog from './ResetPasswordDialog.vue'
import UserFormDialog from './UserFormDialog.vue'

const session = useSessionStore()
const notify = useNotify()

const list = usePagedList<User, UserFilters>(listUsers, {
  search: undefined,
  role: undefined,
  isActive: undefined,
})
const { items, total, page, pageSize, filters, loading, error } = list

const search = useDebouncedInput((value) => {
  filters.search = value || undefined
})

const hasFilters = computed(
  // Tombol hapus pada Select mengisi model dengan null, jadi null juga berarti tanpa filter.
  () => Boolean(filters.search) || filters.role != null || filters.isActive != null,
)

// Dialog: satu untuk tambah/ubah, satu untuk reset password.
const formOpen = ref(false)
const resetOpen = ref(false)
const selected = ref<User | null>(null)

function openForm(user: User | null): void {
  selected.value = user
  formOpen.value = true
}

function openReset(user: User): void {
  selected.value = user
  resetOpen.value = true
}

function onSaved(message: string): void {
  notify.success(message)
  void list.reload()
}

const toggleActive = useToggleActive<User>({
  update: (id, isActive) => updateUser(id, { isActive }),
  onChanged: () => void list.reload(),
  describe: () => 'Ia langsung keluar dan tidak bisa login lagi.',
})

function onPage(event: DataTablePageEvent): void {
  list.setPage(event.page + 1, event.rows)
}

onMounted(list.reload)
</script>

<template>
  <PageHeader title="Pengguna">
    <template #actions>
      <Button
        label="Tambah pengguna"
        icon="pi pi-plus"
        data-testid="add-user"
        @click="openForm(null)"
      />
    </template>
  </PageHeader>

  <div class="mb-4 grid gap-3 sm:grid-cols-3">
    <InputText
      id="user-search"
      v-model="search"
      placeholder="Cari nama atau email"
      aria-label="Cari nama atau email"
      fluid
    />
    <Select
      v-model="filters.role"
      :options="ROLE_OPTIONS"
      option-label="label"
      option-value="value"
      placeholder="Semua peran"
      aria-label="Peran"
      show-clear
      fluid
    />
    <Select
      v-model="filters.isActive"
      :options="ACTIVE_OPTIONS"
      option-label="label"
      option-value="value"
      placeholder="Semua status"
      aria-label="Status"
      show-clear
      fluid
    />
  </div>

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
        <p class="py-6 text-center text-surface-500">
          {{ hasFilters ? 'Tidak ada pengguna yang cocok' : 'Belum ada pengguna' }}
        </p>
      </template>

      <Column header="Nama">
        <template #body="{ data }: { data: User }">
          <p class="font-medium">{{ data.name }}</p>
          <p class="text-sm text-surface-500">{{ data.email }}</p>
        </template>
      </Column>
      <Column header="Peran">
        <template #body="{ data }: { data: User }">{{ roleLabel(data.role) }}</template>
      </Column>
      <Column header="Status">
        <template #body="{ data }: { data: User }">
          <ActiveTag :active="data.isActive" />
        </template>
      </Column>
      <Column header="Dibuat" class="hidden md:table-cell">
        <template #body="{ data }: { data: User }">{{ formatDate(data.createdAt) }}</template>
      </Column>
      <Column header="Aksi" class="text-right">
        <template #body="{ data }: { data: User }">
          <div class="flex justify-end gap-1">
            <Button
              icon="pi pi-pencil"
              severity="secondary"
              variant="text"
              :aria-label="`Ubah ${data.name}`"
              title="Ubah"
              :data-testid="`edit-${data.id}`"
              @click="openForm(data)"
            />
            <Button
              icon="pi pi-key"
              severity="secondary"
              variant="text"
              :aria-label="`Reset password ${data.name}`"
              title="Reset password"
              :data-testid="`reset-${data.id}`"
              @click="openReset(data)"
            />
            <!-- Akun sendiri tidak bisa dinonaktifkan; API juga menolaknya. -->
            <ToggleActiveButton
              v-if="data.id !== session.user?.id"
              :item="data"
              @toggle="toggleActive(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </TableCard>

  <UserFormDialog
    v-model:visible="formOpen"
    :user="selected"
    @saved="onSaved(`${$event.name} disimpan`)"
  />
  <ResetPasswordDialog
    v-model:visible="resetOpen"
    :user="selected"
    @saved="onSaved(`Password ${$event.name} direset`)"
  />
</template>
