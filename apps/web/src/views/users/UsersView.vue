<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable, { type DataTablePageEvent } from 'primevue/datatable'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import { useConfirm } from 'primevue/useconfirm'
import { useToast } from 'primevue/usetoast'
import type { User } from '@/api/types'
import { listUsers, updateUser, type UserFilters } from '@/api/users'
import ErrorState from '@/components/ErrorState.vue'
import PageHeader from '@/components/PageHeader.vue'
import { useDebouncedInput } from '@/composables/useDebouncedInput'
import { usePagedList } from '@/composables/usePagedList'
import { errorMessage } from '@/lib/errors'
import { formatDate } from '@/lib/format'
import { ROLE_OPTIONS, roleLabel } from '@/lib/roles'
import { useSessionStore } from '@/stores/session'
import ResetPasswordDialog from './ResetPasswordDialog.vue'
import UserFormDialog from './UserFormDialog.vue'

const STATUS_OPTIONS = [
  { label: 'Aktif', value: true },
  { label: 'Nonaktif', value: false },
]
const TOAST_LIFE_MS = 4000

const session = useSessionStore()
const confirm = useConfirm()
const toast = useToast()

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

function notifySaved(message: string): void {
  toast.add({ severity: 'success', summary: message, life: TOAST_LIFE_MS })
  void list.reload()
}

async function setActive(user: User, isActive: boolean): Promise<void> {
  try {
    await updateUser(user.id, { isActive })
    notifySaved(`${user.name} ${isActive ? 'diaktifkan' : 'dinonaktifkan'}`)
  } catch (cause) {
    toast.add({
      severity: 'error',
      summary: errorMessage(cause, 'Gagal menyimpan perubahan'),
      life: TOAST_LIFE_MS,
    })
  }
}

function toggleActive(user: User): void {
  if (!user.isActive) {
    void setActive(user, true)
    return
  }
  confirm.require({
    header: 'Nonaktifkan pengguna',
    message: `Nonaktifkan ${user.name}? Ia langsung keluar dan tidak bisa login lagi.`,
    acceptLabel: 'Nonaktifkan',
    rejectLabel: 'Batal',
    acceptProps: { severity: 'danger' },
    rejectProps: { severity: 'secondary', variant: 'text' },
    accept: () => void setActive(user, false),
  })
}

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
      :options="STATUS_OPTIONS"
      option-label="label"
      option-value="value"
      placeholder="Semua status"
      aria-label="Status"
      show-clear
      fluid
    />
  </div>

  <ErrorState v-if="error" :message="error" @retry="list.reload" />

  <!-- Tabel menggulir di dalam wadahnya sendiri supaya halaman tidak melebar di layar kecil. -->
  <div v-else class="overflow-x-auto rounded-xl border border-surface-200 bg-surface-0">
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
          <Tag
            :severity="data.isActive ? 'success' : 'secondary'"
            :value="data.isActive ? 'Aktif' : 'Nonaktif'"
          />
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
            <Button
              v-if="data.id !== session.user?.id"
              :icon="data.isActive ? 'pi pi-ban' : 'pi pi-check-circle'"
              :severity="data.isActive ? 'danger' : 'success'"
              variant="text"
              :aria-label="`${data.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${data.name}`"
              :title="data.isActive ? 'Nonaktifkan' : 'Aktifkan'"
              :data-testid="`toggle-${data.id}`"
              @click="toggleActive(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>

  <UserFormDialog
    v-model:visible="formOpen"
    :user="selected"
    @saved="notifySaved(`${$event.name} disimpan`)"
  />
  <ResetPasswordDialog
    v-model:visible="resetOpen"
    :user="selected"
    @saved="notifySaved(`Password ${$event.name} direset`)"
  />
</template>
