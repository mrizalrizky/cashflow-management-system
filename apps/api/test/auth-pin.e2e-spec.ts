import { api, setupE2e } from './e2e-context.js';
import { bearer, createOwner, errorFields, loginWithPin, OWNER_PIN, refreshCookie, setupPin } from './fixtures.js';
import { CHANGE_PIN, LOGOUT, ME, PIN_STATUS, REFRESH, SETUP_PIN } from './routes.js';

describe('PIN', () => {
  const ctx = setupE2e();

  beforeEach(async () => {
    await createOwner(ctx.prisma);
  });

  it('says there is no PIN yet on a fresh install', async () => {
    const res = await api(ctx).get(PIN_STATUS).expect(200);
    expect(res.body).toEqual({ pinSet: false });
  });

  it('creates the PIN once, signs in at once and records it without the PIN itself', async () => {
    const session = await setupPin(ctx);

    expect(session.body.user).toEqual({ id: expect.any(String), name: 'Pemilik' });
    await api(ctx).get(ME).set(...bearer(session.accessToken)).expect(200);
    expect((await api(ctx).get(PIN_STATUS)).body).toEqual({ pinSet: true });

    const owner = await ctx.prisma.user.findFirstOrThrow();
    expect(owner.pin_hash).toMatch(/^\$argon2/);
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'PIN_SETUP' } });
    expect(JSON.stringify(row)).not.toContain(OWNER_PIN);
  });

  it('refuses to create a second PIN, also when two tabs submit at once', async () => {
    const [a, b] = await Promise.all([
      api(ctx).post(SETUP_PIN).send({ pin: '111111' }),
      api(ctx).post(SETUP_PIN).send({ pin: '222222' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const refused = await api(ctx).post(SETUP_PIN).send({ pin: '333333' }).expect(409);
    expect(refused.body.message).toBe('PIN sudah dibuat');

    const winner = a.status === 201 ? '111111' : '222222';
    await loginWithPin(ctx, winner).expect(200);
  });

  it.each([
    ['too short', '12345'],
    ['too long', '1234567890123'],
    ['with a letter', '12345a'],
    ['with a space', ' 123456'],
    ['as a number', 123456],
  ])('refuses a PIN that is %s', async (_label, pin) => {
    const res = await api(ctx).post(SETUP_PIN).send({ pin }).expect(400);
    expect(errorFields(res.body)).toContain('pin');
  });

  it('keeps leading zeros', async () => {
    await setupPin(ctx, '000123');
    await loginWithPin(ctx, '000123').expect(200);
    await loginWithPin(ctx, '123').expect(400);
  });

  it('signs in with the right PIN and refuses a wrong one', async () => {
    await setupPin(ctx);
    const ok = await loginWithPin(ctx, OWNER_PIN).expect(200);
    expect(ok.body.user.name).toBe('Pemilik');

    const wrong = await loginWithPin(ctx, '999999').expect(401);
    expect(wrong.body.message).toBe('PIN salah');
    expect(await ctx.prisma.auditLog.count({ where: { action: 'LOGIN_FAILED' } })).toBe(1);
  });

  it('asks to create a PIN instead of signing in while none exists', async () => {
    const res = await loginWithPin(ctx, OWNER_PIN).expect(409);
    expect(res.body.message).toBe('PIN belum dibuat');
  });

  it('keeps a device signed in for 30 days', async () => {
    const session = await setupPin(ctx);
    const token = await ctx.prisma.refreshToken.findFirstOrThrow();
    const days = (token.expires_at.getTime() - token.created_at.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(30);

    const refreshed = await api(ctx).post(REFRESH).set('Cookie', session.cookie).expect(200);
    expect(refreshCookie(refreshed)).not.toBe(session.cookie);
  });

  it('changes the PIN with the current one, ending other sessions but not this one', async () => {
    const here = await setupPin(ctx);
    const elsewhere = await loginWithPin(ctx, OWNER_PIN).expect(200);

    const changed = await api(ctx)
      .post(CHANGE_PIN)
      .set(...bearer(here.accessToken))
      .send({ currentPin: OWNER_PIN, newPin: '246810' })
      .expect(200);

    await api(ctx).post(REFRESH).set('Cookie', refreshCookie(elsewhere)).expect(401);
    await api(ctx).post(REFRESH).set('Cookie', refreshCookie(changed)).expect(200);
    await loginWithPin(ctx, OWNER_PIN).expect(401);
    await loginWithPin(ctx, '246810').expect(200);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'PIN_CHANGE' } })).toBe(1);
  });

  it('signs other devices out on their very next request after a PIN change', async () => {
    const here = await setupPin(ctx);
    const elsewhere = await loginWithPin(ctx, OWNER_PIN).expect(200);
    await api(ctx).get(ME).set(...bearer(elsewhere.body.accessToken)).expect(200);

    const changed = await api(ctx)
      .post(CHANGE_PIN)
      .set(...bearer(here.accessToken))
      .send({ currentPin: OWNER_PIN, newPin: '246810' })
      .expect(200);

    await api(ctx).get(ME).set(...bearer(elsewhere.body.accessToken)).expect(401);
    await api(ctx).get(ME).set(...bearer(here.accessToken)).expect(401);
    await api(ctx).get(ME).set(...bearer(changed.body.accessToken)).expect(200);
  });

  it('counts wrong current PINs toward the pause, like the PIN entry', async () => {
    const session = await setupPin(ctx);
    const attempt = (currentPin: string) =>
      api(ctx).post(CHANGE_PIN).set(...bearer(session.accessToken)).send({ currentPin, newPin: '246810' });

    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await attempt('000000')).status);
    expect(statuses).toEqual([400, 400, 400, 400, 429]);
    await attempt(OWNER_PIN).expect(429);
    await loginWithPin(ctx, OWNER_PIN).expect(429);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'LOGIN_FAILED' } })).toBe(5);
  });

  it('refuses to change the PIN with a wrong current PIN or to the same PIN', async () => {
    const session = await setupPin(ctx);
    const wrong = await api(ctx)
      .post(CHANGE_PIN)
      .set(...bearer(session.accessToken))
      .send({ currentPin: '000000', newPin: '246810' })
      .expect(400);
    expect(errorFields(wrong.body)).toEqual(['currentPin']);

    const same = await api(ctx)
      .post(CHANGE_PIN)
      .set(...bearer(session.accessToken))
      .send({ currentPin: OWNER_PIN, newPin: OWNER_PIN })
      .expect(400);
    expect(errorFields(same.body)).toEqual(['newPin']);
  });

  it('needs a session to change the PIN', async () => {
    await setupPin(ctx);
    await api(ctx).post(CHANGE_PIN).send({ currentPin: OWNER_PIN, newPin: '246810' }).expect(401);
  });

  it('signs out this device', async () => {
    const session = await setupPin(ctx);
    await api(ctx).post(LOGOUT).set('Cookie', session.cookie).expect(204);
    await api(ctx).post(REFRESH).set('Cookie', session.cookie).expect(401);
  });
});
