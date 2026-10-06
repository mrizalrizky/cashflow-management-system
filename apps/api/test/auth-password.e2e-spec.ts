import { api, E2eContext, setupE2e } from './e2e-context.js';
import { bearer, DEFAULT_PASSWORD, login, loginAs, refreshCookie, Session } from './fixtures.js';

const CHANGE = '/api/v1/auth/change-password';
const REFRESH = '/api/v1/auth/refresh';
const LOGIN = '/api/v1/auth/login';
const NEW_PASSWORD = 'password-baru-456';

function changePassword(ctx: E2eContext, session: Session, body: Record<string, unknown>) {
  return api(ctx).post(CHANGE).set(...bearer(session.accessToken)).send(body);
}

describe('POST /auth/change-password', () => {
  const ctx = setupE2e();

  it('replaces the password', async () => {
    const session = await loginAs(ctx);

    await changePassword(ctx, session, {
      currentPassword: DEFAULT_PASSWORD,
      newPassword: NEW_PASSWORD,
    }).expect(200);

    await api(ctx)
      .post(LOGIN)
      .send({ email: session.user.email, password: DEFAULT_PASSWORD })
      .expect(401);
    await login(ctx, session.user.email, NEW_PASSWORD);
  });

  it('ends every other session and keeps the current one signed in', async () => {
    const session = await loginAs(ctx);
    const otherDevice = await login(ctx, session.user.email);

    const res = await changePassword(ctx, session, {
      currentPassword: DEFAULT_PASSWORD,
      newPassword: NEW_PASSWORD,
    }).expect(200);

    await api(ctx).post(REFRESH).set('Cookie', session.cookie).expect(401);
    await api(ctx).post(REFRESH).set('Cookie', otherDevice.cookie).expect(401);
    await api(ctx).post(REFRESH).set('Cookie', refreshCookie(res)).expect(200);
  });

  it('refuses a wrong current password and changes nothing', async () => {
    const session = await loginAs(ctx);

    const res = await changePassword(ctx, session, {
      currentPassword: 'bukan-password-saya',
      newPassword: NEW_PASSWORD,
    }).expect(401);

    expect(res.body).toEqual({ statusCode: 401, message: 'Password saat ini salah' });
    await login(ctx, session.user.email, DEFAULT_PASSWORD);
    await api(ctx).post(REFRESH).set('Cookie', session.cookie).expect(200);
  });

  it.each([
    ['shorter than 8 characters', 'pendek1'],
    ['longer than 128 characters', 'x'.repeat(129)],
    ['the same as the current password', DEFAULT_PASSWORD],
    ['not a string', 12345678],
  ])('rejects a new password that is %s', async (_label, newPassword) => {
    const session = await loginAs(ctx);

    const res = await changePassword(ctx, session, {
      currentPassword: DEFAULT_PASSWORD,
      newPassword,
    }).expect(400);

    expect(res.body.message).toBe('Validasi gagal');
    expect(res.body.errors.map((e: { field: string }) => e.field)).toEqual(['newPassword']);
    await login(ctx, session.user.email, DEFAULT_PASSWORD);
  });

  it('requires authentication', async () => {
    await api(ctx)
      .post(CHANGE)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(401);
  });

  it('records the change without any password or hash', async () => {
    const session = await loginAs(ctx);

    await changePassword(ctx, session, {
      currentPassword: DEFAULT_PASSWORD,
      newPassword: NEW_PASSWORD,
    }).expect(200);

    const rows = await ctx.prisma.auditLog.findMany({ where: { action: 'CHANGE_PASSWORD' } });
    expect(rows.map((r) => [r.user_id, r.entity_id])).toEqual([
      [session.user.id, session.user.id],
    ]);
    const dump = JSON.stringify(rows);
    expect(dump).not.toContain(NEW_PASSWORD);
    expect(dump).not.toContain(DEFAULT_PASSWORD);
    expect(dump).not.toMatch(/argon2/);
  });
});
