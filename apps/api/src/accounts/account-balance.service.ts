import { Injectable } from '@nestjs/common';
import type { Db } from '../database/db.js';
import type { Account } from '../generated/prisma/client.js';

/**
 * Saldo akun selalu dihitung, tidak disimpan:
 * saldo awal + semua transaksi masuk APPROVED - semua transaksi keluar APPROVED.
 * Transfer antar akun adalah sepasang transaksi biasa, jadi ikut terhitung dengan sendirinya.
 */
@Injectable()
export class AccountBalanceService {
  /** Saldo untuk sekumpulan akun dengan satu query, berapa pun jumlah akunnya. */
  async balancesOf(db: Db, accounts: Account[]): Promise<Map<string, bigint>> {
    const balances = new Map(accounts.map((account) => [account.id, account.opening_balance]));
    if (accounts.length === 0) return balances;

    const totals = await db.transaction.groupBy({
      by: ['account_id', 'type'],
      where: { account_id: { in: [...balances.keys()] }, status: 'APPROVED' },
      _sum: { amount: true },
    });
    for (const total of totals) {
      const amount = total._sum.amount ?? 0n;
      const current = balances.get(total.account_id) ?? 0n;
      balances.set(total.account_id, total.type === 'IN' ? current + amount : current - amount);
    }
    return balances;
  }

  async balanceOf(db: Db, account: Account): Promise<bigint> {
    return (await this.balancesOf(db, [account])).get(account.id) ?? account.opening_balance;
  }
}
