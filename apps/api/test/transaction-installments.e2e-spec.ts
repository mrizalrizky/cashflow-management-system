import { setupE2e } from './e2e-context.js';
import { call, createCategory, createInstallment, createTransaction, errorFields } from './fixtures.js';
import { INSTALLMENTS, TRANSACTIONS } from './routes.js';
import { expenseBody, record, setupWorld, transactionUrl, World } from './transaction-fixtures.js';

describe('transactions paying installments', () => {
  const ctx = setupE2e();

  async function setup() {
    const world = await setupWorld(ctx);
    const kredit = await createCategory(ctx.prisma, { name: 'Kredit', type: 'OUT' });
    await ctx.prisma.category.update({ where: { id: kredit.id }, data: { is_installment: true } });
    const motor = await createInstallment(ctx.prisma, { name: 'Motor', months: 2 });
    return { world, kredit, motor };
  }

  function payment(world: World, categoryId: string, installmentId?: string | null) {
    return expenseBody(world, { categoryId, ...(installmentId === undefined ? {} : { installmentId }) });
  }

  async function progress(world: World, id: string): Promise<{ paid: number; status: string }> {
    return (await call(ctx, world.owner, 'get', `${INSTALLMENTS}/${id}`).expect(200)).body;
  }

  it('links a payment to the chosen installment, shows it, and audits the link', async () => {
    const { world, kredit, motor } = await setup();
    const tx = await record(ctx, world.owner, payment(world, kredit.id, motor.id));

    expect(tx.installment).toEqual({ id: motor.id, name: 'Motor' });
    expect((await progress(world, motor.id)).paid).toBe(1);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity_type: 'transaction', action: 'CREATE' } });
    expect(log.after).toMatchObject({ installment_id: motor.id });
  });

  it('requires an installment for an installment category', async () => {
    const { world, kredit } = await setup();
    for (const installmentId of [undefined, null]) {
      const res = await call(ctx, world.owner, 'post', TRANSACTIONS)
        .send(payment(world, kredit.id, installmentId))
        .expect(400);
      expect(res.body.errors).toEqual([{ field: 'installmentId', messages: ['Pilih cicilan yang dibayar'] }]);
    }
  });

  it('refuses an installment for any other category, and an unknown installment', async () => {
    const { world, kredit, motor } = await setup();
    const other = await call(ctx, world.owner, 'post', TRANSACTIONS)
      .send(payment(world, world.expense.id, motor.id))
      .expect(400);
    expect(other.body.errors).toEqual([
      { field: 'installmentId', messages: ['Hanya transaksi berkategori cicilan yang bisa ditautkan ke cicilan'] },
    ]);
    const unknown = await call(ctx, world.owner, 'post', TRANSACTIONS)
      .send(payment(world, kredit.id, '00000000-0000-4000-8000-000000000000'))
      .expect(400);
    expect(errorFields(unknown.body)).toEqual(['installmentId']);
  });

  it('accepts an amount different from the monthly amount: one transaction is one month', async () => {
    const { world, kredit, motor } = await setup();
    await record(ctx, world.owner, { ...payment(world, kredit.id, motor.id), amount: '1' });
    expect((await progress(world, motor.id)).paid).toBe(1);
  });

  it('refuses a payment once the installment is paid off', async () => {
    const { world, kredit, motor } = await setup();
    await record(ctx, world.owner, payment(world, kredit.id, motor.id));
    await record(ctx, world.owner, payment(world, kredit.id, motor.id));

    const res = await call(ctx, world.owner, 'post', TRANSACTIONS)
      .send(payment(world, kredit.id, motor.id))
      .expect(400);
    expect(res.body.errors).toEqual([{ field: 'installmentId', messages: ['Cicilan ini sudah lunas'] }]);
    expect((await progress(world, motor.id)).paid).toBe(2);
  });

  it('lets only one of two simultaneous payments for the last month through', async () => {
    const { world, kredit, motor } = await setup();
    await record(ctx, world.owner, payment(world, kredit.id, motor.id));

    const results = await Promise.all(
      [1, 2].map(() => call(ctx, world.owner, 'post', TRANSACTIONS).send(payment(world, kredit.id, motor.id))),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await progress(world, motor.id)).paid).toBe(2);
  });

  it('still lets a payment of a paid-off installment be edited, but not another be moved onto it', async () => {
    const { world, kredit, motor } = await setup();
    const first = await record(ctx, world.owner, payment(world, kredit.id, motor.id));
    await record(ctx, world.owner, payment(world, kredit.id, motor.id));
    const laptop = await createInstallment(ctx.prisma, { name: 'Laptop', months: 5 });
    const other = await record(ctx, world.owner, payment(world, kredit.id, laptop.id));

    const edited = await call(ctx, world.owner, 'patch', transactionUrl(first.id))
      .send({ amount: '1400000' })
      .expect(200);
    expect(edited.body.installment).toEqual({ id: motor.id, name: 'Motor' });

    const moved = await call(ctx, world.owner, 'patch', transactionUrl(other.id))
      .send({ installmentId: motor.id })
      .expect(400);
    expect(moved.body.errors).toEqual([{ field: 'installmentId', messages: ['Cicilan ini sudah lunas'] }]);
  });

  it('moves a payment between installments', async () => {
    const { world, kredit, motor } = await setup();
    const laptop = await createInstallment(ctx.prisma, { name: 'Laptop', months: 5 });
    const tx = await record(ctx, world.owner, payment(world, kredit.id, motor.id));

    await call(ctx, world.owner, 'patch', transactionUrl(tx.id)).send({ installmentId: laptop.id }).expect(200);
    expect((await progress(world, motor.id)).paid).toBe(0);
    expect((await progress(world, laptop.id)).paid).toBe(1);
  });

  it('drops the link when the category changes to one that is not an installment category', async () => {
    const { world, kredit, motor } = await setup();
    const tx = await record(ctx, world.owner, payment(world, kredit.id, motor.id));

    const res = await call(ctx, world.owner, 'patch', transactionUrl(tx.id))
      .send({ categoryId: world.expense.id })
      .expect(200);
    expect(res.body.installment).toBeNull();
    expect((await progress(world, motor.id)).paid).toBe(0);
  });

  it('reopens a paid-off installment when one of its payments is voided', async () => {
    const { world, kredit, motor } = await setup();
    const first = await record(ctx, world.owner, payment(world, kredit.id, motor.id));
    await record(ctx, world.owner, payment(world, kredit.id, motor.id));
    expect((await progress(world, motor.id)).status).toBe('PAID_OFF');

    await call(ctx, world.owner, 'post', transactionUrl(first.id, 'void')).send({ reason: 'Salah catat' }).expect(200);
    expect((await progress(world, motor.id)).status).not.toBe('PAID_OFF');
    await record(ctx, world.owner, payment(world, kredit.id, motor.id));
    expect((await progress(world, motor.id)).paid).toBe(2);
  });

  it('asks for an installment when an old transaction of a newly flagged category is edited', async () => {
    const world = await setupWorld(ctx);
    const old = await createTransaction(ctx.prisma, {
      accountId: world.account.id,
      categoryId: world.expense.id,
      createdById: world.owner.user.id,
      type: 'OUT',
      amount: 100_000n,
    });
    await ctx.prisma.category.update({ where: { id: world.expense.id }, data: { is_installment: true } });

    const res = await call(ctx, world.owner, 'patch', transactionUrl(old.id)).send({ description: 'Ubah' }).expect(400);
    expect(errorFields(res.body)).toEqual(['installmentId']);
  });
});
