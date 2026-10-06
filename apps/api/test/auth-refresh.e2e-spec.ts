import { api, E2eContext, setupE2e } from './e2e-context.js';
import { bearer, createUser, DEFAULT_PASSWORD, login, loginAs, refreshCookie } from './fixtures.js';
import { CHANGE_PASSWORD, LOGOUT, ME, REFRESH } from './routes.js';

const SESSION_ENDED = { statusCode: 401, message: 'Sesi berakhir, silakan login kembali' };

function refresh(ctx: E2eContext, cookie?: string) {
  const req = api(ctx).post(REFRESH);
  return cookie ? req.set('Cookie', cookie) : req;
}

/** Memundurkan waktu pencabutan supaya token lama berada di luar jeda toleransi. */
async function ageRevocations(ctx: E2eContext, seconds: number): Promise<void> {
  await ctx.prisma.refreshToken.updateMany({
    where: { revoked_at: { not: null } },
    data: { revoked_at: new Date(Date.now() - seconds * 1000) },
  });
}

describe('POST /auth/refresh', () => {
  const ctx = setupE2e();

  it('rotates the refresh token and returns a working access token', async () => {
    const session = await loginAs(ctx);

    const res = await refresh(ctx, session.cookie).expect(200);

    const newCookie = refreshCookie(res);
    expect(newCookie).not.toBe(session.cookie);
    expect(res.body.user).toEqual(session.body.user);
    await api(ctx).get(ME).set(...bearer(res.body.accessToken)).expect(200);

    const rows = await ctx.prisma.refreshToken.findMany({ orderBy: { created_at: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0].revoked_at).not.toBeNull();
    expect(rows[1].revoked_at).toBeNull();
  });

  it.each([
    ['no cookie', undefined],
    ['an unknown token', 'refresh_token=tidak-dikenal'],
    ['an empty cookie', 'refresh_token='],
  ])('rejects %s with 401', async (_label, cookie) => {
    await loginAs(ctx);
    const res = await refresh(ctx, cookie).expect(401);
    expect(res.body).toEqual(SESSION_ENDED);
  });

  it('revokes every session when an old token is replayed after the grace period', async () => {
    const session = await loginAs(ctx);
    const otherDevice = await login(ctx, session.user.email);
    const rotated = refreshCookie(await refresh(ctx, session.cookie).expect(200));
    await ageRevocations(ctx, 11);

    const res = await refresh(ctx, session.cookie).expect(401);

    expect(res.body).toEqual(SESSION_ENDED);
    await refresh(ctx, rotated).expect(401);
    await refresh(ctx, otherDevice.cookie).expect(401);
    const reuse = await ctx.prisma.auditLog.findMany({ where: { action: 'TOKEN_REUSE' } });
    expect(reuse).toHaveLength(1);
    expect(reuse[0].user_id).toBe(session.user.id);
  });

  it('does not punish a second tab that refreshes at the same moment', async () => {
    const session = await loginAs(ctx);
    const rotated = refreshCookie(await refresh(ctx, session.cookie).expect(200));

    await refresh(ctx, session.cookie).expect(401);

    await refresh(ctx, rotated).expect(200);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'TOKEN_REUSE' } })).toBe(0);
  });

  it('lets only one of two simultaneous refreshes succeed', async () => {
    const session = await loginAs(ctx);

    const results = await Promise.all([
      refresh(ctx, session.cookie),
      refresh(ctx, session.cookie),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    expect(await ctx.prisma.refreshToken.count({ where: { revoked_at: null } })).toBe(1);
  });

  it('treats a session ended by a password change as ended, not as stolen', async () => {
    const laptop = await loginAs(ctx);
    const phone = await login(ctx, laptop.user.email);
    const changed = await api(ctx)
      .post(CHANGE_PASSWORD)
      .set(...bearer(laptop.accessToken))
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'password-baru-456' })
      .expect(200);
    await ageRevocations(ctx, 11);

    await refresh(ctx, phone.cookie).expect(401);

    await refresh(ctx, refreshCookie(changed)).expect(200);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'TOKEN_REUSE' } })).toBe(0);
  });

  it('ignores a rotated token that has since expired', async () => {
    const session = await loginAs(ctx);
    const rotated = refreshCookie(await refresh(ctx, session.cookie).expect(200));
    await ageRevocations(ctx, 11);
    await ctx.prisma.refreshToken.updateMany({
      where: { revoked_at: { not: null } },
      data: { expires_at: new Date(Date.now() - 1000) },
    });

    await refresh(ctx, session.cookie).expect(401);

    await refresh(ctx, rotated).expect(200);
  });

  it('clears the cookie when the refresh fails', async () => {
    const res = await refresh(ctx, 'refresh_token=tidak-dikenal').expect(401);
    const cleared = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cleared).toMatch(/^refresh_token=;/);
  });

  it('rejects an expired refresh token', async () => {
    const session = await loginAs(ctx);
    await ctx.prisma.refreshToken.updateMany({ data: { expires_at: new Date(Date.now() - 1000) } });

    await refresh(ctx, session.cookie).expect(401);
  });

  it('rejects a user who was deactivated after logging in', async () => {
    const session = await loginAs(ctx);
    await ctx.prisma.user.update({ where: { id: session.user.id }, data: { is_active: false } });

    await refresh(ctx, session.cookie).expect(401);
  });
});

describe('POST /auth/logout', () => {
  const ctx = setupE2e();

  it('revokes the session, clears the cookie and records the logout', async () => {
    const session = await loginAs(ctx);

    const res = await api(ctx).post(LOGOUT).set('Cookie', session.cookie).expect(204);

    const cleared = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cleared).toMatch(/^refresh_token=;/);
    expect(cleared).toContain('Path=/api/v1/auth');
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    await refresh(ctx, session.cookie).expect(401);
    const logouts = await ctx.prisma.auditLog.findMany({ where: { action: 'LOGOUT' } });
    expect(logouts.map((l) => l.user_id)).toEqual([session.user.id]);
  });

  it('leaves other sessions of the same user alone', async () => {
    const user = await createUser(ctx.prisma);
    const first = await login(ctx, user.email);
    const second = await login(ctx, user.email);

    await api(ctx).post(LOGOUT).set('Cookie', first.cookie).expect(204);

    await refresh(ctx, second.cookie).expect(200);
  });

  it('succeeds without a cookie or with an unknown one', async () => {
    await api(ctx).post(LOGOUT).expect(204);
    await api(ctx).post(LOGOUT).set('Cookie', 'refresh_token=tidak-dikenal').expect(204);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'LOGOUT' } })).toBe(0);
  });
});
