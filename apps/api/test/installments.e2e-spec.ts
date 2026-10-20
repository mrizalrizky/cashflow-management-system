import { randomUUID } from 'node:crypto';
import { setupE2e } from './e2e-context.js';
import {
  asOwner,
  call,
  createInstallment,
  createTransaction,
  errorFields,
  monthFromNow,
} from './fixtures.js';
import { INSTALLMENTS } from './routes.js';
import { setupWorld, World } from './transaction-fixtures.js';

describe('installments', () => {
  const ctx = setupE2e();

  /** Pembayaran yang ditulis langsung ke database. */
  function pay(
    world: World,
    installmentId: string,
    status: 'APPROVED' | 'VOID' = 'APPROVED',
    amount = 1_500_000n,
  ) {
    return createTransaction(ctx.prisma, {
      accountId: world.account.id,
      categoryId: world.expense.id,
      createdById: world.owner.user.id,
      type: 'OUT',
      amount,
      status,
      installmentId,
    });
  }

  describe('POST /installments', () => {
    it('creates an installment, computes its end month, and audits it', async () => {
      const owner = await asOwner(ctx);
      const res = await call(ctx, owner, 'post', INSTALLMENTS)
        .send({ name: '  Motor  ', monthlyAmount: '1500000', startMonth: '2026-11', months: 3, notes: 'BCA' })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        name: 'Motor',
        monthlyAmount: '1500000',
        startMonth: '2026-11',
        endMonth: '2027-01',
        months: 3,
        paid: 0,
        due: expect.any(Number),
        behindMonths: expect.any(Number),
        status: expect.any(String),
        totalAmount: '4500000',
        paidAmount: '0',
        remainingAmount: '4500000',
        notes: 'BCA',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity_type: 'installment' } });
      expect(log).toMatchObject({ action: 'CREATE', entity_id: res.body.id });
    });

    it.each([
      [{ monthlyAmount: '0' }, 'monthlyAmount'],
      [{ monthlyAmount: 1500000 }, 'monthlyAmount'],
      [{ monthlyAmount: '12345678901234' }, 'monthlyAmount'],
      [{ startMonth: '2026-13' }, 'startMonth'],
      [{ startMonth: '2026-11-01' }, 'startMonth'],
      [{ months: 0 }, 'months'],
      [{ months: 121 }, 'months'],
      [{ months: 2.5 }, 'months'],
      [{ name: '   ' }, 'name'],
    ])('refuses %j', async (override, field) => {
      const owner = await asOwner(ctx);
      const res = await call(ctx, owner, 'post', INSTALLMENTS)
        .send({ name: 'Motor', monthlyAmount: '1500000', startMonth: '2026-11', months: 3, ...override })
        .expect(400);
      expect(errorFields(res.body)).toContain(field);
    });
  });

  describe('GET /installments', () => {
    it('shows progress from non-void linked transactions, and the figures at the top', async () => {
      const world = await setupWorld(ctx);
      // Mulai dua bulan lalu, 3 bulan: seharusnya 3, terbayar 1 (yang VOID tidak dihitung): tertinggal 2.
      const behind = await createInstallment(ctx.prisma, {
        name: 'Motor',
        startMonth: monthFromNow(-2),
        months: 3,
        monthlyAmount: 1_500_000n,
      });
      await pay(world, behind.id);
      await pay(world, behind.id, 'VOID');
      // Berjalan dan mencakup bulan ini.
      const onTrack = await createInstallment(ctx.prisma, {
        name: 'Laptop',
        startMonth: monthFromNow(0),
        months: 12,
        monthlyAmount: 800_000n,
      });
      await pay(world, onTrack.id, 'APPROVED', 750_000n);
      // Belum mulai: tidak dihitung di total bulan ini.
      await createInstallment(ctx.prisma, { name: 'Kulkas', startMonth: monthFromNow(1), months: 6, monthlyAmount: 400_000n });
      // Lunas, dan periodenya sudah lewat.
      const done = await createInstallment(ctx.prisma, {
        name: 'HP',
        startMonth: monthFromNow(-3),
        months: 1,
        monthlyAmount: 300_000n,
      });
      await pay(world, done.id);

      const res = await call(ctx, world.owner, 'get', INSTALLMENTS).expect(200);

      const byName = Object.fromEntries(res.body.items.map((i: { name: string }) => [i.name, i]));
      expect(byName.Motor).toMatchObject({
        paid: 1,
        due: 3,
        behindMonths: 2,
        status: 'BEHIND',
        endMonth: monthFromNow(0),
        totalAmount: '4500000',
        paidAmount: '1500000',
        remainingAmount: '3000000',
      });
      // Dibayar 750.000 sekali (boleh berbeda dari nominal per bulan); sisa dihitung dari bulan yang tersisa.
      expect(byName.Laptop).toMatchObject({
        paid: 1,
        due: 1,
        status: 'ON_TRACK',
        totalAmount: '9600000',
        paidAmount: '750000',
        remainingAmount: '8800000',
      });
      expect(byName.Kulkas).toMatchObject({ paid: 0, due: 0, status: 'NOT_STARTED' });
      expect(byName.HP).toMatchObject({ paid: 1, status: 'PAID_OFF', remainingAmount: '0' });
      expect(res.body.summary).toEqual({
        month: monthFromNow(0),
        activeMonthlyTotal: '2300000',
        unpaid: [{ id: behind.id, name: 'Motor', months: 2, amount: '3000000' }],
        unpaidTotal: '3000000',
        // 3.000.000 (Motor) + 8.800.000 (Laptop) + 2.400.000 (Kulkas); HP sudah lunas.
        remainingTotal: '14200000',
      });
    });

    it('filters active or paid off, keeping the summary over everything', async () => {
      const world = await setupWorld(ctx);
      await createInstallment(ctx.prisma, { name: 'Motor', months: 3 });
      const done = await createInstallment(ctx.prisma, { name: 'HP', months: 1 });
      await pay(world, done.id);

      const active = await call(ctx, world.owner, 'get', `${INSTALLMENTS}?status=ACTIVE`).expect(200);
      expect(active.body.items.map((i: { name: string }) => i.name)).toEqual(['Motor']);
      const paidOff = await call(ctx, world.owner, 'get', `${INSTALLMENTS}?status=PAID_OFF`).expect(200);
      expect(paidOff.body.items.map((i: { name: string }) => i.name)).toEqual(['HP']);
      expect(paidOff.body.summary.activeMonthlyTotal).toBe(active.body.summary.activeMonthlyTotal);
    });
  });

  describe('GET /installments/:id', () => {
    it('lists its linked transactions, voided ones included', async () => {
      const world = await setupWorld(ctx);
      const motor = await createInstallment(ctx.prisma, { name: 'Motor' });
      await pay(world, motor.id);
      await pay(world, motor.id, 'VOID');

      const res = await call(ctx, world.owner, 'get', `${INSTALLMENTS}/${motor.id}`).expect(200);
      expect(res.body.paid).toBe(1);
      expect(res.body.transactions).toHaveLength(2);
      expect(res.body.transactions.map((t: { status: string }) => t.status).sort()).toEqual(['APPROVED', 'VOID']);
    });

    it('answers 404 for an unknown installment', async () => {
      const owner = await asOwner(ctx);
      await call(ctx, owner, 'get', `${INSTALLMENTS}/${randomUUID()}`).expect(404);
    });
  });

  describe('PATCH /installments/:id', () => {
    it('changes name, amount, start month and notes freely, and audits before and after', async () => {
      const owner = await asOwner(ctx);
      const motor = await createInstallment(ctx.prisma, { name: 'Motor', notes: 'lama' });

      const res = await call(ctx, owner, 'patch', `${INSTALLMENTS}/${motor.id}`)
        .send({ name: 'Motor Vario', monthlyAmount: '1600000', startMonth: '2026-01', notes: null })
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Motor Vario', monthlyAmount: '1600000', startMonth: '2026-01', notes: null });
      const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity_type: 'installment', action: 'UPDATE' } });
      expect(log.before).toMatchObject({ name: 'Motor', notes: 'lama' });
      expect(log.after).toMatchObject({ name: 'Motor Vario', notes: null });
    });

    it('lets months go down to what is already paid, which pays it off, but not below', async () => {
      const world = await setupWorld(ctx);
      const motor = await createInstallment(ctx.prisma, { months: 6 });
      await pay(world, motor.id);
      await pay(world, motor.id);
      await pay(world, motor.id, 'VOID');

      const below = await call(ctx, world.owner, 'patch', `${INSTALLMENTS}/${motor.id}`).send({ months: 1 }).expect(400);
      expect(below.body.errors).toEqual([
        { field: 'months', messages: ['Jumlah bulan tidak boleh kurang dari 2 pembayaran yang sudah tercatat'] },
      ]);
      const exact = await call(ctx, world.owner, 'patch', `${INSTALLMENTS}/${motor.id}`).send({ months: 2 }).expect(200);
      expect(exact.body.status).toBe('PAID_OFF');
    });
  });

  describe('DELETE /installments/:id', () => {
    it('deletes an installment with no linked transaction, and audits it', async () => {
      const owner = await asOwner(ctx);
      const motor = await createInstallment(ctx.prisma, { name: 'Motor' });

      await call(ctx, owner, 'delete', `${INSTALLMENTS}/${motor.id}`).expect(204);

      expect(await ctx.prisma.installment.count()).toBe(0);
      const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity_type: 'installment', action: 'DELETE' } });
      expect(log.before).toMatchObject({ name: 'Motor' });
    });

    it('refuses while any transaction is linked, even a voided one', async () => {
      const world = await setupWorld(ctx);
      const motor = await createInstallment(ctx.prisma);
      await pay(world, motor.id, 'VOID');

      const res = await call(ctx, world.owner, 'delete', `${INSTALLMENTS}/${motor.id}`).expect(409);
      expect(res.body.message).toBe('Cicilan sudah punya pembayaran tercatat, jadi tidak bisa dihapus');
      expect(await ctx.prisma.installment.count()).toBe(1);
    });
  });
});
