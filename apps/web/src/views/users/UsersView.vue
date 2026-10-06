<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import type { User } from '@/api/types'
import { listUsers, updateUser, type UserFilters } from '@/api/users'
import ActiveTag from '@/components/ActiveTag.vue'
import FilterBar from '@/components/FilterBar.vue'
import FilterSelect from '@/components/FilterSelect.vue'
import PagedTable from '@/components/PagedTable.vue'
import PageHeader from '@/components/PageHeader.vue'
import RowActionButton from '@/components/RowActionButton.vue'
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
const { filters } = list

const search = useDebouncedInput((value) => {
  filters.search = value || undefined
})

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

  <FilterBar>
    <InputText
      id="user-search"
      v-model="search"
      placeholder="Cari nama atau email"
      aria-label="Cari nama atau email"
      fluid
    />
    <FilterSelect v-model="filters.role" :options="ROLE_OPTIONS" placeholder="Semua peran" label="Peran" />
    <FilterSelect
      v-model="filters.isActive"
      :options="ACTIVE_OPTIONS"
      placeholder="Semua status"
      label="Status"
    />
  </FilterBar>

  <PagedTable
    :list="list"
    empty-text="Belum ada pengguna"
    no-match-text="Tidak ada pengguna yang cocok"
  >
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
      <template #body="{ data }: { data: User }"><ActiveTag :active="data.isActive" /></template>
    </Column>
    <Column header="Dibuat" class="hidden md:table-cell">
      <template #body="{ data }: { data: User }">{{ formatDate(data.createdAt) }}</template>
    </Column>
    <Column header="Aksi" class="text-right">
      <template #body="{ data }: { data: User }">
        <div class="flex justify-end gap-1">
          <RowActionButton
            icon="pi pi-pencil"
            :label="`Ubah ${data.name}`"
            :test-id="`edit-${data.id}`"
            @click="openForm(data)"
          />
          <RowActionButton
            icon="pi pi-key"
            :label="`Reset password ${data.name}`"
            :test-id="`reset-${data.id}`"
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
  </PagedTable>

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
