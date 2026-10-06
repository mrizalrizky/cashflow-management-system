import type { Role } from '../src/generated/prisma/client.js';
import { api, setupE2e } from './e2e-context.js';
import { bearer, DEFAULT_PASSWORD, loginAs } from './fixtures.js';
import { CHANGE_PASSWORD, ME, USERS } from './routes.js';

const NEW_USER = { name: 'Baru', email: 'baru@example.com', role: 'STAFF', password: 'password-123' };

describe('role enforcement', () => {
  const ctx = setupE2e();

  it('rejects requests without a token', async () => {
    await api(ctx).get(USERS).expect(401);
    await api(ctx).post(USERS).send(NEW_USER).expect(401);
  });

  it.each<[Role, number, number]>([
    ['STAFF', 403, 403],
    ['PROJECT_MANAGER', 403, 403],
    ['SUPER_ADMIN', 200, 201],
  ])('gives %s %i on listing users and %i on creating one', async (role, listStatus, createStatus) => {
    const session = await loginAs(ctx, { role });

    const list = await api(ctx).get(USERS).set(...bearer(session.accessToken)).expect(listStatus);
    await api(ctx)
      .post(USERS)
      .set(...bearer(session.accessToken))
      .send(NEW_USER)
      .expect(createStatus);

    if (listStatus === 403) {
      expect(list.body).toEqual({ statusCode: 403, message: 'Anda tidak memiliki akses' });
      expect(await ctx.prisma.user.count()).toBe(1);
    }
  });

  it('applies a role change to a token that was issued before it', async () => {
    const session = await loginAs(ctx, { role: 'SUPER_ADMIN' });
    await api(ctx).get(USERS).set(...bearer(session.accessToken)).expect(200);

    await ctx.prisma.user.update({ where: { id: session.user.id }, data: { role: 'STAFF' } });

    await api(ctx).get(USERS).set(...bearer(session.accessToken)).expect(403);
  });

  it('rejects the token of a user who has been deactivated', async () => {
    const session = await loginAs(ctx);
    await api(ctx).get(ME).set(...bearer(session.accessToken)).expect(200);

    await ctx.prisma.user.update({ where: { id: session.user.id }, data: { is_active: false } });

    await api(ctx).get(ME).set(...bearer(session.accessToken)).expect(401);
  });
});

describe('forced password change', () => {
  const ctx = setupE2e();

  it('blocks ordinary routes but allows /auth/me while a change is pending', async () => {
    const session = await loginAs(ctx, { role: 'SUPER_ADMIN', mustChangePassword: true });

    const blocked = await api(ctx).get(USERS).set(...bearer(session.accessToken)).expect(403);
    expect(blocked.body).toEqual({
      statusCode: 403,
      message: 'Password harus diganti sebelum melanjutkan',
    });

    const me = await api(ctx).get(ME).set(...bearer(session.accessToken)).expect(200);
    expect(me.body.user.mustChangePassword).toBe(true);
  });

  it('is lifted once the password is changed', async () => {
    const session = await loginAs(ctx, { role: 'SUPER_ADMIN', mustChangePassword: true });

    const res = await api(ctx)
      .post(CHANGE_PASSWORD)
      .set(...bearer(session.accessToken))
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'password-baru-456' })
      .expect(200);

    expect(res.body.user.mustChangePassword).toBe(false);
    await api(ctx).get(USERS).set(...bearer(res.body.accessToken)).expect(200);
  });
});
