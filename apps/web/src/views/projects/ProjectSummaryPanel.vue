<script setup lang="ts">
import { computed, watch } from 'vue'
import ProgressSpinner from 'primevue/progressspinner'
import { getProjectSummary } from '@/api/reports'
import BarList from '@/components/BarList.vue'
import ErrorState from '@/components/ErrorState.vue'
import StatCard from '@/components/StatCard.vue'
import { useAsyncData } from '@/composables/useAsyncData'

/**
 * Ringkasan keuangan sebuah proyek sepanjang umurnya. Semua angka dari API; yang dihitung di
 * sini hanya lebar batang kemajuan.
 */
const props = defineProps<{ projectId: string }>()

const { data: summary, loading, error, reload } = useAsyncData(() =>
  getProjectSummary(props.projectId),
)
watch(
  () => props.projectId,
  () => {
    // Ringkasan proyek sebelumnya tidak ditampilkan selagi proyek lain dimuat.
    summary.value = null
    void reload()
  },
  { immediate: true },
)

const percent = computed(() => summary.value?.receivedPercent ?? null)
/** `33.33` ditulis `33,33`; tanpa nilai kontrak tidak ada persentase untuk ditampilkan. */
const receivedHint = computed(() =>
  percent.value === null
    ? 'Nilai kontrak belum diisi'
    : `${String(percent.value).replace('.', ',')}% dari kontrak`,
)
/** Batang kemajuan berhenti di 100% walau yang diterima melebihi kontrak. */
const progress = computed(() => Math.min(percent.value ?? 0, 100))
// Tanpa nilai kontrak, sisa yang negatif bukan berarti kontraknya dibayar lebih.
const overpaid = computed(
  () => percent.value !== null && (summary.value?.outstanding.startsWith('-') ?? false),
)

const costs = computed(() =>
  (summary.value?.costByCategory ?? []).map(({ categoryId, name, amount }) => ({
    id: categoryId,
    name,
    amount,
  })),
)
</script>

<template>
  <ErrorState v-if="error" :message="error" @retry="reload" />
  <div v-else-if="!summary" class="flex justify-center py-10">
    <ProgressSpinner v-if="loading" aria-label="Memuat" />
  </div>

  <div v-else class="flex flex-col gap-6">
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard label="Nilai kontrak" :amount="summary.contractValue" data-testid="summary-contract" />
      <StatCard
        label="Diterima"
        :amount="summary.received"
        tone="income"
        :hint="receivedHint"
        data-testid="summary-received"
      >
        <div v-if="progress > 0" class="mt-2 h-2 rounded-full bg-surface-100">
          <div
            class="h-2 rounded-full bg-green-500"
            :style="{ width: `${progress}%` }"
            aria-hidden="true"
            data-testid="received-progress"
          />
        </div>
      </StatCard>
      <StatCard
        label="Sisa belum diterima"
        :amount="summary.outstanding"
        :hint="overpaid ? 'Diterima melebihi nilai kontrak' : undefined"
        data-testid="summary-outstanding"
      />
      <StatCard label="Biaya" :amount="summary.cost" tone="expense" data-testid="summary-cost" />
      <StatCard
        label="Selisih kas"
        :amount="summary.cashDifference"
        hint="Diterima dikurangi biaya"
        data-testid="summary-difference"
      />
    </div>

    <p v-if="summary.pendingCount > 0" class="text-surface-600">
      <i class="pi pi-clock" aria-hidden="true" />
      {{ summary.pendingCount }} transaksi menunggu ditinjau; belum termasuk dalam angka di atas.
    </p>

    <section class="rounded-xl border border-surface-200 bg-surface-0 p-4">
      <h2 class="mb-3 text-lg font-semibold">Biaya per kategori</h2>
      <BarList :items="costs" tone="expense" empty-text="Belum ada biaya yang disetujui" />
    </section>
  </div>
</template>
