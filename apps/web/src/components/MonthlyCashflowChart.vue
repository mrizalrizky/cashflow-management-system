<script setup lang="ts">
import { computed } from 'vue'
import type { Cashflow } from '@/api/types'
import MoneyText from '@/components/MoneyText.vue'
import { formatMonth } from '@/lib/format'
import { formatRupiah } from '@/lib/money'
import { largest, shareOf } from '@/lib/shares'

/**
 * Arus kas per bulan sebagai pasangan batang masuk dan keluar. Digambar dengan HTML biasa:
 * tiap angka tetap berupa teks (di bawah kolom dan sebagai keterangan kolom), dan tinggi
 * batang dihitung dengan BigInt terhadap angka terbesar di seluruh grafik.
 */
const props = defineProps<{ months: (Cashflow & { month: string })[] }>()

const top = computed(() => largest(props.months.flatMap((m) => [m.income, m.expense])))
const empty = computed(() => top.value === '0')

const columns = computed(() =>
  props.months.map((month) => {
    const label = formatMonth(month.month)
    return {
      ...month,
      label,
      incomeShare: shareOf(month.income, top.value),
      expenseShare: shareOf(month.expense, top.value),
      description:
        `${label}: masuk ${formatRupiah(month.income)}, keluar ${formatRupiah(month.expense)}, ` +
        `selisih ${formatRupiah(month.net)}`,
    }
  }),
)
</script>

<template>
  <p v-if="empty" class="text-surface-500">Belum ada transaksi yang disetujui pada periode ini</p>
  <div v-else>
    <div class="mb-3 flex gap-4 text-sm" data-testid="legend">
      <span class="flex items-center gap-1.5">
        <span class="inline-block size-3 rounded-sm bg-green-500" aria-hidden="true" />
        Masuk (batang kiri)
      </span>
      <span class="flex items-center gap-1.5">
        <span class="inline-block size-3 rounded-sm bg-red-400" aria-hidden="true" />
        Keluar (batang kanan)
      </span>
    </div>

    <!-- Periode panjang menggulir di dalam wadah ini, bukan melebarkan halaman. -->
    <div class="overflow-x-auto pb-2" data-testid="chart-scroll">
      <ol role="list" class="flex gap-2">
        <li
          v-for="column in columns"
          :key="column.month"
          class="flex min-w-20 flex-1 flex-col items-center gap-1"
          :aria-label="column.description"
          :title="column.description"
        >
          <div class="flex h-40 w-full items-end justify-center gap-1 border-b border-surface-200">
            <div class="flex h-full w-5 items-end">
              <div
                v-if="column.incomeShare > 0"
                class="w-full rounded-t bg-green-500"
                :style="{ height: `${column.incomeShare}%` }"
                aria-hidden="true"
                data-testid="bar-income"
              />
            </div>
            <div class="flex h-full w-5 items-end">
              <div
                v-if="column.expenseShare > 0"
                class="w-full rounded-t bg-red-400"
                :style="{ height: `${column.expenseShare}%` }"
                aria-hidden="true"
                data-testid="bar-expense"
              />
            </div>
          </div>
          <span class="text-xs text-surface-600" data-testid="month-label">{{ column.label }}</span>
          <span class="text-xs font-medium" data-testid="month-net">
            <MoneyText :amount="column.net" signed />
          </span>
        </li>
      </ol>
    </div>
  </div>
</template>
