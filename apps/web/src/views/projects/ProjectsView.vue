<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import { listProjects, type ProjectFilters } from '@/api/projects'
import type { Project } from '@/api/types'
import FilterBar from '@/components/FilterBar.vue'
import FilterSelect from '@/components/FilterSelect.vue'
import PagedTable from '@/components/PagedTable.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProjectStatusTag from '@/components/ProjectStatusTag.vue'
import { useDebouncedInput } from '@/composables/useDebouncedInput'
import { useNotify } from '@/composables/useNotify'
import { usePagedList } from '@/composables/usePagedList'
import { PROJECT_STATUS_OPTIONS } from '@/lib/labels'
import { formatRupiah } from '@/lib/money'
import { projectPath } from '@/router/paths'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/stores/session'
import ProjectFormDialog from './ProjectFormDialog.vue'

const { isAdmin } = storeToRefs(useSessionStore())
const notify = useNotify()

const list = usePagedList<Project, ProjectFilters>(listProjects, {
  search: undefined,
  status: undefined,
})
const { filters } = list

const search = useDebouncedInput((value) => {
  filters.search = value || undefined
})

const formOpen = ref(false)

function onSaved(project: Project): void {
  notify.success(`${project.code} disimpan`)
  void list.reload()
}

onMounted(list.reload)
</script>

<template>
  <PageHeader :title="isAdmin ? 'Proyek' : 'Proyek Saya'">
    <template v-if="isAdmin" #actions>
      <Button
        label="Tambah proyek"
        icon="pi pi-plus"
        data-testid="add-project"
        @click="formOpen = true"
      />
    </template>
  </PageHeader>

  <FilterBar>
    <InputText
      id="project-search"
      v-model="search"
      placeholder="Cari kode, nama, atau klien"
      aria-label="Cari kode, nama, atau klien"
      fluid
    />
    <FilterSelect
      v-model="filters.status"
      :options="PROJECT_STATUS_OPTIONS"
      placeholder="Semua status"
      label="Status"
    />
  </FilterBar>

  <PagedTable
    :list="list"
    :empty-text="isAdmin ? 'Belum ada proyek' : 'Anda belum ditugaskan ke proyek mana pun'"
    no-match-text="Tidak ada proyek yang cocok"
  >
    <Column header="Proyek">
      <template #body="{ data }: { data: Project }">
        <RouterLink :to="projectPath(data.id)" class="font-medium text-primary-700 hover:underline">
          {{ data.code }} · {{ data.name }}
        </RouterLink>
        <p class="text-sm text-surface-500">{{ data.clientName }}</p>
      </template>
    </Column>
    <Column header="Nilai kontrak" class="text-right">
      <template #body="{ data }: { data: Project }">{{ formatRupiah(data.contractValue) }}</template>
    </Column>
    <Column header="Nilai kontrak + PPN" class="text-right">
      <template #body="{ data }: { data: Project }">
        {{ formatRupiah(data.contractValueWithPpn) }}
      </template>
    </Column>
    <Column header="Status">
      <template #body="{ data }: { data: Project }"><ProjectStatusTag :status="data.status" /></template>
    </Column>
    <Column header="Koordinator" class="hidden md:table-cell">
      <template #body="{ data }: { data: Project }">
        {{ data.members.map((member) => member.name).join(', ') || '-' }}
      </template>
    </Column>
  </PagedTable>

  <ProjectFormDialog v-if="isAdmin" v-model:visible="formOpen" :project="null" @saved="onSaved" />
</template>
