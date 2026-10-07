<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import Button from 'primevue/button'
import ProgressSpinner from 'primevue/progressspinner'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import { getProject } from '@/api/projects'
import type { Project } from '@/api/types'
import ErrorState from '@/components/ErrorState.vue'
import PageHeader from '@/components/PageHeader.vue'
import ProjectStatusTag from '@/components/ProjectStatusTag.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { useNotify } from '@/composables/useNotify'
import { formatCalendarDate } from '@/lib/format'
import { formatRupiah } from '@/lib/money'
import { PATHS } from '@/router/paths'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/stores/session'
import ProjectFormDialog from './ProjectFormDialog.vue'
import ProjectMembersPanel from './ProjectMembersPanel.vue'

// 404: tidak ada atau bukan proyeknya. 400: id di alamat bukan id yang sah (salah ketik).
const NOT_FOUND_STATUSES = [400, 404]

const route = useRoute()
const { isAdmin } = storeToRefs(useSessionStore())
const notify = useNotify()

const projectId = computed(() => String(route.params.id))

const { data: project, loading, error, errorStatus, reload } = useAsyncData(() =>
  getProject(projectId.value),
)
watch(
  projectId,
  () => {
    // Proyek sebelumnya tidak ditampilkan selagi proyek lain dimuat.
    project.value = null
    void reload()
  },
  { immediate: true },
)

// Proyek orang lain dijawab API sama seperti proyek yang tidak ada.
const notFound = computed(
  () => errorStatus.value !== null && NOT_FOUND_STATUSES.includes(errorStatus.value),
)

const details = computed(() =>
  project.value
    ? [
        { id: 'client', label: 'Klien', value: project.value.clientName },
        { id: 'contract', label: 'Nilai kontrak', value: formatRupiah(project.value.contractValue) },
        { id: 'start', label: 'Tanggal mulai', value: formatCalendarDate(project.value.startDate) },
        { id: 'end', label: 'Tanggal selesai', value: formatCalendarDate(project.value.endDate) },
        { id: 'notes', label: 'Catatan', value: project.value.notes || '-' },
      ]
    : [],
)

const formOpen = ref(false)

function onSaved(saved: Project): void {
  project.value = saved
  notify.success(`${saved.code} disimpan`)
}
</script>

<template>
  <RouterLink
    :to="PATHS.projects"
    class="mb-3 inline-flex items-center gap-2 text-sm text-primary-700 hover:underline"
    data-testid="back-to-projects"
  >
    <i class="pi pi-arrow-left" aria-hidden="true" />
    Kembali ke daftar proyek
  </RouterLink>

  <p v-if="notFound" class="py-6 text-surface-600">Proyek tidak ditemukan.</p>
  <ErrorState v-else-if="error" :message="error" @retry="reload" />
  <div v-else-if="!project" class="flex justify-center py-10">
    <ProgressSpinner v-if="loading" aria-label="Memuat" />
  </div>

  <template v-else>
    <PageHeader :title="`${project.code} · ${project.name}`">
      <template #actions>
        <ProjectStatusTag :status="project.status" />
        <Button
          v-if="isAdmin"
          label="Ubah proyek"
          icon="pi pi-pencil"
          severity="secondary"
          data-testid="edit-project"
          @click="formOpen = true"
        />
      </template>
    </PageHeader>

    <dl class="mb-6 grid gap-4 rounded-xl border border-surface-200 bg-surface-0 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="item in details"
        :key="item.id"
        class="min-w-0"
        :class="{ 'sm:col-span-2 lg:col-span-4': item.id === 'notes' }"
      >
        <dt class="text-sm text-surface-500">{{ item.label }}</dt>
        <dd class="font-medium break-words whitespace-pre-line" :data-testid="`project-${item.id}`">{{ item.value }}</dd>
      </div>
    </dl>

    <Tabs value="members" lazy>
      <TabList>
        <Tab value="members">Anggota</Tab>
        <Tab value="transactions">Transaksi</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="members">
          <ProjectMembersPanel :project="project" @updated="project = $event" />
        </TabPanel>
        <TabPanel value="transactions">
          <p class="text-surface-600">Daftar transaksi proyek dibangun pada fase berikutnya.</p>
        </TabPanel>
      </TabPanels>
    </Tabs>

    <ProjectFormDialog v-if="isAdmin" v-model:visible="formOpen" :project="project" @saved="onSaved" />
  </template>
</template>
