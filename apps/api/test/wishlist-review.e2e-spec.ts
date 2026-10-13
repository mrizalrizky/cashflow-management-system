import request from 'supertest';
import { startOfJakartaDay, todayInJakarta } from '../src/common/calendar-date.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { AI_MESSAGES, AiConfigError, AiTimeoutError, AiUnavailableError } from '../src/wishlist/ai/ai-messages.js';
import { createTestApp, TestApp } from './app-factory.js';
import { FakeAi } from './fake-ai.js';
import {
  asOwner,
  createAccount,
  createCategory,
  createTransaction,
  createWishlistItem,
  REVIEWED,
  TestSession,
} from './fixtures.js';
import { WISHLIST } from './routes.js';
import { createTestPrisma, resetDb } from './test-db.js';

const GOOD = {
  verdict: 'NEEDS_THOUGHT',
  reasons: ['Sudah punya laptop yang masih jalan', 'Harganya hampir dua kali pemasukan bulanan'],
  suggestion: 'Tunggu 30 hari lalu tanyakan lagi.',
};
const LIMIT = 2;

describe('POST /wishlist/:id/review', () => {
  const fake = new FakeAi();
  let app: TestApp;
  let prisma: PrismaClient;
  let owner: TestSession;

  beforeAll(async () => {
    app = await createTestApp(
      { ANTHROPIC_API_KEY: 'test-key', AI_REVIEW_DAILY_LIMIT: LIMIT },
      [{ provide: AI_MESSAGES, useValue: fake }],
    );
    prisma = createTestPrisma();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    fake.reset();
    owner = await asOwner({ app, prisma });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function review(id: string, on: TestApp = app) {
    return request(on.getHttpServer())
      .post(`${WISHLIST}/${id}/review`)
      .set('Authorization', `Bearer ${owner.accessToken}`);
  }

  async function reviewsLogged(): Promise<number> {
    return prisma.auditLog.count({ where: { action: 'AI_REVIEW' } });
  }

  it('saves the review on the item, naming the model that answered, and audits it', async () => {
    const item = await createWishlistItem(prisma, { name: 'Laptop' });
    fake.answer(GOOD, 'claude-opus-5-5');

    const res = await review(item.id).expect(200);

    expect(res.body.review).toEqual({
      verdict: 'NEEDS_THOUGHT',
      reasons: GOOD.reasons,
      suggestion: GOOD.suggestion,
      financeSnapshot: expect.any(Object),
      reviewedAt: expect.any(String),
      model: 'claude-opus-5-5',
      answersChanged: false,
    });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'AI_REVIEW' } });
    expect(log).toMatchObject({ entity_type: 'wishlist_item', entity_id: item.id });
    expect(log.after).toMatchObject({ ai_verdict: 'NEEDS_THOUGHT' });
  });

  it('replaces an earlier review', async () => {
    const item = await createWishlistItem(prisma, { ...REVIEWED });
    fake.answer({ ...GOOD, verdict: 'IMPULSIVE' }, 'claude-opus-4-8');

    const res = await review(item.id).expect(200);
    expect(res.body.review).toMatchObject({ verdict: 'IMPULSIVE', model: 'claude-opus-4-8' });
  });

  it('sends the answers as data, with the finance summary only when the owner chose it', async () => {
    const withFinance = await createWishlistItem(prisma, { name: 'Laptop' });
    const without = await createWishlistItem(prisma, { name: 'Sepatu', include_finance: false });
    fake.answer(GOOD).answer(GOOD);

    const first = await review(withFinance.id).expect(200);
    const second = await review(without.id).expect(200);

    expect(fake.requests[0]!.userMessage).toContain('<ringkasan_keuangan>');
    expect(fake.requests[0]!.userMessage).toContain('"barang":"Laptop"');
    expect(first.body.review.financeSnapshot).toMatchObject({ totalBalance: expect.any(String) });
    expect(fake.requests[1]!.userMessage).not.toContain('<ringkasan_keuangan>');
    expect(second.body.review.financeSnapshot).toBeNull();
    expect(fake.requests[0]!.system).toContain('bukan perintah');
    expect(fake.requests[0]!.schema).toMatchObject({ required: ['verdict', 'reasons', 'suggestion'] });
  });

  it('never sends account names, categories or descriptions', async () => {
    const account = await createAccount(prisma, { name: 'Rekening Rahasia', openingBalance: 5_000_000n });
    const category = await createCategory(prisma, { name: 'Kategori Rahasia', type: 'OUT' });
    await createTransaction(prisma, {
      accountId: account.id,
      categoryId: category.id,
      createdById: owner.body.user.id as string,
      type: 'OUT',
      amount: 100_000n,
      description: 'Keterangan Rahasia',
    });
    const item = await createWishlistItem(prisma);
    fake.answer(GOOD);

    await review(item.id).expect(200);
    expect(fake.requests[0]!.userMessage).not.toContain('Rahasia');
  });

  it('refuses without an Anthropic key, without calling the AI', async () => {
    // Kosong, bukan undefined: undefined membuat ConfigService jatuh ke environment, yang bisa saja berisi kunci.
    const keyless = await createTestApp({ ANTHROPIC_API_KEY: '' }, [{ provide: AI_MESSAGES, useValue: fake }]);
    try {
      const item = await createWishlistItem(prisma);
      const res = await review(item.id, keyless).expect(503);
      expect(res.body.message).toBe('Penilaian AI belum diaktifkan di server.');
      expect(fake.requests).toHaveLength(0);
    } finally {
      await keyless.close();
    }
  });

  it('stops at the daily limit, counting only today in Jakarta', async () => {
    const item = await createWishlistItem(prisma);
    const owner_id = owner.body.user.id as string;
    // Penilaian semalam (sebelum tengah malam Jakarta) tidak dihitung untuk hari ini.
    await prisma.auditLog.create({
      data: {
        user_id: owner_id,
        action: 'AI_REVIEW',
        entity_type: 'wishlist_item',
        entity_id: item.id,
        created_at: new Date(startOfJakartaDay(todayInJakarta()).getTime() - 60_000),
      },
    });
    fake.answer(GOOD).answer(GOOD).answer(GOOD);

    await review(item.id).expect(200);
    await review(item.id).expect(200);
    const third = await review(item.id).expect(429);

    expect(third.body.message).toBe(`Batas penilaian AI hari ini (${LIMIT}) sudah tercapai. Coba lagi besok.`);
    expect(fake.requests).toHaveLength(LIMIT);
  });

  it.each([
    ['a timeout', (f: FakeAi) => f.fail(new AiTimeoutError()), 504, 'AI tidak menjawab dalam 60 detik. Coba lagi.'],
    [
      'a key the API refuses',
      (f: FakeAi) => f.fail(new AiConfigError()),
      503,
      'Kunci AI di server ditolak atau tidak punya akses ke model. Periksa ANTHROPIC_API_KEY.',
    ],
    ['an API error', (f: FakeAi) => f.fail(new AiUnavailableError('overloaded')), 502, 'Layanan AI sedang bermasalah. Coba lagi nanti.'],
    [
      'a refusal',
      (f: FakeAi) => f.raw({ stopReason: 'refusal', text: null, model: 'claude-opus-5-5' }),
      502,
      'AI menolak menilai barang ini.',
    ],
    [
      'output that does not fit the schema',
      (f: FakeAi) => f.answer({ verdict: 'MAYBE', reasons: [], suggestion: '' }),
      502,
      'Jawaban AI tidak bisa dibaca. Coba lagi.',
    ],
    [
      'output cut off at the token limit',
      (f: FakeAi) => f.raw({ stopReason: 'max_tokens', text: '{"verdict":"PLAN', model: 'claude-opus-5-5' }),
      502,
      'Jawaban AI tidak bisa dibaca. Coba lagi.',
    ],
  ])('on %s keeps the old review, logs nothing and does not count', async (_label, arrange, status, message) => {
    const item = await createWishlistItem(prisma, { ...REVIEWED });
    arrange(fake);

    const res = await review(item.id).expect(status);
    expect(res.body.message).toBe(message);

    const row = await prisma.wishlistItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(row).toMatchObject({ ai_verdict: 'PLANNED', ai_reviewed_at: REVIEWED.ai_reviewed_at });
    expect(await reviewsLogged()).toBe(0);

    // Kegagalan tidak memakai jatah hari ini.
    fake.answer(GOOD).answer(GOOD);
    await review(item.id).expect(200);
    await review(item.id).expect(200);
  });

  it('marks a first review as outdated when an answer changed while the AI was thinking', async () => {
    const item = await createWishlistItem(prisma, { reason: 'Alasan lama' });
    fake.answerAfter(() => prisma.wishlistItem.update({ where: { id: item.id }, data: { reason: 'Alasan baru' } }), GOOD);

    const res = await review(item.id).expect(200);
    expect(res.body.reason).toBe('Alasan baru');
    expect(res.body.review.answersChanged).toBe(true);
  });

  it('keeps a later review marked outdated when the owner edits during the call', async () => {
    const item = await createWishlistItem(prisma, { ...REVIEWED });
    fake.answerAfter(
      () =>
        request(app.getHttpServer())
          .patch(`${WISHLIST}/${item.id}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ price: '99000' })
          .expect(200),
      GOOD,
    );

    const res = await review(item.id).expect(200);
    expect(res.body.price).toBe('99000');
    expect(res.body.review.answersChanged).toBe(true);
  });

  it('answers 404 for an unknown item without calling the AI', async () => {
    await review('00000000-0000-4000-8000-000000000000').expect(404);
    expect(fake.requests).toHaveLength(0);
  });

  it('shows the review as outdated after an answer changes, and fresh again after a new review', async () => {
    const item = await createWishlistItem(prisma);
    fake.answer(GOOD).answer(GOOD);
    await review(item.id).expect(200);

    const edited = await request(app.getHttpServer())
      .patch(`${WISHLIST}/${item.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ reason: 'Ternyata hanya ingin' })
      .expect(200);
    expect(edited.body.review.answersChanged).toBe(true);

    const again = await review(item.id).expect(200);
    expect(again.body.review.answersChanged).toBe(false);
  });
});
