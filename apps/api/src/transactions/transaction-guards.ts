import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { TxStatus } from '../generated/prisma/client.js';
import { toPolicySubject, TransactionWithRelations } from './transaction.mapper.js';
import { permissionsFor, TransactionPermissions } from './transaction-policy.js';

/** Nama entitas transaksi di log audit. */
export const TRANSACTION_ENTITY = 'transaction';

export function alreadyProcessed(): ConflictException {
  return new ConflictException('Transaksi sudah diproses pengguna lain');
}

export function wrongStatus(action: string): ConflictException {
  return new ConflictException(`Transaksi tidak bisa ${action} pada status ini`);
}

export function notAllowed(action: string): ForbiddenException {
  return new ForbiddenException(`Anda tidak boleh ${action} transaksi ini`);
}

/** Sebuah tindakan pada transaksi, dengan kata-kata untuk pesan penolakannya. */
export interface GuardedAction {
  permission: keyof TransactionPermissions;
  /** Status tempat tindakan ini mungkin dilakukan. */
  statuses: readonly TxStatus[];
  /** Untuk pesan status yang salah, mis. "dibatalkan". */
  verb: string;
  /** Untuk pesan larangan, mis. "membatalkan". */
  activeVerb: string;
}

/**
 * Satu-satunya tempat keputusan policy diubah menjadi penolakan: status yang salah adalah
 * soal keadaan transaksi (409), selebihnya soal hak pelaku (403).
 */
export function assertPermitted(
  transaction: TransactionWithRelations,
  action: GuardedAction,
): void {
  if (permissionsFor(toPolicySubject(transaction))[action.permission]) return;
  throw action.statuses.includes(transaction.status)
    ? notAllowed(action.activeVerb)
    : wrongStatus(action.verb);
}

