<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import { listInstallments, type InstallmentFilter } from '@/api/installments'
import type { Installment } from '@/api/types'
import ErrorState from '@/components/ErrorState.vue'
import FilterSelect from '@/components/FilterSelect.vue'
import MoneyText from '@/components/MoneyText.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { useNotify } from '@/composables/useNotify'
import { formatMonth } from '@/lib/format'
import { progressText } from '@/lib/installments'
import type { Option } from '@/lib/labels'
import { formatRupiah } from '@/lib/money'
import { installmentPath } from '@/router/paths'
import InstallmentFormDialog from './InstallmentFormDialog.vue'
import InstallmentStatusTag from './InstallmentStatusTag.vue'

const notify = useNotify()

const FILTERS: Option<InstallmentFilter>[] = [
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'PAID_OFF', label: 'Lunas' },
]
const filter = ref<InstallmentFilter | null | undefined>('ACTIVE')

const { data, loading, error, reload } = useAsyncData(() => listInstallments({ status: filter.value ?? null }))
watch(filter, reload)
onMounted(reload)

const formOpen = ref(false)

function onSaved(installment: Installment): void {
  notify.success(`${installment.name} disimpan`)
  void reload()
}
</script>

<template>
  <PageHeader title="Cicilan">
    <template #actions>
      <Button label="Tambah cicilan" icon="pi pi-plus" data-testid="add-installment" @click="formOpen = true" />
    </template>
  </PageHeader>

  <ErrorState v-if="error && !data" :message="error" @retry="reload" />
  <template v-else-if="data">
    <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Total cicilan aktif per bulan"
        :amount="data.summary.activeMonthlyTotal"
        data-testid="stat-active-monthly"
      />
      <StatCard
        label="Total sisa cicilan"
        :amount="data.summary.remainingTotal"
        hint="Semua cicilan yang belum lunas"
        data-testid="stat-remaining-total"
      />
      <div class="min-w-0 rounded-xl border border-surface-200 bg-surface-0 p-4" data-testid="stat-unpaid">
        <p class="text-sm text-surface-600">Belum dibayar bulan ini</p>
        <p class="text-xl font-semibold"><MoneyText :amount="data.summary.unpaidTotal" /></p>
        <ul v-if="data.summary.unpaid.length > 0" class="mt-2 text-sm text-surface-700" data-testid="unpaid-list">
          <li v-for="item in data.summary.unpaid" :key="item.id">
            {{ item.name }}: {{ item.months }} bulan, {{ formatRupiah(item.amount) }}
          </li>
        </ul>
        <p v-else class="mt-2 text-sm text-surface-500">Semua cicilan sudah dibayar sampai bulan ini</p>
      </div>
    </div>

    <div class="mb-4 w-full sm:w-56">
      <FilterSelect v-model="filter" :options="FILTERS" placeholder="Semua" label="Status" />
    </div>

    <p v-if="data.items.length === 0" class="py-6 text-center text-surface-500">Belum ada cicilan</p>
    <ul v-else class="flex flex-col gap-3" :aria-busy="loading">
      <li
        v-for="item in data.items"
        :key="item.id"
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-200 bg-surface-0 p-4"
        :data-testid="`installment-${item.id}`"
      >
        <div class="min-w-0">
          <RouterLink :to="installmentPath(item.id)" class="font-medium text-primary-700 hover:underline">
            {{ item.name }}
          </RouterLink>
          <p class="text-sm text-surface-600">
            <MoneyText :amount="item.monthlyAmount" /> per bulan ·
            {{ formatMonth(item.startMonth) }} – {{ formatMonth(item.endMonth) }}
          </p>
          <p class="text-sm text-surface-600" data-testid="installment-amounts">
            Total {{ formatRupiah(item.totalAmount) }} · Dibayar {{ formatRupiah(item.paidAmount) }} · Sisa
            {{ formatRupiah(item.remainingAmount) }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-semibold" data-testid="installment-progress">{{ progressText(item) }}</span>
          <InstallmentStatusTag :status="item.status" />
        </div>
      </li>
    </ul>
  </template>

  <InstallmentFormDialog v-model:visible="formOpen" :installment="null" @saved="onSaved" />
</template>
