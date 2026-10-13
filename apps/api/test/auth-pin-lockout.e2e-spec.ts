import { PIN_LOCK_MS } from '../src/auth/pin-lockout.js';
import { PinService } from '../src/auth/pin.service.js';
import { createTestApp } from './app-factory.js';
import { api, setupE2e } from './e2e-context.js';
import { createOwner, loginWithPin, OWNER_PIN, setupPin } from './fixtures.js';
import { LOGIN } from './routes.js';

const WRONG = '999999';

describe('PIN lockout', () => {
  const ctx = setupE2e();

  beforeEach(async () => {
    await createOwner(ctx.prisma);
    await setupPin(ctx);
  });

  async function failTimes(count: number): Promise<number[]> {
    const statuses: number[] = [];
    for (let i = 0; i < count; i += 1) statuses.push((await loginWithPin(ctx, WRONG)).status);
    return statuses;
  }

  it('pauses PIN entry for 15 minutes on the fifth wrong PIN', async () => {
    expect(await failTimes(5)).toEqual([401, 401, 401, 401, 429]);

    const owner = await ctx.prisma.user.findFirstOrThrow();
    const pause = owner.pin_locked_until!.getTime() - Date.now();
    expect(pause).toBeGreaterThan(PIN_LOCK_MS - 60_000);
    expect(pause).toBeLessThanOrEqual(PIN_LOCK_MS);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'LOGIN_FAILED' } })).toBe(5);
  });

  it('refuses even the right PIN during the pause, saying how long is left, without counting', async () => {
    await failTimes(5);

    const res = await loginWithPin(ctx, OWNER_PIN).expect(429);
    expect(res.body.message).toBe('PIN dikunci. Coba lagi dalam 15 menit.');
    const owner = await ctx.prisma.user.findFirstOrThrow();
    expect(owner.pin_failed_attempts).toBe(0);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'LOGIN_LOCKED' } })).toBe(1);
    expect(await ctx.prisma.refreshToken.count()).toBe(1);
  });

  it('accepts the PIN again after the pause and starts counting from zero', async () => {
    await failTimes(5);
    // Waktu palsu: jedanya dibuat sudah lewat.
    await ctx.prisma.user.updateMany({ data: { pin_locked_until: new Date(Date.now() - 1000) } });

    expect(await failTimes(1)).toEqual([401]);
    await loginWithPin(ctx, OWNER_PIN).expect(200);
    expect((await ctx.prisma.user.findFirstOrThrow()).pin_failed_attempts).toBe(0);
  });

  it('resets the count after a successful PIN', async () => {
    await failTimes(4);
    await loginWithPin(ctx, OWNER_PIN).expect(200);
    expect(await failTimes(4)).toEqual([401, 401, 401, 401]);
  });

  it('counts simultaneous guesses one by one', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => loginWithPin(ctx, WRONG)));

    expect(results.filter((r) => r.status === 429)).toHaveLength(2);
    expect(results.filter((r) => r.status === 401)).toHaveLength(4);
  });

  it('does not hold up a logout or a new audit entry while a PIN is being checked', async () => {
    const owner = await ctx.prisma.user.findFirstOrThrow();
    const pins = ctx.app.get(PinService);
    // Sambil pemeriksaan PIN memegang kuncinya, sambungan lain menulis baris yang merujuk pemilik
    // (seperti audit saat keluar). Kunci yang terlalu keras membuat tulisan itu menunggu, dan
    // dua transaksi seperti itu bisa saling mengunci.
    const elsewhere = await ctx.prisma.$transaction(async (tx) => {
      await pins.verify(tx, WRONG, null);
      return Promise.race([
        ctx.prisma.auditLog
          .create({ data: { user_id: owner.id, action: 'LOGOUT', entity_type: 'user', entity_id: owner.id } })
          .then(() => 'written'),
        new Promise((resolve) => setTimeout(() => resolve('blocked'), 2_000)),
      ]);
    });
    expect(elsewhere).toBe('written');
  });

  it('keeps the pause after the application restarts', async () => {
    await failTimes(5);
    const restarted = await createTestApp();
    try {
      await api({ app: restarted, prisma: ctx.prisma }).post(LOGIN).send({ pin: OWNER_PIN }).expect(429);
    } finally {
      await restarted.close();
    }
  });
});
