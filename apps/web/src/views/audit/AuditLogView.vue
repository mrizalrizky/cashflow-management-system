<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Column from 'primevue/column'
import Message from 'primevue/message'
import { listAuditLogs, type AuditLogFilters } from '@/api/audit-logs'
import type { AuditLog } from '@/api/types'
import { listUsers } from '@/api/users'
import DateRangeFilter, { type DateRange } from '@/components/DateRangeFilter.vue'
import FilterBar from '@/components/FilterBar.vue'
import FilterSelect from '@/components/FilterSelect.vue'
import PagedTable from '@/components/PagedTable.vue'
import PageHeader from '@/components/PageHeader.vue'
import RowActionButton from '@/components/RowActionButton.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { usePagedList } from '@/composables/usePagedList'
import { formatDateTime } from '@/lib/format'
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_ENTITY_OPTIONS,
  auditActionLabel,
  auditEntityLabel,
  type Option,
} from '@/lib/labels'
import AuditLogDetailDialog from './AuditLogDetailDialog.vue'

const ENTITY_TYPE = /^[a-z_]{1,50}$/
const ENTITY_ID_MAX = 100
const USERS_SHOWN = 100

/**
 * Halaman lain bisa membuka log ini pada riwayat satu data, mis. dari halaman transaksi
 * (`?entityType=transaction&entityId=...`). Dibaca sekali saat dibuka; hanya diterima bila
 * keduanya berbentuk wajar, selebihnya diabaikan.
 */
function recordFromAddress(): Pick<AuditLogFilters, 'entityType' | 'entityId'> {
  const { entityType, entityId } = useRoute().query
  const valid =
    typeof entityType === 'string' &&
    ENTITY_TYPE.test(entityType) &&
    typeof entityId === 'string' &&
    entityId.length > 0 &&
    entityId.length <= ENTITY_ID_MAX
  return valid ? { entityType, entityId } : {}
}

const list = usePagedList<AuditLog, AuditLogFilters>(listAuditLogs, {
  entityType: undefined,
  entityId: undefined,
  userId: undefined,
  action: undefined,
  dateFrom: undefined,
  dateTo: undefined,
  ...recordFromAddress(),
})
const { filters } = list

const dates = ref<InstanceType<typeof DateRangeFilter> | null>(null)
const range = computed<DateRange>({
  get: () => ({ from: filters.dateFrom ?? undefined, to: filters.dateTo ?? undefined }),
  set: (next) => Object.assign(filters, { dateFrom: next.from, dateTo: next.to }),
})

// Pilihan pengguna untuk filter; daftar tetap bisa dibaca walau ini gagal dimuat.
const users = useAsyncData(() => listUsers({ page: 1, pageSize: USERS_SHOWN }))
const userOptions = computed<Option<string>[]>(() =>
  (users.data.value?.data ?? []).map((user) => ({ value: user.id, label: user.name })),
)

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

function reset(): void {
  dates.value?.clear()
  Object.assign(filters, {
    entityType: undefined,
    entityId: undefined,
    userId: undefined,
    action: undefined,
    dateFrom: undefined,
    dateTo: undefined,
  })
}

const selected = ref<AuditLog | null>(null)
const detailOpen = ref(false)

function showDetail(log: AuditLog): void {
  selected.value = log
  detailOpen.value = true
}

onMounted(() => {
  void list.reload()
  void users.reload()
})
</script>

<template>
  <PageHeader title="Audit log" />

  <Message
    v-if="filters.entityId"
    severity="info"
    :closable="false"
    class="mb-4"
    data-testid="record-notice"
  >
    <div class="flex flex-wrap items-center gap-3">
      <span>
        Riwayat satu data: {{ auditEntityLabel(filters.entityType ?? '') }}
        <span class="font-mono">{{ shortId(filters.entityId) }}</span>
      </span>
      <Button
        label="Tampilkan semua"
        size="small"
        severity="secondary"
        data-testid="clear-record"
        @click="filters.entityId = undefined"
      />
    </div>
  </Message>

  <FilterBar>
    <FilterSelect
      v-model="filters.entityType"
      :options="AUDIT_ENTITY_OPTIONS"
      placeholder="Semua jenis data"
      label="Jenis data"
    />
    <FilterSelect
      v-model="filters.action"
      :options="AUDIT_ACTION_OPTIONS"
      placeholder="Semua tindakan"
      label="Tindakan"
    />
    <FilterSelect
      v-model="filters.userId"
      :options="userOptions"
      placeholder="Semua pengguna"
      label="Pengguna"
    />
    <DateRangeFilter ref="dates" v-model="range" id-prefix="audit-date" />
    <div class="flex items-center justify-end sm:col-span-2">
      <Button
        label="Reset"
        icon="pi pi-filter-slash"
        severity="secondary"
        text
        data-testid="reset-filters"
        @click="reset"
      />
    </div>
  </FilterBar>

  <PagedTable :list="list" empty-text="Belum ada catatan" no-match-text="Tidak ada catatan yang cocok">
    <Column header="Waktu" class="whitespace-nowrap">
      <template #body="{ data }: { data: AuditLog }">{{ formatDateTime(data.createdAt) }}</template>
    </Column>
    <Column header="Pengguna">
      <template #body="{ data }: { data: AuditLog }">
        <template v-if="data.user">{{ data.user.name }}</template>
        <span v-else class="text-surface-500">Tidak dikenal</span>
      </template>
    </Column>
    <Column header="Tindakan">
      <template #body="{ data }: { data: AuditLog }">
        <span class="font-medium">{{ auditActionLabel(data.action) }}</span>
      </template>
    </Column>
    <Column header="Data">
      <template #body="{ data }: { data: AuditLog }">
        {{ auditEntityLabel(data.entityType) }}
        <span class="font-mono text-sm text-surface-500">{{ shortId(data.entityId) }}</span>
      </template>
    </Column>
    <Column header="Alamat IP" class="hidden md:table-cell">
      <template #body="{ data }: { data: AuditLog }">{{ data.ip ?? '-' }}</template>
    </Column>
    <Column header="Rincian" class="text-right">
      <template #body="{ data }: { data: AuditLog }">
        <RowActionButton
          icon="pi pi-eye"
          label="Lihat rincian"
          :test-id="`detail-${data.id}`"
          @click="showDetail(data)"
        />
      </template>
    </Column>
  </PagedTable>

  <AuditLogDetailDialog v-model:visible="detailOpen" :log="selected" />
</template>
