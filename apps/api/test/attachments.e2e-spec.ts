import { randomUUID } from 'node:crypto';
import { SAMPLE_FILES } from '../src/attachments/testing/sample-files.js';
import { AttachmentsService } from '../src/attachments/attachments.service.js';
import { toAuthUser } from '../src/auth/auth.types.js';
import { AuditService } from '../src/audit/audit.service.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { Readable } from 'node:stream';
import { StorageService } from '../src/storage/storage.service.js';
import { TransactionAccessService } from '../src/transactions/transaction-access.service.js';
import { api, E2eContext, setupE2e } from './e2e-context.js';
import { assign, call, loginAs, TestSession } from './fixtures.js';
import { ATTACHMENTS } from './routes.js';
import { expenseBody, record, setupWorld, transactionUrl, World } from './transaction-fixtures.js';

interface UploadFile {
  content: Buffer;
  filename: string;
  contentType: string;
}

const PDF: UploadFile = { content: SAMPLE_FILES.pdf, filename: 'nota toko.pdf', contentType: 'application/pdf' };

function upload(ctx: E2eContext, session: TestSession, transactionId: string, file: UploadFile = PDF) {
  return call(ctx, session, 'post', transactionUrl(transactionId, 'attachments')).attach('file', file.content, {
    filename: file.filename,
    contentType: file.contentType,
  });
}

function downloadUrl(attachmentId: string): string {
  return `${ATTACHMENTS}/${attachmentId}/download`;
}

async function setStatus(ctx: E2eContext, id: string, status: 'APPROVED' | 'VOID' | 'REJECTED') {
  await ctx.prisma.transaction.update({ where: { id }, data: { status } });
}

/** Transaksi staf di proyek A dengan satu bukti. */
async function withProof(ctx: E2eContext, world: World) {
  const tx = await record(ctx, world.staff, expenseBody(world, { projectId: world.projectA.id }));
  const res = await upload(ctx, world.staff, tx.id).expect(201);
  return { tx, attachment: res.body as { id: string; fileName: string } };
}

describe('POST /transactions/:id/attachments', () => {
  const ctx = setupE2e();

  it('stores a proof file under a generated key and lists it on the transaction', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));

    const res = await upload(ctx, world.staff, tx.id).expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      fileName: 'nota toko.pdf',
      mimeType: 'application/pdf',
      sizeBytes: SAMPLE_FILES.pdf.length,
      createdAt: expect.any(String),
    });
    const row = await ctx.prisma.attachment.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.storage_key).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(row.uploaded_by_id).toBe(world.staff.user.id);

    const loaded = await call(ctx, world.staff, 'get', transactionUrl(tx.id)).expect(200);
    expect(loaded.body.attachments).toEqual([res.body]);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'ATTACH' } });
    expect(audit).toMatchObject({ entity_type: 'transaction', entity_id: tx.id, user_id: world.staff.user.id });
  });

  it('judges the file by its content, not its name or declared type', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));

    const disguised = await upload(ctx, world.staff, tx.id, {
      content: SAMPLE_FILES.exe,
      filename: 'nota.pdf',
      contentType: 'application/pdf',
    }).expect(400);
    expect(disguised.body).toEqual({ statusCode: 400, message: 'Jenis berkas tidak didukung' });

    const mislabelled = await upload(ctx, world.staff, tx.id, {
      content: SAMPLE_FILES.png,
      filename: 'x.bin',
      contentType: 'application/octet-stream',
    }).expect(201);
    expect(mislabelled.body).toMatchObject({ fileName: 'x.png', mimeType: 'image/png' });

    for (const sample of ['jpeg', 'webp'] as const) {
      await upload(ctx, world.staff, tx.id, {
        content: SAMPLE_FILES[sample],
        filename: `foto.${sample}`,
        contentType: `image/${sample}`,
      }).expect(201);
    }
    expect(await ctx.prisma.attachment.count()).toBe(3);
  });

  it('refuses an empty file, a missing file and a file over 10 MB', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));

    await upload(ctx, world.staff, tx.id, { ...PDF, content: Buffer.alloc(0) }).expect(400);
    const missing = await call(ctx, world.staff, 'post', transactionUrl(tx.id, 'attachments')).expect(400);
    expect(missing.body.message).toBe('Berkas wajib diunggah');

    const tooBig = Buffer.concat([SAMPLE_FILES.pdf, Buffer.alloc(10 * 1024 * 1024)]);
    const res = await upload(ctx, world.staff, tx.id, { ...PDF, content: tooBig }).expect(413);
    expect(res.body).toEqual({ statusCode: 413, message: 'Berkas terlalu besar (maksimal 10 MB)' });
    expect(await ctx.prisma.attachment.count()).toBe(0);
  });

  it('cleans up a hostile file name', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));

    const res = await upload(ctx, world.staff, tx.id, { ...PDF, filename: '../../etc/passwd' }).expect(201);

    expect(res.body.fileName).toBe('passwd.pdf');
  });

  it('allows at most ten proofs per transaction', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));
    for (let i = 0; i < 10; i += 1) await upload(ctx, world.staff, tx.id).expect(201);

    const res = await upload(ctx, world.staff, tx.id).expect(400);

    expect(res.body.message).toBe('Maksimal 10 bukti per transaksi');
  });

  it('is only for those who may edit the transaction, while it can still be edited', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world, { projectId: world.projectA.id }));

    await upload(ctx, world.manager, tx.id).expect(403);
    await upload(ctx, world.otherStaff, tx.id).expect(404);
    await api(ctx).post(transactionUrl(tx.id, 'attachments')).attach('file', PDF.content, PDF.filename).expect(401);
    await upload(ctx, world.admin, tx.id).expect(201);

    await setStatus(ctx, tx.id, 'REJECTED');
    await upload(ctx, world.staff, tx.id).expect(201);

    for (const status of ['APPROVED', 'VOID'] as const) {
      await setStatus(ctx, tx.id, status);
      const res = await upload(ctx, world.admin, tx.id).expect(409);
      expect(res.body.message).toBe('Transaksi tidak bisa diberi bukti pada status ini');
    }
    await upload(ctx, world.staff, randomUUID()).expect(404);
  });
});

describe('GET /attachments/:id/download', () => {
  const ctx = setupE2e();

  it('returns the exact bytes as a download, with headers that stop the browser guessing', async () => {
    const world = await setupWorld(ctx);
    const { attachment } = await withProof(ctx, world);

    const res = await call(ctx, world.staff, 'get', downloadUrl(attachment.id))
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.body).toEqual(SAMPLE_FILES.pdf);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="nota toko.pdf"');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('is available to everyone who may see the transaction, and to nobody else', async () => {
    const world = await setupWorld(ctx);
    const { attachment } = await withProof(ctx, world);
    const outsider = await loginAs(ctx, { role: 'PROJECT_MANAGER' });
    await assign(ctx.prisma, world.projectB.id, outsider.user.id);

    for (const session of [world.staff, world.manager, world.admin]) {
      await call(ctx, session, 'get', downloadUrl(attachment.id)).expect(200);
    }
    for (const session of [world.otherStaff, outsider]) {
      const res = await call(ctx, session, 'get', downloadUrl(attachment.id)).expect(404);
      expect(res.body).toEqual({ statusCode: 404, message: 'Bukti tidak ditemukan' });
    }
    await api(ctx).get(downloadUrl(attachment.id)).expect(401);
    await call(ctx, world.admin, 'get', downloadUrl(randomUUID())).expect(404);
    await call(ctx, world.admin, 'get', downloadUrl('bukan-uuid')).expect(400);
  });
});

describe('DELETE /attachments/:id', () => {
  const ctx = setupE2e();

  it('removes the row and the file while the transaction can still be edited', async () => {
    const world = await setupWorld(ctx);
    const { tx, attachment } = await withProof(ctx, world);
    const { storage_key } = await ctx.prisma.attachment.findUniqueOrThrow({ where: { id: attachment.id } });

    await call(ctx, world.staff, 'delete', `${ATTACHMENTS}/${attachment.id}`).expect(204);

    expect(await ctx.prisma.attachment.count()).toBe(0);
    await expect(ctx.app.get(StorageService).open(storage_key)).rejects.toThrow();
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'DETACH' } });
    expect(audit).toMatchObject({ entity_id: tx.id, user_id: world.staff.user.id });
    await call(ctx, world.staff, 'delete', `${ATTACHMENTS}/${attachment.id}`).expect(404);
  });

  it('is for the uploader or an admin only', async () => {
    const world = await setupWorld(ctx);
    const first = await withProof(ctx, world);
    const second = await withProof(ctx, world);

    await call(ctx, world.manager, 'delete', `${ATTACHMENTS}/${first.attachment.id}`).expect(403);
    await call(ctx, world.otherStaff, 'delete', `${ATTACHMENTS}/${first.attachment.id}`).expect(404);
    await call(ctx, world.admin, 'delete', `${ATTACHMENTS}/${first.attachment.id}`).expect(204);
    await call(ctx, world.staff, 'delete', `${ATTACHMENTS}/${second.attachment.id}`).expect(204);
  });

  it('keeps the proof of a transaction that has been approved', async () => {
    const world = await setupWorld(ctx);
    const { tx, attachment } = await withProof(ctx, world);
    await setStatus(ctx, tx.id, 'APPROVED');

    for (const session of [world.staff, world.admin]) {
      await call(ctx, session, 'delete', `${ATTACHMENTS}/${attachment.id}`).expect(409);
    }
    await call(ctx, world.staff, 'get', downloadUrl(attachment.id)).expect(200);
  });
});

describe('AttachmentsService when something fails midway', () => {
  const ctx = setupE2e();

  /** Penyimpanan tiruan yang mencatat apa yang disimpan dan dihapus. */
  class RecordingStorage extends StorageService {
    saved: string[] = [];
    deleted: string[] = [];
    failOnSave = false;

    async save(key: string): Promise<void> {
      if (this.failOnSave) throw new Error('disk penuh');
      this.saved.push(key);
    }
    async open(): Promise<Readable> {
      throw new Error('tidak dipakai');
    }
    async delete(key: string): Promise<void> {
      this.deleted.push(key);
    }
  }

  function serviceWith(storage: StorageService, audit: AuditService = ctx.app.get(AuditService)) {
    return new AttachmentsService(
      ctx.app.get(PrismaService),
      ctx.app.get(TransactionAccessService),
      storage,
      audit,
    );
  }

  const file = { buffer: SAMPLE_FILES.pdf, originalname: 'nota.pdf' };

  it('leaves no attachment row when the file cannot be stored', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));
    const storage = new RecordingStorage();
    storage.failOnSave = true;

    await expect(
      serviceWith(storage).upload(toAuthUser(world.staff.user), tx.id, file, null),
    ).rejects.toThrow('disk penuh');

    expect(await ctx.prisma.attachment.count()).toBe(0);
  });

  it('removes the stored file again when the database write fails', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world));
    const storage = new RecordingStorage();
    const failingAudit = { log: () => Promise.reject(new Error('audit gagal')) } as unknown as AuditService;

    await expect(
      serviceWith(storage, failingAudit).upload(toAuthUser(world.staff.user), tx.id, file, null),
    ).rejects.toThrow('audit gagal');

    expect(storage.saved).toHaveLength(1);
    expect(storage.deleted).toEqual(storage.saved);
    expect(await ctx.prisma.attachment.count()).toBe(0);
  });
});
