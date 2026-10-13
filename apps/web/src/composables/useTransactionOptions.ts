import { computed, type ComputedRef, type Ref } from 'vue'
import { listAccountOptions } from '@/api/accounts'
import { listCategories } from '@/api/categories'
import { listInstallments } from '@/api/installments'
import type { AccountOption, Category, Installment, TxType } from '@/api/types'
import { useAsyncData } from './useAsyncData'

export interface TransactionOptions {
  accounts: ComputedRef<AccountOption[]>
  /** Kategori aktif yang boleh dipilih; kategori sistem (transfer) tidak termasuk. */
  categories: ComputedRef<Category[]>
  /** Kategori untuk satu tipe; tanpa tipe, semuanya. */
  categoriesFor(type: TxType | null | undefined): Category[]
  /** Semua cicilan dengan kemajuannya, untuk "Cicilan yang dibayar". */
  installments: ComputedRef<Installment[]>
  loading: Ref<boolean>
  error: Ref<string | null>
  reload(): Promise<void>
}

/**
 * Pilihan akun, kategori dan cicilan untuk filter dan form transaksi. Dimuat satu kali saat
 * dibuat; halaman meneruskannya ke bagian-bagian yang membutuhkan.
 */
export function useTransactionOptions(): TransactionOptions {
  const source = useAsyncData(async () => {
    const [accounts, categories, installments] = await Promise.all([
      listAccountOptions(),
      listCategories({ isActive: true }),
      listInstallments(),
    ])
    return {
      accounts,
      categories: categories.filter((category) => !category.isSystem),
      installments: installments.items,
    }
  })

  const accounts = computed(() => source.data.value?.accounts ?? [])
  const categories = computed(() => source.data.value?.categories ?? [])
  const installments = computed(() => source.data.value?.installments ?? [])

  function categoriesFor(type: TxType | null | undefined): Category[] {
    return type ? categories.value.filter((category) => category.type === type) : categories.value
  }

  void source.reload()

  return {
    accounts,
    categories,
    categoriesFor,
    installments,
    loading: source.loading,
    error: source.error,
    reload: source.reload,
  }
}
