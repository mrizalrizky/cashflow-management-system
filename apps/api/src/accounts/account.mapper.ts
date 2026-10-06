import { fromMoney } from '../common/money.js';
import type { Account, AccountType } from '../generated/prisma/client.js';

/** Akun beserta saldonya saat ini. */
export interface AccountWithBalance {
  account: Account;
  balance: bigint;
}

export interface AccountResponse {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: string;
  balance: string;
  isActive: boolean;
  createdAt: string;
}

/** Untuk dropdown semua peran: sengaja tanpa saldo. */
export interface AccountOption {
  id: string;
  name: string;
  type: AccountType;
}

export function toAccountResponse({ account, balance }: AccountWithBalance): AccountResponse {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    openingBalance: fromMoney(account.opening_balance),
    balance: fromMoney(balance),
    isActive: account.is_active,
    createdAt: account.created_at.toISOString(),
  };
}

export function toAccountOption(account: Pick<Account, 'id' | 'name' | 'type'>): AccountOption {
  return { id: account.id, name: account.name, type: account.type };
}
