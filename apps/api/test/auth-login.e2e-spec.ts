import { api, setupE2e } from './e2e-context.js';
import { bearer, createUser, DEFAULT_PASSWORD, login, loginAs } from './fixtures.js';

const LOGIN = '/api/v1/auth/login';
const ME = '/api/v1/auth/me';

describe('POST /auth/login', () => {
  const ctx = setupE2e();

  it('returns an access token and the user, without any hash', async () => {
    const user = await createUser(ctx.prisma, { email: 'admin@example.com', role: 'SUPER_ADMIN' });

    const res = await api(ctx)
      .post(LOGIN)
      .send({ email: 'admin@example.com', password: DEFAULT_PASSWORD })
      .expect(200);

    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.user).toEqual({
      id: user.id,
      name: user.name,
      email: 'admin@example.com',
      role: 'SUPER_ADMIN',
      mustChangePassword: false,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
  });

  it('sets the refresh token as a locked-down cookie and stores only its hash', async () => {
    const user = await createUser(ctx.prisma);

    const res = await api(ctx)
      .post(LOGIN)
      .send({ email: user.email, password: DEFAULT_PASSWORD })
      .expect(200);

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^refresh_token=[^;]{43,};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).toContain('Max-Age=604800');

    const rawToken = cookie.split(';')[0].replace('refresh_token=', '');
    const rows = await ctx.prisma.refreshToken.findMany({ where: { user_id: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(rawToken);
    expect(rows[0].revoked_at).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(rawToken);
  });

  it('accepts the email in any case and with surrounding spaces', async () => {
    await createUser(ctx.prisma, { email: 'admin@example.com' });

    const res = await api(ctx)
      .post(LOGIN)
      .send({ email: '  ADMIN@Example.COM ', password: DEFAULT_PASSWORD })
      .expect(200);

    expect(res.body.user.email).toBe('admin@example.com');
  });

  it('gives the same 401 for a wrong password, an unknown email and an inactive user', async () => {
    await createUser(ctx.prisma, { email: 'aktif@example.com' });
    await createUser(ctx.prisma, { email: 'nonaktif@example.com', isActive: false });

    const attempts = [
      { email: 'aktif@example.com', password: 'salah-salah' },
      { email: 'tidak-ada@example.com', password: DEFAULT_PASSWORD },
      { email: 'nonaktif@example.com', password: DEFAULT_PASSWORD },
    ];
    for (const attempt of attempts) {
      const res = await api(ctx).post(LOGIN).send(attempt).expect(401);
      expect(res.body).toEqual({ statusCode: 401, message: 'Email atau password salah' });
      expect(res.headers['set-cookie']).toBeUndefined();
    }
    expect(await ctx.prisma.refreshToken.count()).toBe(0);
  });

  it.each([
    ['a missing password', { email: 'a@example.com' }, 'password'],
    ['an empty password', { email: 'a@example.com', password: '' }, 'password'],
    ['a 10,000-character password', { email: 'a@example.com', password: 'x'.repeat(10_000) }, 'password'],
    ['a missing email', { password: DEFAULT_PASSWORD }, 'email'],
    ['a malformed email', { email: 'bukan-email', password: DEFAULT_PASSWORD }, 'email'],
    ['a non-string email', { email: { $ne: null }, password: DEFAULT_PASSWORD }, 'email'],
  ])('rejects %s with a field error', async (_label, body, field) => {
    const res = await api(ctx).post(LOGIN).send(body).expect(400);
    expect(res.body.message).toBe('Validasi gagal');
    expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
  });

  it('records successful and failed logins in the audit log without the password', async () => {
    const user = await createUser(ctx.prisma, { email: 'a@example.com' });

    await login(ctx, 'a@example.com');
    await api(ctx).post(LOGIN).send({ email: 'a@example.com', password: 'salah-salah' }).expect(401);
    await api(ctx).post(LOGIN).send({ email: 'x@example.com', password: 'salah-salah' }).expect(401);

    const rows = await ctx.prisma.auditLog.findMany({ orderBy: { created_at: 'asc' } });
    expect(rows.map((r) => [r.action, r.user_id, r.entity_id])).toEqual([
      ['LOGIN', user.id, user.id],
      ['LOGIN_FAILED', user.id, user.id],
      ['LOGIN_FAILED', null, 'unknown'],
    ]);
    expect(rows[2].after).toEqual({ email: 'x@example.com' });
    expect(JSON.stringify(rows)).not.toContain('salah-salah');
    expect(JSON.stringify(rows)).not.toContain(DEFAULT_PASSWORD);
  });
});

describe('authentication guard', () => {
  const ctx = setupE2e();

  it('returns the current user for a valid token', async () => {
    const session = await loginAs(ctx, { role: 'PROJECT_MANAGER' });

    const res = await api(ctx).get(ME).set(...bearer(session.accessToken)).expect(200);

    expect(res.body).toEqual({ user: session.body.user });
  });

  it.each([
    ['no Authorization header', undefined],
    ['a garbage token', 'Bearer garbage'],
    ['a non-Bearer scheme', 'Basic abc'],
    ['a Bearer header without a token', 'Bearer '],
  ])('rejects %s with 401', async (_label, header) => {
    const req = api(ctx).get(ME);
    if (header) req.set('Authorization', header);
    const res = await req.expect(401);
    expect(res.body).toEqual({ statusCode: 401, message: 'Sesi tidak valid' });
  });

  it('rejects a token whose user no longer exists', async () => {
    const session = await loginAs(ctx);
    await ctx.prisma.refreshToken.deleteMany();
    await ctx.prisma.auditLog.deleteMany();
    await ctx.prisma.user.delete({ where: { id: session.user.id } });

    await api(ctx).get(ME).set(...bearer(session.accessToken)).expect(401);
  });

  it('leaves the health check open', async () => {
    await api(ctx).get('/api/v1/health').expect(200);
  });
});
