import { formatCalendarDate } from '../common/calendar-date.js';
import { fromMoney } from '../common/money.js';
import type { Attachment, Prisma, TxStatus, TxType } from '../generated/prisma/client.js';
import { permissionsFor, PolicySubject, TransactionPermissions } from './transaction-policy.js';

const PERSON = { select: { id: true, name: true } } as const;

/** Transaksi selalu dimuat bersama relasi yang ditampilkan; hanya kolom yang perlu. */
export const TRANSACTION_INCLUDE = {
  account: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  installment: { select: { id: true, name: true } },
  created_by: PERSON,
  voided_by: PERSON,
  attachments: { orderBy: { created_at: 'asc' } },
} satisfies Prisma.TransactionInclude;

export type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: typeof TRANSACTION_INCLUDE;
}>;

interface Named {
  id: string;
  name: string;
}

export interface AttachmentResponse {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TransactionResponse {
  id: string;
  type: TxType;
  amount: string;
  transactionDate: string;
  description: string;
  status: TxStatus;
  account: Named;
  category: Named;
  /** Cicilan yang dibayar transaksi ini. */
  installment: Named | null;
  isTransfer: boolean;
  transferGroupId: string | null;
  createdBy: Named;
  voidedBy: Named | null;
  voidedAt: string | null;
  voidReason: string | null;
  attachments: AttachmentResponse[];
  /** Yang boleh dilakukan pada transaksi ini. */
  permissions: TransactionPermissions;
  createdAt: string;
  updatedAt: string;
}

export function toAttachmentResponse(attachment: Attachment): AttachmentResponse {
  return {
    id: attachment.id,
    fileName: attachment.file_name,
    mimeType: attachment.mime_type,
    sizeBytes: attachment.size_bytes,
    createdAt: attachment.created_at.toISOString(),
  };
}

/** Isi transaksi untuk catatan audit: kolomnya sendiri, tanpa relasi. */
export function toAuditSnapshot(tx: TransactionWithRelations): Record<string, unknown> {
  return {
    type: tx.type,
    amount: tx.amount,
    transaction_date: formatCalendarDate(tx.transaction_date),
    description: tx.description,
    status: tx.status,
    account_id: tx.account_id,
    category_id: tx.category_id,
    installment_id: tx.installment_id,
    transfer_group_id: tx.transfer_group_id,
    voided_by_id: tx.voided_by_id,
    void_reason: tx.void_reason,
    attachment_ids: tx.attachments.map((attachment) => attachment.id),
  };
}

/** Bentuk transaksi yang dinilai oleh policy. */
export function toPolicySubject(tx: TransactionWithRelations): PolicySubject {
  return {
    status: tx.status,
    createdById: tx.created_by_id,
    isTransfer: tx.transfer_group_id !== null,
  };
}

export function toTransactionResponse(tx: TransactionWithRelations): TransactionResponse {
  return {
    id: tx.id,
    type: tx.type,
    amount: fromMoney(tx.amount),
    transactionDate: formatCalendarDate(tx.transaction_date),
    description: tx.description,
    status: tx.status,
    account: tx.account,
    category: tx.category,
    installment: tx.installment,
    isTransfer: tx.transfer_group_id !== null,
    transferGroupId: tx.transfer_group_id,
    createdBy: tx.created_by,
    voidedBy: tx.voided_by,
    voidedAt: tx.voided_at?.toISOString() ?? null,
    voidReason: tx.void_reason,
    attachments: tx.attachments.map(toAttachmentResponse),
    permissions: permissionsFor(toPolicySubject(tx)),
    createdAt: tx.created_at.toISOString(),
    updatedAt: tx.updated_at.toISOString(),
  };
}
