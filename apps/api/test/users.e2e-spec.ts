import { randomUUID } from 'node:crypto';
import { toAuthUser } from '../src/auth/auth.types.js';
import { UsersService } from '../src/users/users.service.js';
import { api, E2eContext, setupE2e } from './e2e-context.js';
import { bearer, createUser, DEFAULT_PASSWORD, errorFields, login, loginAs, TestSession } from './fixtures.js';
import { LOGIN, REFRESH, USERS } from './routes.js';

const NEW_USER = {
  name: 'Budi Santoso',
  email: 'Budi@Example.com',
  role: 'PROJECT_MANAGER',
  password: 'password-awal-1',
};

type Method = 'get' | 'post' | 'patch';

function asAdmin(ctx: E2eContext) {
  return loginAs(ctx, { role: 'SUPER_ADMIN', email: 'admin@example.com', name: 'Admin' });
}

function call(ctx: E2eContext, session: TestSession, method: Method, path: string) {
  return api(ctx)[method](path).set(...bearer(session.accessToken));
}

describe('POST /users', () => {
  const ctx = setupE2e();

  it('creates a user who must change their password on first login', async () => {
    const admin = await asAdmin(ctx);

    const res = await call(ctx, admin, 'post', USERS).send(NEW_USER).expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Budi Santoso',
      email: 'budi@example.com',
      role: 'PROJECT_MANAGER',
      isActive: true,
      mustChangePassword: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const created = await login(ctx, 'budi@example.com', NEW_USER.password);
    expect(created.body.user.mustChangePassword).toBe(true);
  });

  it('rejects an email that is already used, in any case', async () => {
    const admin = await asAdmin(ctx);
    await call(ctx, admin, 'post', USERS).send(NEW_USER).expect(201);

    const res = await call(ctx, admin, 'post', USERS)
      .send({ ...NEW_USER, email: 'BUDI@example.com' })
      .expect(409);

    expect(res.body).toEqual({ statusCode: 409, message: 'Email sudah dipakai' });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'CREATE' } })).toBe(1);
  });

  it.each([
    ['an unknown role', { role: 'OWNER' }, 'role'],
    ['a malformed email', { email: 'bukan-email' }, 'email'],
    ['a short password', { password: 'pendek' }, 'password'],
    ['an empty name', { name: '   ' }, 'name'],
    ['an unknown property', { isAdmin: true }, 'isAdmin'],
  ])('rejects %s', async (_label, override, field) => {
    const admin = await asAdmin(ctx);

    const res = await call(ctx, admin, 'post', USERS)
      .send({ ...NEW_USER, ...override })
      .expect(400);

    expect(errorFields(res.body)).toContain(field);
    expect(await ctx.prisma.user.count()).toBe(1);
  });

  it('records the creation without the password', async () => {
    const admin = await asAdmin(ctx);

    const res = await call(ctx, admin, 'post', USERS).send(NEW_USER).expect(201);

    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'CREATE' } });
    expect(row).toMatchObject({ user_id: admin.user.id, entity_type: 'user', entity_id: res.body.id });
    expect(row.after).toMatchObject({ email: 'budi@example.com', role: 'PROJECT_MANAGER' });
    expect(JSON.stringify(row)).not.toMatch(/password-awal-1|password_hash|argon2/);
  });
});

describe('GET /users', () => {
  const ctx = setupE2e();

  it('lists users by name with paging metadata and no hashes', async () => {
    const admin = await asAdmin(ctx);
    await createUser(ctx.prisma, { name: 'Citra', email: 'citra@example.com' });
    await createUser(ctx.prisma, { name: 'Budi', email: 'budi@example.com' });

    const res = await call(ctx, admin, 'get', USERS).expect(200);

    expect(res.body.data.map((u: { name: string }) => u.name)).toEqual(['Admin', 'Budi', 'Citra']);
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 3 });
    expect(JSON.stringify(res.body)).not.toMatch(/hash/i);
  });

  it('filters by search text, role and active state', async () => {
    const admin = await asAdmin(ctx);
    await createUser(ctx.prisma, { name: 'Citra Dewi', email: 'citra@example.com', role: 'PROJECT_MANAGER' });
    await createUser(ctx.prisma, { name: 'Budi', email: 'budi@proyek.example.com', isActive: false });

    const names = async (query: string) => {
      const res = await call(ctx, admin, 'get', `${USERS}?${query}`).expect(200);
      return res.body.data.map((u: { name: string }) => u.name);
    };

    expect(await names('search=CITRA')).toEqual(['Citra Dewi']);
    expect(await names('search=proyek')).toEqual(['Budi']);
    expect(await names('role=PROJECT_MANAGER')).toEqual(['Citra Dewi']);
    expect(await names('isActive=false')).toEqual(['Budi']);
    expect(await names('isActive=true')).toEqual(['Admin', 'Citra Dewi']);
    expect(await names('search=%25')).toEqual([]);
    expect(await names('search=_')).toEqual([]);
  });

  it('pages through results and reports the total of all matches', async () => {
    const admin = await asAdmin(ctx);
    for (const name of ['B', 'C', 'D']) await createUser(ctx.prisma, { name });

    const res = await call(ctx, admin, 'get', `${USERS}?page=2&pageSize=2`).expect(200);

    expect(res.body.data.map((u: { name: string }) => u.name)).toEqual(['C', 'D']);
    expect(res.body.meta).toEqual({ page: 2, pageSize: 2, total: 4 });
  });

  it('keeps a stable order across pages for users with the same name', async () => {
    const admin = await asAdmin(ctx);
    for (let i = 0; i < 4; i += 1) await createUser(ctx.prisma, { name: 'Kembar' });

    const ids: string[] = [];
    for (const page of [1, 2, 3, 4, 5]) {
      const res = await call(ctx, admin, 'get', `${USERS}?page=${page}&pageSize=1`).expect(200);
      ids.push(res.body.data[0].id);
    }
    const again = await call(ctx, admin, 'get', `${USERS}?pageSize=5`).expect(200);

    expect(new Set(ids).size).toBe(5);
    expect(again.body.data.map((u: { id: string }) => u.id)).toEqual(ids);
  });

  it.each(['pageSize=1000', 'pageSize=0', 'page=0', 'page=abc', 'page=100000000000', 'role=OWNER', 'isActive=maybe'])(
    'rejects the query %s',
    async (query) => {
      const admin = await asAdmin(ctx);
      await call(ctx, admin, 'get', `${USERS}?${query}`).expect(400);
    },
  );
});

describe('GET /users/:id', () => {
  const ctx = setupE2e();

  it('returns one user', async () => {
    const admin = await asAdmin(ctx);
    const res = await call(ctx, admin, 'get', `${USERS}/${admin.user.id}`).expect(200);
    expect(res.body).toMatchObject({ id: admin.user.id, email: 'admin@example.com' });
  });

  it('answers 400 for a malformed id and 404 for an unknown one', async () => {
    const admin = await asAdmin(ctx);
    await call(ctx, admin, 'get', `${USERS}/bukan-uuid`).expect(400);
    const res = await call(ctx, admin, 'get', `${USERS}/${randomUUID()}`).expect(404);
    expect(res.body).toEqual({ statusCode: 404, message: 'Pengguna tidak ditemukan' });
  });
});

describe('PATCH /users/:id', () => {
  const ctx = setupE2e();

  it('updates a user and records before and after', async () => {
    const admin = await asAdmin(ctx);
    const user = await createUser(ctx.prisma, { name: 'Lama', email: 'lama@example.com' });

    const res = await call(ctx, admin, 'patch', `${USERS}/${user.id}`)
      .send({ name: 'Baru', email: ' Baru@Example.com ', role: 'PROJECT_MANAGER' })
      .expect(200);

    expect(res.body).toMatchObject({ name: 'Baru', email: 'baru@example.com', role: 'PROJECT_MANAGER' });
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'UPDATE' } });
    expect(row).toMatchObject({ user_id: admin.user.id, entity_id: user.id });
    expect(row.before).toMatchObject({ name: 'Lama', email: 'lama@example.com', role: 'STAFF' });
    expect(row.after).toMatchObject({ name: 'Baru', email: 'baru@example.com', role: 'PROJECT_MANAGER' });
    expect(JSON.stringify(row)).not.toMatch(/password_hash|argon2/);
  });

  it.each([
    ['deactivation', { isActive: false }, 401],
    ['a role change', { role: 'PROJECT_MANAGER' }, 401],
    ['a rename', { name: 'Nama Baru' }, 200],
  ])('ends the sessions of the user on %s only when access changes', async (_label, body, status) => {
    const admin = await asAdmin(ctx);
    const target = await loginAs(ctx);

    await call(ctx, admin, 'patch', `${USERS}/${target.user.id}`).send(body).expect(200);

    await api(ctx).post(REFRESH).set('Cookie', target.cookie).expect(status);
  });

  it('lets an admin deactivate and reactivate another admin', async () => {
    const admin = await asAdmin(ctx);
    const other = await createUser(ctx.prisma, { role: 'SUPER_ADMIN' });

    await call(ctx, admin, 'patch', `${USERS}/${other.id}`).send({ isActive: false }).expect(200);
    const res = await call(ctx, admin, 'patch', `${USERS}/${other.id}`)
      .send({ isActive: true })
      .expect(200);

    expect(res.body.isActive).toBe(true);
  });

  it.each([
    ['deactivate themselves', { isActive: false }],
    ['change their own role', { role: 'STAFF' }],
  ])('does not let an admin %s', async (_label, body) => {
    const admin = await asAdmin(ctx);
    await createUser(ctx.prisma, { role: 'SUPER_ADMIN' });

    const res = await call(ctx, admin, 'patch', `${USERS}/${admin.user.id}`).send(body).expect(400);

    expect(res.body.message).toBe('Tidak bisa menonaktifkan atau mengubah peran akun sendiri');
    const unchanged = await ctx.prisma.user.findUniqueOrThrow({ where: { id: admin.user.id } });
    expect(unchanged).toMatchObject({ is_active: true, role: 'SUPER_ADMIN' });
  });

  it('lets an admin change their own name', async () => {
    const admin = await asAdmin(ctx);
    await call(ctx, admin, 'patch', `${USERS}/${admin.user.id}`).send({ name: 'Admin Baru' }).expect(200);
  });

  it('never removes the last active SUPER_ADMIN, whoever asks', async () => {
    const onlyAdmin = await createUser(ctx.prisma, { role: 'SUPER_ADMIN' });
    const actor = toAuthUser(await createUser(ctx.prisma, { role: 'SUPER_ADMIN', isActive: false }));
    const users = ctx.app.get(UsersService);

    for (const change of [{ isActive: false }, { role: 'STAFF' as const }]) {
      await expect(users.update(actor, onlyAdmin.id, change, null)).rejects.toThrow(
        'Harus ada minimal satu SUPER_ADMIN aktif',
      );
    }
  });

  it.each([{ name: null }, { email: null }, { role: null }, { isActive: null }])(
    'rejects the explicit null in %j with a field error',
    async (body) => {
      const admin = await asAdmin(ctx);
      const user = await createUser(ctx.prisma);

      const res = await call(ctx, admin, 'patch', `${USERS}/${user.id}`).send(body).expect(400);

      expect(errorFields(res.body)).toEqual(Object.keys(body));
    },
  );

  it('keeps one active SUPER_ADMIN when two admins remove each other at the same moment', async () => {
    const first = await createUser(ctx.prisma, { role: 'SUPER_ADMIN' });
    const second = await createUser(ctx.prisma, { role: 'SUPER_ADMIN' });
    const users = ctx.app.get(UsersService);

    const results = await Promise.allSettled([
      users.update(toAuthUser(first), second.id, { role: 'STAFF' }, null),
      users.update(toAuthUser(second), first.id, { isActive: false }, null),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await ctx.prisma.user.count({ where: { role: 'SUPER_ADMIN', is_active: true } })).toBe(1);
  });

  it('rejects a duplicate email, an empty body value and an unknown user', async () => {
    const admin = await asAdmin(ctx);
    const user = await createUser(ctx.prisma, { email: 'a@example.com' });

    await call(ctx, admin, 'patch', `${USERS}/${user.id}`).send({ email: 'ADMIN@example.com' }).expect(409);
    await call(ctx, admin, 'patch', `${USERS}/${user.id}`).send({ name: '' }).expect(400);
    await call(ctx, admin, 'patch', `${USERS}/${user.id}`).send({ password: 'password-123' }).expect(400);
    await call(ctx, admin, 'patch', `${USERS}/${randomUUID()}`).send({ name: 'X' }).expect(404);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'UPDATE' } })).toBe(0);
  });
});

describe('POST /users/:id/reset-password', () => {
  const ctx = setupE2e();

  it('sets a temporary password, forces a change and ends the sessions', async () => {
    const admin = await asAdmin(ctx);
    const target = await loginAs(ctx);

    const res = await call(ctx, admin, 'post', `${USERS}/${target.user.id}/reset-password`)
      .send({ newPassword: 'sementara-789' })
      .expect(200);

    expect(res.body).toMatchObject({ id: target.user.id, mustChangePassword: true });
    await api(ctx).post(REFRESH).set('Cookie', target.cookie).expect(401);
    await api(ctx)
      .post(LOGIN)
      .send({ email: target.user.email, password: DEFAULT_PASSWORD })
      .expect(401);
    await login(ctx, target.user.email, 'sementara-789');

    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'RESET_PASSWORD' } });
    expect(row).toMatchObject({ user_id: admin.user.id, entity_id: target.user.id });
    expect(JSON.stringify(row)).not.toMatch(/sementara-789|password_hash|argon2/);
  });

  it('rejects a short password and an unknown user', async () => {
    const admin = await asAdmin(ctx);
    const user = await createUser(ctx.prisma);

    await call(ctx, admin, 'post', `${USERS}/${user.id}/reset-password`)
      .send({ newPassword: 'pendek' })
      .expect(400);
    await call(ctx, admin, 'post', `${USERS}/${randomUUID()}/reset-password`)
      .send({ newPassword: 'sementara-789' })
      .expect(404);
  });
});
