import { SAMPLE_FILES } from '../src/attachments/testing/sample-files.js';
import type { TransactionResponse } from '../src/transactions/transaction.mapper.js';
import { E2eContext, setupE2e } from './e2e-context.js';
import { call, TestSession } from './fixtures.js';
import { ACCOUNTS, TRANSACTIONS } from './routes.js';
import { expenseBody, record, setupWorld, transactionUrl, World } from './transaction-fixtures.js';

/** Transaksi seperti yang dilihat seorang pelaku, termasuk apa yang boleh ia lakukan. */
async function seenBy(ctx: E2eContext, session: TestSession, id: string): Promise<TransactionResponse> {
  const res = await call(ctx, session, 'get', transactionUrl(id)).expect(200);
  return res.body as TransactionResponse;
}

async function listedFor(ctx: E2eContext, session: TestSession): Promise<string[]> {
  const res = await call(ctx, session, 'get', TRANSACTIONS).expect(200);
  return res.body.data.map((row: TransactionResponse) => row.id);
}

async function balance(ctx: E2eContext, world: World): Promise<string> {
  const res = await call(ctx, world.admin, 'get', ACCOUNTS).expect(200);
  const accounts = res.body.data as { id: string; balance: string }[];
  return accounts.find((account) => account.id === world.account.id)!.balance;
}

function attachProof(ctx: E2eContext, session: TestSession, id: string) {
  return call(ctx, session, 'post', transactionUrl(id, 'attachments')).attach('file', SAMPLE_FILES.jpeg, {
    filename: 'nota.jpg',
    contentType: 'image/jpeg',
  });
}

describe('transaction flow, from recording to approval', () => {
  const ctx = setupE2e();

  it('takes an expense through approval and void, and another through rejection and resubmission', async () => {
    const world = await setupWorld(ctx);
    const { staff, manager, admin } = world;
    const onProjectA = expenseBody(world, { projectId: world.projectA.id, amount: '150000' });

    // Staf mencatat pengeluaran proyek A beserta foto buktinya.
    const first = await record(ctx, staff, onProjectA);
    expect(first).toMatchObject({ status: 'PENDING', permissions: { canEdit: true, canAttach: true } });
    await attachProof(ctx, staff, first.id).expect(201);

    // Koordinator proyek A melihatnya, tetapi tidak melihat milik proyek B.
    const elsewhere = await record(ctx, world.otherStaff, expenseBody(world, { projectId: world.projectB.id }));
    expect(await listedFor(ctx, manager)).toEqual([first.id]);
    await call(ctx, manager, 'get', transactionUrl(elsewhere.id)).expect(404);
    expect(await seenBy(ctx, manager, first.id)).toMatchObject({
      status: 'PENDING',
      attachments: [{ fileName: 'nota.jpg' }],
      permissions: { canReview: true, canVoid: false },
    });

    // Koordinator menyetujui; staf tidak bisa lagi mengubahnya dan saldo akun berkurang.
    const approved = await call(ctx, manager, 'post', transactionUrl(first.id, 'approve')).expect(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', reviewedBy: { id: manager.user.id } });
    expect(approved.body).not.toHaveProperty('accountBalance');
    expect(await seenBy(ctx, staff, first.id)).toMatchObject({
      status: 'APPROVED',
      permissions: { canEdit: false, canCancel: false, canAttach: false },
    });
    await call(ctx, staff, 'patch', transactionUrl(first.id)).send({ amount: '1' }).expect(409);
    expect(await balance(ctx, world)).toBe('850000');

    // Admin membatalkannya dengan alasan; saldo kembali.
    expect(await seenBy(ctx, admin, first.id)).toMatchObject({ permissions: { canVoid: true } });
    const voided = await call(ctx, admin, 'post', transactionUrl(first.id, 'void'))
      .send({ reason: 'Nota ganda' })
      .expect(200);
    expect(voided.body).toMatchObject({
      status: 'VOID',
      voidReason: 'Nota ganda',
      permissions: { canEdit: false, canReview: false, canVoid: false },
    });
    expect(await balance(ctx, world)).toBe('1000000');

    // Pengeluaran kedua ditolak dengan alasan, diperbaiki staf, lalu disetujui.
    const second = await record(ctx, staff, { ...onProjectA, amount: '900000', description: 'Beli besi' });
    await attachProof(ctx, staff, second.id).expect(201);
    const rejected = await call(ctx, manager, 'post', transactionUrl(second.id, 'reject'))
      .send({ reason: 'Nominal tidak sesuai nota' })
      .expect(200);
    expect(rejected.body).toMatchObject({ status: 'REJECTED', rejectReason: 'Nominal tidak sesuai nota' });
    expect(await seenBy(ctx, staff, second.id)).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Nominal tidak sesuai nota',
      permissions: { canEdit: true, canAttach: true },
    });
    expect(await balance(ctx, world)).toBe('1000000');

    const resubmitted = await call(ctx, staff, 'patch', transactionUrl(second.id))
      .send({ amount: '90000' })
      .expect(200);
    expect(resubmitted.body).toMatchObject({ status: 'PENDING', amount: '90000', rejectReason: null });
    expect(await seenBy(ctx, manager, second.id)).toMatchObject({
      status: 'PENDING',
      permissions: { canReview: true },
    });

    await call(ctx, manager, 'post', transactionUrl(second.id, 'approve')).expect(200);
    expect(await seenBy(ctx, staff, second.id)).toMatchObject({
      status: 'APPROVED',
      permissions: { canEdit: false },
    });
    expect(await balance(ctx, world)).toBe('910000');

    // Tiap langkah tercatat di audit, berurutan.
    const audit = await ctx.prisma.auditLog.findMany({
      where: { entity_type: 'transaction', entity_id: { in: [first.id, second.id] } },
      orderBy: { created_at: 'asc' },
    });
    expect(audit.map((row) => row.action)).toEqual([
      'CREATE',
      'ATTACH',
      'APPROVE',
      'VOID',
      'CREATE',
      'ATTACH',
      'REJECT',
      'RESUBMIT',
      'APPROVE',
    ]);
  });
});
