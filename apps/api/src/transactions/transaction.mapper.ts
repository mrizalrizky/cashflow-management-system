import { formatCalendarDate } from '../common/calendar-date.js';
import { fromMoney } from '../common/money.js';
import type { Attachment, Prisma, TxStatus, TxType } from '../generated/prisma/client.js';
import {
  permissionsFor,
  PolicyActor,
  PolicySubject,
  TransactionPermissions,
} from './transaction-policy.js';

const PERSON = { select: { id: true, name: true } } as const;

/** Transaksi selalu dimuat bersama relasi yang ditampilkan; hanya kolom yang perlu. */
export const TRANSACTION_INCLUDE = {
  account: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  project: { select: { id: true, code: true, name: true } },
  // Peran pembuat dibutuhkan aturan peninjauan.
  created_by: { select: { id: true, name: true, role: true } },
  reviewed_by: PERSON,
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
  project: (Named & { code: string }) | null;
  isTransfer: boolean;
  transferGroupId: string | null;
  createdBy: Named;
  reviewedBy: Named | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  voidedBy: Named | null;
  voidedAt: string | null;
  voidReason: string | null;
  attachments: AttachmentResponse[];
  /** Yang boleh dilakukan pemanggil pada transaksi ini. */
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
    project_id: tx.project_id,
    transfer_group_id: tx.transfer_group_id,
    reviewed_by_id: tx.reviewed_by_id,
    reject_reason: tx.reject_reason,
    voided_by_id: tx.voided_by_id,
    void_reason: tx.void_reason,
    attachment_ids: tx.attachments.map((attachment) => attachment.id),
  };
}

/** Bentuk transaksi yang dinilai oleh policy. */
export function toPolicySubject(tx: TransactionWithRelations): PolicySubject {
  return {
    status: tx.status,
    projectId: tx.project_id,
    createdById: tx.created_by_id,
    creatorRole: tx.created_by.role,
    isTransfer: tx.transfer_group_id !== null,
  };
}

export function toTransactionResponse(
  tx: TransactionWithRelations,
  actor: PolicyActor,
): TransactionResponse {
  return {
    id: tx.id,
    type: tx.type,
    amount: fromMoney(tx.amount),
    transactionDate: formatCalendarDate(tx.transaction_date),
    description: tx.description,
    status: tx.status,
    account: tx.account,
    category: tx.category,
    project: tx.project,
    isTransfer: tx.transfer_group_id !== null,
    transferGroupId: tx.transfer_group_id,
    createdBy: { id: tx.created_by.id, name: tx.created_by.name },
    reviewedBy: tx.reviewed_by,
    reviewedAt: tx.reviewed_at?.toISOString() ?? null,
    rejectReason: tx.reject_reason,
    voidedBy: tx.voided_by,
    voidedAt: tx.voided_at?.toISOString() ?? null,
    voidReason: tx.void_reason,
    attachments: tx.attachments.map(toAttachmentResponse),
    permissions: permissionsFor(actor, toPolicySubject(tx)),
    createdAt: tx.created_at.toISOString(),
    updatedAt: tx.updated_at.toISOString(),
  };
}
