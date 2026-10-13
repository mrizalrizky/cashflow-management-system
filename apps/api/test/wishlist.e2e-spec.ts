import { randomUUID } from 'node:crypto';
import { setupE2e } from './e2e-context.js';
import { asOwner, call, createWishlistItem, errorFields, REVIEWED } from './fixtures.js';
import { WISHLIST } from './routes.js';

const ITEM = {
  name: '  Laptop baru  ',
  price: '15000000',
  reason: ' Laptop lama sudah lambat ',
  similarOwned: 'Ya, laptop 2018',
  valueAdded: 'Kerja lebih cepat',
  usageDuration: '4 tahun, untuk kerja',
};

describe('wishlist', () => {
  const ctx = setupE2e();

  describe('POST /wishlist', () => {
    it('stores the six answers, waiting and not yet reviewed, and audits it', async () => {
      const owner = await asOwner(ctx);
      const res = await call(ctx, owner, 'post', WISHLIST).send(ITEM).expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        name: 'Laptop baru',
        price: '15000000',
        reason: 'Laptop lama sudah lambat',
        similarOwned: 'Ya, laptop 2018',
        valueAdded: 'Kerja lebih cepat',
        usageDuration: '4 tahun, untuk kerja',
        includeFinance: true,
        status: 'WAITING',
        review: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
      const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity_type: 'wishlist_item' } });
      expect(log).toMatchObject({ action: 'CREATE', entity_id: res.body.id });
    });

    it('can leave the finance summary out', async () => {
      const owner = await asOwner(ctx);
      const res = await call(ctx, owner, 'post', WISHLIST).send({ ...ITEM, includeFinance: false }).expect(201);
      expect(res.body.includeFinance).toBe(false);
    });

    it.each([
      [{ reason: '' }, 'reason'],
      [{ similarOwned: '   ' }, 'similarOwned'],
      [{ valueAdded: 'x'.repeat(1001) }, 'valueAdded'],
      [{ usageDuration: undefined }, 'usageDuration'],
      [{ name: 'x'.repeat(101) }, 'name'],
      [{ price: '0' }, 'price'],
      [{ price: 15000000 }, 'price'],
      [{ price: '12345678901234' }, 'price'],
      [{ status: 'BOUGHT' }, 'status'],
    ])('refuses %j', async (override, field) => {
      const owner = await asOwner(ctx);
      const res = await call(ctx, owner, 'post', WISHLIST).send({ ...ITEM, ...override }).expect(400);
      expect(errorFields(res.body)).toContain(field);
    });

    it('accepts answers of exactly 1,000 characters', async () => {
      const owner = await asOwner(ctx);
      await call(ctx, owner, 'post', WISHLIST).send({ ...ITEM, valueAdded: 'x'.repeat(1000) }).expect(201);
    });
  });

  describe('GET /wishlist', () => {
    it('lists newest first and filters by status', async () => {
      const owner = await asOwner(ctx);
      await createWishlistItem(ctx.prisma, { name: 'Lama', created_at: new Date('2026-10-01T00:00:00Z') });
      await createWishlistItem(ctx.prisma, { name: 'Baru', created_at: new Date('2026-10-05T00:00:00Z') });
      await createWishlistItem(ctx.prisma, { name: 'Batal', status: 'CANCELLED' });

      const all = await call(ctx, owner, 'get', WISHLIST).expect(200);
      expect(all.body.map((i: { name: string }) => i.name)).toEqual(['Batal', 'Baru', 'Lama']);
      const waiting = await call(ctx, owner, 'get', `${WISHLIST}?status=WAITING`).expect(200);
      expect(waiting.body.map((i: { name: string }) => i.name)).toEqual(['Baru', 'Lama']);
    });

    it('shows a stored review', async () => {
      const owner = await asOwner(ctx);
      const item = await createWishlistItem(ctx.prisma, { ...REVIEWED });
      const res = await call(ctx, owner, 'get', `${WISHLIST}/${item.id}`).expect(200);
      expect(res.body.review).toEqual({
        verdict: 'PLANNED',
        reasons: ['Kebutuhan kerja jelas', 'Barang lama sudah lambat'],
        suggestion: 'Bandingkan dua toko dulu.',
        financeSnapshot: null,
        reviewedAt: '2026-10-10T03:00:00.000Z',
        model: 'claude-opus-5-5',
        answersChanged: false,
      });
    });

    it('answers 404 for an unknown item', async () => {
      const owner = await asOwner(ctx);
      const res = await call(ctx, owner, 'get', `${WISHLIST}/${randomUUID()}`).expect(404);
      expect(res.body.message).toBe('Barang tidak ditemukan');
    });
  });

  describe('PATCH /wishlist/:id', () => {
    it('marks a review as outdated once an answer or the price changes, not for the status', async () => {
      const owner = await asOwner(ctx);
      const item = await createWishlistItem(ctx.prisma, { ...REVIEWED });

      const status = await call(ctx, owner, 'patch', `${WISHLIST}/${item.id}`)
        .send({ status: 'CANCELLED', includeFinance: false })
        .expect(200);
      expect(status.body).toMatchObject({ status: 'CANCELLED', includeFinance: false });
      expect(status.body.review.answersChanged).toBe(false);

      const same = await call(ctx, owner, 'patch', `${WISHLIST}/${item.id}`).send({ price: '2500000' }).expect(200);
      expect(same.body.review.answersChanged).toBe(false);

      const price = await call(ctx, owner, 'patch', `${WISHLIST}/${item.id}`).send({ price: '2400000' }).expect(200);
      expect(price.body.review).toMatchObject({ verdict: 'PLANNED', answersChanged: true });
    });

    it('marks it outdated for a changed answer', async () => {
      const owner = await asOwner(ctx);
      const item = await createWishlistItem(ctx.prisma, { ...REVIEWED });
      const res = await call(ctx, owner, 'patch', `${WISHLIST}/${item.id}`).send({ reason: 'Alasan baru' }).expect(200);
      expect(res.body.review.answersChanged).toBe(true);
    });

    it('records nothing as outdated while there is no review', async () => {
      const owner = await asOwner(ctx);
      const item = await createWishlistItem(ctx.prisma);
      await call(ctx, owner, 'patch', `${WISHLIST}/${item.id}`).send({ reason: 'Alasan baru' }).expect(200);
      const row = await ctx.prisma.wishlistItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(row.answers_changed_at).toBeNull();
    });

    it('moves between statuses freely, and audits before and after', async () => {
      const owner = await asOwner(ctx);
      const item = await createWishlistItem(ctx.prisma, { name: 'Sepatu' });
      for (const status of ['BOUGHT', 'WAITING', 'CANCELLED', 'WAITING']) {
        await call(ctx, owner, 'patch', `${WISHLIST}/${item.id}`).send({ status }).expect(200);
      }
      const logs = await ctx.prisma.auditLog.findMany({
        where: { entity_type: 'wishlist_item', action: 'UPDATE' },
        orderBy: { created_at: 'asc' },
      });
      expect(logs).toHaveLength(4);
      expect(logs[0]!.before).toMatchObject({ status: 'WAITING', name: 'Sepatu' });
      expect(logs[0]!.after).toMatchObject({ status: 'BOUGHT' });
    });

    it('refuses an unknown status and answers 404 for an unknown item', async () => {
      const owner = await asOwner(ctx);
      const item = await createWishlistItem(ctx.prisma);
      const bad = await call(ctx, owner, 'patch', `${WISHLIST}/${item.id}`).send({ status: 'SOLD' }).expect(400);
      expect(errorFields(bad.body)).toEqual(['status']);
      await call(ctx, owner, 'patch', `${WISHLIST}/${randomUUID()}`).send({ status: 'BOUGHT' }).expect(404);
    });
  });
});
