<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import ProgressSpinner from 'primevue/progressspinner'
import Tag from 'primevue/tag'
import { ApiError } from '@/api/http'
import { getCompanyDashboard } from '@/api/reports'
import type { CompanyDashboard, Period } from '@/api/types'
import BarList from '@/components/BarList.vue'
import ErrorState from '@/components/ErrorState.vue'
import MoneyText from '@/components/MoneyText.vue'
import MonthlyCashflowChart from '@/components/MonthlyCashflowChart.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatCard from '@/components/StatCard.vue'
import { useAsyncData } from '@/composables/useAsyncData'
import { formatCalendarDate } from '@/lib/format'
import { accountTypeLabel } from '@/lib/labels'
import { PATHS } from '@/router/paths'
import PeriodPicker from './PeriodPicker.vue'
import RecentTransactions from './RecentTransactions.vue'

/** Periode yang diminta pengguna; bagian yang kosong diisi bawaan API. */
const period = ref<Partial<Period>>({})
const periodErrors = ref<Record<string, string>>({})

async function load(): Promise<CompanyDashboard> {
  const asked = period.value
  try {
    return await getCompanyDashboard(asked)
  } catch (cause) {
    // Keberatan API atas periode ditampilkan di bawah tanggal yang disebutnya.
    if (cause instanceof ApiError && cause.fieldErrors.length > 0 && asked === period.value) {
      periodErrors.value = Object.fromEntries(
        cause.fieldErrors.map(({ field, messages }) => [field, messages[0] ?? cause.message]),
      )
    }
    throw cause
  }
}

// Angka terakhir yang berhasil dimuat tetap tampil selagi, atau bila, permintaan berikutnya gagal.
const { data: dashboard, loading, error, reload } = useAsyncData(load)

const hasPeriodError = computed(() => Object.keys(periodErrors.value).length > 0)

function changePeriod(next: Partial<Period>): void {
  period.value = next
  // Tanggal kalender `YYYY-MM-DD` bisa dibandingkan langsung sebagai teks.
  if (next.from && next.to && next.from > next.to) {
    periodErrors.value = { from: 'Tanggal awal tidak boleh setelah tanggal akhir' }
    return
  }
  periodErrors.value = {}
  void reload()
}

const categories = computed(() =>
  (dashboard.value?.expenseByCategory ?? []).map(({ categoryId, name, amount }) => ({
    id: categoryId,
    name,
    amount,
  })),
)
const scopes = computed(() => {
  const scope = dashboard.value?.expenseByScope
  if (!scope) return []
  return [
    { id: 'overhead', name: 'Overhead (tanpa proyek)', amount: scope.overhead },
    { id: 'project', name: 'Proyek', amount: scope.project },
  ]
})

onMounted(reload)
</script>

<template>
  <PageHeader title="Dashboard" />

  <ErrorState v-if="error && !dashboard" :message="error" @retry="reload" />
  <div v-else-if="!dashboard" class="flex justify-center py-10">
    <ProgressSpinner v-if="loading" aria-label="Memuat" />
  </div>

  <template v-else>
    <PeriodPicker
      :model-value="period"
      :resolved="dashboard.period"
      :errors="periodErrors"
      @update:model-value="changePeriod"
    />

    <Message v-if="error && !hasPeriodError" severity="warn" :closable="false" class="mb-4">
      <div class="flex flex-wrap items-center gap-3">
        <span>Data terbaru gagal dimuat: {{ error }}</span>
        <Button
          label="Coba lagi"
          size="small"
          severity="secondary"
          :loading="loading"
          data-testid="retry-reload"
          @click="reload"
        />
      </div>
    </Message>

    <div
      class="flex flex-col gap-6 transition-opacity"
      :class="{ 'opacity-60': loading }"
      :aria-busy="loading"
      data-testid="figures"
    >
      <p class="text-sm text-surface-600">
        Periode:
        <span class="font-medium" data-testid="period-covered"
          >{{ formatCalendarDate(dashboard.period.from) }} –
          {{ formatCalendarDate(dashboard.period.to) }}</span
        >
      </p>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total saldo"
          :amount="dashboard.totalBalance"
          hint="Saldo saat ini, semua akun"
          data-testid="stat-balance"
        />
        <StatCard label="Masuk" :amount="dashboard.totals.income" tone="income" data-testid="stat-income" />
        <StatCard label="Keluar" :amount="dashboard.totals.expense" tone="expense" data-testid="stat-expense" />
        <StatCard
          label="Selisih"
          :amount="dashboard.totals.net"
          hint="Masuk dikurangi keluar"
          data-testid="stat-net"
        />
      </div>

      <RouterLink
        v-if="dashboard.pendingCount > 0"
        :to="{ path: PATHS.transactions, query: { status: 'PENDING' } }"
        class="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 font-medium text-amber-900 hover:underline"
        data-testid="pending-link"
      >
        <i class="pi pi-clock" aria-hidden="true" />
        {{ dashboard.pendingCount }} transaksi menunggu ditinjau
      </RouterLink>
      <p v-else class="text-surface-600">Tidak ada transaksi yang menunggu.</p>

      <section class="rounded-xl border border-surface-200 bg-surface-0 p-4">
        <h2 class="mb-3 text-lg font-semibold">Arus kas per bulan</h2>
        <MonthlyCashflowChart :months="dashboard.monthly" />
      </section>

      <div class="grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border border-surface-200 bg-surface-0 p-4">
          <h2 class="mb-3 text-lg font-semibold">Pengeluaran per kategori</h2>
          <BarList
            :items="categories"
            tone="expense"
            empty-text="Belum ada pengeluaran pada periode ini"
          />
        </section>
        <section class="rounded-xl border border-surface-200 bg-surface-0 p-4">
          <h2 class="mb-3 text-lg font-semibold">Overhead dan proyek</h2>
          <BarList :items="scopes" tone="expense" empty-text="Belum ada pengeluaran pada periode ini" />
        </section>
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border border-surface-200 bg-surface-0 p-4">
          <h2 class="mb-3 text-lg font-semibold">Saldo akun saat ini</h2>
          <p v-if="dashboard.accounts.length === 0" class="text-surface-500">Belum ada akun</p>
          <ul v-else class="divide-y divide-surface-200">
            <li
              v-for="account in dashboard.accounts"
              :key="account.id"
              class="flex items-center justify-between gap-3 py-2"
              data-testid="account-row"
            >
              <span class="min-w-0">
                <span class="font-medium break-words">{{ account.name }}</span>
                <span class="text-sm text-surface-500"> · {{ accountTypeLabel(account.type) }}</span>
                <Tag v-if="!account.isActive" severity="secondary" value="Nonaktif" class="ml-2" />
              </span>
              <MoneyText :amount="account.balance" class="font-medium" />
            </li>
          </ul>
        </section>
        <section class="rounded-xl border border-surface-200 bg-surface-0 p-4">
          <h2 class="mb-3 text-lg font-semibold">Transaksi terbaru</h2>
          <RecentTransactions :transactions="dashboard.recentTransactions" />
        </section>
      </div>
    </div>
  </template>
</template>
