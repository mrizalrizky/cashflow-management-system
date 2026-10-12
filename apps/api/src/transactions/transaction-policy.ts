import type { Role, TxStatus } from '../generated/prisma/client.js';

/**
 * Aturan "siapa boleh melakukan apa pada sebuah transaksi", di satu tempat dan tanpa I/O.
 * Service bertanya ke sini dan tidak mengulang aturannya. Aturan "transaksi mana yang
 * boleh dilihat" ada di TransactionAccessService.scope.
 */

export interface PolicyActor {
  id: string;
  role: Role;
}

export interface PolicySubject {
  status: TxStatus;
  createdById: string;
  /** Peran pembuatnya saat ini. */
  creatorRole: Role;
  isTransfer: boolean;
}

export interface TransactionPermissions {
  /** Mengubah isi; untuk transaksi REJECTED berarti mengajukannya ulang. */
  canEdit: boolean;
  /** Membatalkan transaksi yang belum diproses. */
  canCancel: boolean;
  /** Menyetujui atau menolak. */
  canReview: boolean;
  /** Membatalkan transaksi yang sudah disetujui. */
  canVoid: boolean;
  /** Menambah atau menghapus bukti. */
  canAttach: boolean;
}

const NOTHING: TransactionPermissions = {
  canEdit: false,
  canCancel: false,
  canReview: false,
  canVoid: false,
  canAttach: false,
};

/** Status tempat isi dan bukti transaksi masih boleh diubah. */
export const EDITABLE_STATUSES: readonly TxStatus[] = ['PENDING', 'REJECTED'];

function isEditable(status: TxStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/** Yang boleh dilakukan pembuat pada transaksinya sendiri (tanpa hak meninjau). */
function ownerPermissions(tx: PolicySubject): TransactionPermissions {
  return {
    ...NOTHING,
    canEdit: isEditable(tx.status),
    canAttach: isEditable(tx.status),
    canCancel: tx.status === 'PENDING',
  };
}

export function permissionsFor(actor: PolicyActor, tx: PolicySubject): TransactionPermissions {
  const isAdmin = actor.role === 'SUPER_ADMIN';

  // Sisi transfer tidak bisa diubah atau diproses sendiri; hanya dibatalkan bersama pasangannya.
  if (tx.isTransfer) {
    return { ...NOTHING, canVoid: isAdmin && tx.status === 'APPROVED' };
  }

  const isOwner = tx.createdById === actor.id;
  switch (actor.role) {
    case 'SUPER_ADMIN':
      return {
        ...ownerPermissions(tx),
        canReview: tx.status === 'PENDING',
        canVoid: tx.status === 'APPROVED',
      };
    case 'PROJECT_MANAGER':
      return isOwner ? ownerPermissions(tx) : NOTHING;
    case 'STAFF':
      return isOwner ? ownerPermissions(tx) : NOTHING;
    default:
      return NOTHING;
  }
}

