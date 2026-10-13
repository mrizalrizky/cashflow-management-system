import type { Category, TxType } from '../generated/prisma/client.js';

export interface CategoryResponse {
  id: string;
  name: string;
  type: TxType;
  isSystem: boolean;
  isActive: boolean;
  /** Transaksi pengeluaran berkategori ini wajib memilih cicilan. */
  isInstallment: boolean;
}

export function toCategoryResponse(category: Category): CategoryResponse {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    isSystem: category.is_system,
    isActive: category.is_active,
    isInstallment: category.is_installment,
  };
}
