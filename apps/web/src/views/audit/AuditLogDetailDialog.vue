<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import Dialog from 'primevue/dialog'
import type { AuditLog } from '@/api/types'
import { changedFields } from '@/lib/audit'
import { formatDateTime } from '@/lib/format'
import { auditActionLabel, auditEntityLabel } from '@/lib/labels'
import { transactionPath } from '@/router/paths'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Rincian satu catatan audit: siapa, kapan, dan field mana yang berubah. Semua nilai
 * ditampilkan sebagai teks biasa; tidak ada isi catatan yang dirender sebagai HTML.
 */
const props = defineProps<{ log: AuditLog | null }>()
const visible = defineModel<boolean>('visible', { required: true })

const changes = computed(() => (props.log ? changedFields(props.log.before, props.log.after) : []))
/** Judul rincian: hanya tindakan membuat yang menghasilkan data baru. */
const heading = computed(() => {
  if (props.log?.action === 'CREATE') return 'Data baru'
  return props.log?.before ? 'Yang berubah' : 'Rincian'
})
/** Hanya transaksi yang punya halaman sendiri, dan hanya bila id-nya memang sebuah id. */
const transactionLink = computed(() =>
  props.log?.entityType === 'transaction' && UUID.test(props.log.entityId)
    ? transactionPath(props.log.entityId)
    : null,
)
</script>

<template>
  <Dialog
    v-model:visible="visible"
    header="Rincian catatan"
    modal
    dismissable-mask
    :draggable="false"
    :style="{ width: '40rem' }"
    :breakpoints="{ '720px': '95vw' }"
  >
    <template v-if="log">
      <dl class="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt class="text-sm text-surface-500">Waktu</dt>
          <dd class="font-medium">{{ formatDateTime(log.createdAt) }}</dd>
        </div>
        <div>
          <dt class="text-sm text-surface-500">Pengguna</dt>
          <dd class="font-medium">{{ log.user?.name ?? 'Tidak dikenal' }}</dd>
        </div>
        <div>
          <dt class="text-sm text-surface-500">Tindakan</dt>
          <dd class="font-medium">{{ auditActionLabel(log.action) }}</dd>
        </div>
        <div>
          <dt class="text-sm text-surface-500">Alamat IP</dt>
          <dd class="font-medium">{{ log.ip ?? '-' }}</dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="text-sm text-surface-500">{{ auditEntityLabel(log.entityType) }}</dt>
          <dd class="font-mono text-sm break-all">
            <RouterLink
              v-if="transactionLink"
              :to="transactionLink"
              class="text-primary-700 hover:underline"
              >{{ log.entityId }}</RouterLink
            >
            <template v-else>{{ log.entityId }}</template>
          </dd>
        </div>
      </dl>

      <p v-if="changes.length === 0" class="text-surface-500">Tidak ada rincian perubahan</p>
      <template v-else>
        <h3 class="mb-2 font-semibold">{{ heading }}</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-surface-200 text-left text-surface-500">
                <th scope="col" class="py-1 pr-3 font-medium">Isian</th>
                <th scope="col" class="py-1 pr-3 font-medium">Sebelum</th>
                <th scope="col" class="py-1 font-medium">Sesudah</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="change in changes"
                :key="change.field"
                class="border-b border-surface-100 align-top"
                data-testid="change-row"
              >
                <td class="py-1 pr-3 font-mono">{{ change.field }}</td>
                <td class="py-1 pr-3 break-all text-surface-600">{{ change.before }}</td>
                <td class="py-1 font-medium break-all">{{ change.after }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
  </Dialog>
</template>
