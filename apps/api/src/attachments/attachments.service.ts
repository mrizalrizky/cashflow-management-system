import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Attachment, Prisma } from '../generated/prisma/client.js';
import { StorageService } from '../storage/storage.service.js';
import { TransactionAccessService } from '../transactions/transaction-access.service.js';
import { assertPermitted, TRANSACTION_ENTITY } from '../transactions/transaction-guards.js';
import type { TransactionWithRelations } from '../transactions/transaction.mapper.js';
import { EDITABLE_STATUSES } from '../transactions/transaction-policy.js';
import { sanitizeFileName } from './file-name.js';
import { sniffFileType } from './file-sniffer.js';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

/** Bagian dari berkas unggahan yang dipakai; nama dan tipe dari klien tidak dipercaya. */
export interface ProofFile {
  buffer: Buffer;
  originalname: string;
}

function attachmentNotFound(): NotFoundException {
  return new NotFoundException('Bukti tidak ditemukan');
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TransactionAccessService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async upload(
    user: AuthUser,
    transactionId: string,
    file: ProofFile,
    ip: string | null,
  ): Promise<Attachment> {
    // Dicek dulu sebelum menyimpan apa pun, supaya yang tidak berhak tidak bisa mengisi disk.
    this.assertCanChangeProof(await this.access.load(this.prisma, transactionId));

    const type = sniffFileType(file.buffer);
    if (!type) throw new BadRequestException('Jenis berkas tidak didukung');

    const storageKey = `${randomUUID()}.${type.extension}`;
    await this.storage.save(storageKey, file.buffer);
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Dicek lagi di bawah kunci baris: status bisa berubah (mis. dibatalkan) selagi berkas diunggah.
        const transaction = await this.access.loadForUpdate(tx, transactionId);
        this.assertCanChangeProof(transaction);
        if (transaction.attachments.length >= MAX_ATTACHMENTS) {
          throw new BadRequestException(`Maksimal ${MAX_ATTACHMENTS} bukti per transaksi`);
        }

        const attachment = await tx.attachment.create({
          data: {
            transaction_id: transactionId,
            storage_key: storageKey,
            file_name: sanitizeFileName(file.originalname, type.extension),
            mime_type: type.mimeType,
            size_bytes: file.buffer.length,
            uploaded_by_id: user.id,
          },
        });
        await this.recordChange(tx, 'ATTACH', user, attachment, ip);
        return attachment;
      });
    } catch (error) {
      // Baris gagal ditulis: berkas yang telanjur disimpan tidak boleh tertinggal.
      await this.removeFile(storageKey);
      throw error;
    }
  }

  async open(
    user: AuthUser,
    attachmentId: string,
  ): Promise<{ attachment: Attachment; stream: Readable }> {
    const attachment = await this.find(attachmentId);
    return { attachment, stream: await this.storage.open(attachment.storage_key) };
  }

  async remove(user: AuthUser, attachmentId: string, ip: string | null): Promise<void> {
    const attachment = await this.find(attachmentId);

    await this.prisma.$transaction(async (tx) => {
      const transaction = await this.access.loadForUpdate(tx, attachment.transaction_id);
      this.assertCanChangeProof(transaction);
      await tx.attachment.delete({ where: { id: attachment.id } });
      await this.recordChange(tx, 'DETACH', user, attachment, ip);
    });
    await this.removeFile(attachment.storage_key);
  }

  private assertCanChangeProof(transaction: TransactionWithRelations): void {
    assertPermitted(transaction, {
      permission: 'canAttach',
      statuses: EDITABLE_STATUSES,
      verb: 'diberi bukti',
      activeVerb: 'mengubah bukti',
    });
  }

  private async find(attachmentId: string): Promise<Attachment> {
    const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!attachment) throw attachmentNotFound();
    return attachment;
  }

  /** Mencatat perubahan bukti dan menandai transaksinya berubah. */
  private async recordChange(
    tx: Prisma.TransactionClient,
    action: 'ATTACH' | 'DETACH',
    user: AuthUser,
    attachment: Attachment,
    ip: string | null,
  ): Promise<void> {
    const details = {
      attachment_id: attachment.id,
      file_name: attachment.file_name,
      mime_type: attachment.mime_type,
      size_bytes: attachment.size_bytes,
    };
    await tx.transaction.update({
      where: { id: attachment.transaction_id },
      data: { updated_at: new Date() },
    });
    await this.audit.log(tx, {
      userId: user.id,
      action,
      entityType: TRANSACTION_ENTITY,
      entityId: attachment.transaction_id,
      before: action === 'DETACH' ? details : undefined,
      after: action === 'ATTACH' ? details : undefined,
      ip,
    });
  }

  /** Berkas yatim tidak membahayakan data, jadi kegagalan menghapusnya hanya dicatat. */
  private async removeFile(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch (error) {
      this.logger.error(`Gagal menghapus berkas ${storageKey}`, error instanceof Error ? error.stack : error);
    }
  }
}
