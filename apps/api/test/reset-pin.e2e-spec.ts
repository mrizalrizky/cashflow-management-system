import { resetPin } from '../src/cli/reset-pin.js';
import { api, setupE2e } from './e2e-context.js';
import { bearer, createOwner, loginWithPin, OWNER_PIN, setupPin } from './fixtures.js';
import { ME, PIN_STATUS, REFRESH } from './routes.js';

describe('reset-pin', () => {
  const ctx = setupE2e();

  it('clears the PIN, the lockout and every session, and records it', async () => {
    await createOwner(ctx.prisma);
    const session = await setupPin(ctx);
    await ctx.prisma.user.updateMany({
      data: { pin_failed_attempts: 3, pin_locked_until: new Date(Date.now() + 60_000) },
    });

    expect(await resetPin(ctx.prisma)).toBe(true);

    expect((await api(ctx).get(PIN_STATUS)).body).toEqual({ pinSet: false });
    await api(ctx).post(REFRESH).set('Cookie', session.cookie).expect(401);
    expect(await ctx.prisma.user.findFirstOrThrow()).toMatchObject({
      pin_hash: null,
      pin_failed_attempts: 0,
      pin_locked_until: null,
    });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'PIN_RESET' } })).toBe(1);

    await setupPin(ctx, '246810');
    await loginWithPin(ctx, OWNER_PIN).expect(401);
  });

  it('signs every device out on its very next request', async () => {
    await createOwner(ctx.prisma);
    const session = await setupPin(ctx);
    await api(ctx).get(ME).set(...bearer(session.accessToken)).expect(200);

    await resetPin(ctx.prisma);

    await api(ctx).get(ME).set(...bearer(session.accessToken)).expect(401);
  });

  it('does nothing when there is no owner yet', async () => {
    expect(await resetPin(ctx.prisma)).toBe(false);
  });

  it('leaves accounts and transactions untouched', async () => {
    await createOwner(ctx.prisma);
    await ctx.prisma.account.create({ data: { name: 'Dompet', type: 'CASH' } });

    await resetPin(ctx.prisma);

    expect(await ctx.prisma.account.count()).toBe(1);
  });
});
