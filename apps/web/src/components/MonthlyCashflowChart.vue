<script setup lang="ts">
import { computed } from 'vue'
import type { Cashflow } from '@/api/types'
import MoneyText from '@/components/MoneyText.vue'
import { formatMonth } from '@/lib/format'
import { largest, shareOf } from '@/lib/shares'

/**
 * Arus kas per bulan sebagai pasangan batang masuk dan keluar. Digambar dengan HTML biasa:
 * ketiga angka tiap bulan tertulis di bawah kolomnya (terbaca di layar sentuh dan oleh
 * pembaca layar, tanpa perlu hover), dan tinggi batang dihitung dengan BigInt terhadap
 * angka terbesar di seluruh grafik.
 */
const props = defineProps<{ months: (Cashflow & { month: string })[] }>()

const top = computed(() => largest(props.months.flatMap((m) => [m.income, m.expense])))
const empty = computed(() => top.value === '0')

const columns = computed(() =>
  props.months.map((month) => ({
    ...month,
    label: formatMonth(month.month),
    incomeShare: shareOf(month.income, top.value),
    expenseShare: shareOf(month.expense, top.value),
  })),
)
</script>

<template>
  <p v-if="empty" class="text-surface-500">Belum ada transaksi yang disetujui pada periode ini</p>
  <div v-else>
    <div class="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="legend">
      <span class="flex items-center gap-1.5">
        <span class="inline-block size-3 rounded-sm bg-green-500" aria-hidden="true" />
        Masuk (batang kiri, angka pertama)
      </span>
      <span class="flex items-center gap-1.5">
        <span class="inline-block size-3 rounded-sm bg-red-400" aria-hidden="true" />
        Keluar (batang kanan, angka kedua)
      </span>
      <span class="text-surface-600">Angka ketiga: selisih</span>
    </div>

    <!--
      Periode panjang menggulir di dalam wadah ini, bukan melebarkan halaman. `relative`
      diperlukan supaya teks khusus pembaca layar (posisinya absolut) ikut terpotong di sini;
      tanpa itu teks pada kolom yang jauh di kanan melebarkan halaman.
    -->
    <div class="relative overflow-x-auto pb-2" data-testid="chart-scroll">
      <ol role="list" class="flex gap-2">
        <li
          v-for="column in columns"
          :key="column.month"
          class="flex min-w-32 flex-1 flex-col items-center gap-0.5"
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
          <span class="text-xs font-medium text-surface-700" data-testid="month-label">{{ column.label }}</span>
          <!-- Kata penjelasnya hanya untuk pembaca layar; di layar, warna dan urutannya mengikuti legenda. -->
          <span class="text-xs text-green-700" data-testid="month-income">
            <span class="sr-only">masuk </span><MoneyText :amount="column.income" />
          </span>
          <span class="text-xs text-red-700" data-testid="month-expense">
            <span class="sr-only">keluar </span><MoneyText :amount="column.expense" />
          </span>
          <span class="text-xs font-medium" data-testid="month-net">
            <span class="sr-only">selisih </span><MoneyText :amount="column.net" signed />
          </span>
        </li>
      </ol>
    </div>
  </div>
</template>
