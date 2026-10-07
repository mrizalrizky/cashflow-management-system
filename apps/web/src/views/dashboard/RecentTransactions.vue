<script setup lang="ts">
import { RouterLink } from 'vue-router'
import Tag from 'primevue/tag'
import type { Transaction } from '@/api/types'
import SignedAmount from '@/components/SignedAmount.vue'
import TransactionStatusTag from '@/components/TransactionStatusTag.vue'
import { projectLabel } from '@/composables/useTransactionOptions'
import { formatCalendarDate } from '@/lib/format'
import { transactionPath } from '@/router/paths'

/** Daftar ringkas transaksi yang terakhir dicatat; rinciannya ada di halaman transaksi. */
defineProps<{ transactions: Transaction[] }>()
</script>

<template>
  <p v-if="transactions.length === 0" class="text-surface-500">Belum ada transaksi</p>
  <ul v-else class="divide-y divide-surface-200">
    <li
      v-for="transaction in transactions"
      :key="transaction.id"
      class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"
      data-testid="recent-row"
    >
      <div class="min-w-0">
        <RouterLink
          :to="transactionPath(transaction.id)"
          class="font-medium break-words text-primary-700 hover:underline"
          >{{ transaction.description }}</RouterLink
        >
        <p class="text-sm text-surface-500">
          {{ formatCalendarDate(transaction.transactionDate) }} ·
          <Tag v-if="transaction.isTransfer" severity="info" value="Transfer" />
          <template v-else-if="transaction.project">{{ projectLabel(transaction.project) }}</template>
          <template v-else>Overhead</template>
        </p>
      </div>
      <div class="flex items-center gap-3">
        <SignedAmount
          :type="transaction.type"
          :amount="transaction.amount"
          :counted="transaction.status === 'APPROVED'"
        />
        <TransactionStatusTag :status="transaction.status" />
      </div>
    </li>
  </ul>
</template>
