import { randomUUID } from 'node:crypto';
import { setupE2e } from './e2e-context.js';
import {
  adminOnly,
  asAdmin,
  call,
  createCategory,
  errorFields,
  expectAccess,
  loginAs,
} from './fixtures.js';
import { CATEGORIES } from './routes.js';

const NEW_CATEGORY = { name: 'Material', type: 'OUT' };

type Named = { name: string };

describe('categories: access', () => {
  const ctx = setupE2e();

  it('lets every role read categories but only SUPER_ADMIN change them', async () => {
    const category = await createCategory(ctx.prisma);

    await expectAccess(
      ctx,
      { method: 'get', path: CATEGORIES },
      { SUPER_ADMIN: 200, PROJECT_MANAGER: 200, STAFF: 200 },
    );
    await expectAccess(ctx, { method: 'post', path: CATEGORIES, body: NEW_CATEGORY }, adminOnly(201));
    await expectAccess(
      ctx,
      { method: 'patch', path: `${CATEGORIES}/${category.id}`, body: { name: 'Lain' } },
      adminOnly(),
    );
  });
});

describe('GET /categories', () => {
  const ctx = setupE2e();

  it('returns a plain list ordered by type then name, filterable by type', async () => {
    const admin = await asAdmin(ctx);
    await createCategory(ctx.prisma, { name: 'Upah Tukang', type: 'OUT' });
    await createCategory(ctx.prisma, { name: 'Termin Proyek', type: 'IN' });
    await createCategory(ctx.prisma, { name: 'Material', type: 'OUT' });
    await createCategory(ctx.prisma, { name: 'DP Proyek', type: 'IN' });

    const all = await call(ctx, admin, 'get', CATEGORIES).expect(200);
    expect(all.body.map((c: Named) => c.name)).toEqual([
      'DP Proyek',
      'Termin Proyek',
      'Material',
      'Upah Tukang',
    ]);
    expect(all.body[0]).toEqual({
      id: expect.any(String),
      name: 'DP Proyek',
      type: 'IN',
      isSystem: false,
      isActive: true,
    });

    const income = await call(ctx, admin, 'get', `${CATEGORIES}?type=IN`).expect(200);
    expect(income.body.map((c: Named) => c.name)).toEqual(['DP Proyek', 'Termin Proyek']);
    await call(ctx, admin, 'get', `${CATEGORIES}?type=TRANSFER`).expect(400);
  });

  it('shows inactive categories to SUPER_ADMIN only, whatever others ask for', async () => {
    await createCategory(ctx.prisma, { name: 'Aktif' });
    await createCategory(ctx.prisma, { name: 'Lama', isActive: false });
    const admin = await asAdmin(ctx);
    const staff = await loginAs(ctx, { role: 'STAFF' });
    const manager = await loginAs(ctx, { role: 'PROJECT_MANAGER' });

    const names = async (session: typeof admin, query = '') => {
      const res = await call(ctx, session, 'get', `${CATEGORIES}?${query}`).expect(200);
      return res.body.map((c: Named) => c.name);
    };

    expect(await names(admin)).toEqual(['Aktif', 'Lama']);
    expect(await names(admin, 'isActive=false')).toEqual(['Lama']);
    expect(await names(admin, 'isActive=true')).toEqual(['Aktif']);
    for (const session of [staff, manager]) {
      expect(await names(session)).toEqual(['Aktif']);
      expect(await names(session, 'isActive=false')).toEqual(['Aktif']);
    }
  });
});

describe('POST /categories', () => {
  const ctx = setupE2e();

  it('creates an ordinary, active category and records it', async () => {
    const admin = await asAdmin(ctx);

    const res = await call(ctx, admin, 'post', CATEGORIES)
      .send({ name: '  Material  ', type: 'OUT' })
      .expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Material',
      type: 'OUT',
      isSystem: false,
      isActive: true,
    });
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity_type: 'category' } });
    expect(row).toMatchObject({ action: 'CREATE', user_id: admin.user.id, entity_id: res.body.id });
  });

  it('refuses the same name within a type, in any case, but allows it in the other type', async () => {
    const admin = await asAdmin(ctx);
    await call(ctx, admin, 'post', CATEGORIES).send(NEW_CATEGORY).expect(201);

    const res = await call(ctx, admin, 'post', CATEGORIES)
      .send({ name: 'MATERIAL', type: 'OUT' })
      .expect(409);
    expect(res.body).toEqual({ statusCode: 409, message: 'Kategori sudah ada' });

    await call(ctx, admin, 'post', CATEGORIES).send({ name: 'Material', type: 'IN' }).expect(201);
  });

  it.each([
    ['an unknown type', { type: 'TRANSFER' }, 'type'],
    ['a blank name', { name: ' ' }, 'name'],
    ['an attempt to create a system category', { isSystem: true }, 'isSystem'],
  ])('rejects %s', async (_label, override, field) => {
    const admin = await asAdmin(ctx);
    const res = await call(ctx, admin, 'post', CATEGORIES)
      .send({ ...NEW_CATEGORY, ...override })
      .expect(400);
    expect(errorFields(res.body)).toContain(field);
  });
});

describe('PATCH /categories/:id', () => {
  const ctx = setupE2e();

  it('renames and deactivates a category, recording before and after', async () => {
    const admin = await asAdmin(ctx);
    const category = await createCategory(ctx.prisma, { name: 'Lama' });

    const res = await call(ctx, admin, 'patch', `${CATEGORIES}/${category.id}`)
      .send({ name: 'Baru', isActive: false })
      .expect(200);

    expect(res.body).toMatchObject({ name: 'Baru', isActive: false });
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'UPDATE' } });
    expect(row.before).toMatchObject({ name: 'Lama', is_active: true });
    expect(row.after).toMatchObject({ name: 'Baru', is_active: false });
  });

  it('never changes the type of a category', async () => {
    const admin = await asAdmin(ctx);
    const category = await createCategory(ctx.prisma, { type: 'OUT' });

    const res = await call(ctx, admin, 'patch', `${CATEGORIES}/${category.id}`)
      .send({ type: 'IN' })
      .expect(400);

    expect(errorFields(res.body)).toEqual(['type']);
  });

  it('refuses a rename that collides with another category of the same type', async () => {
    const admin = await asAdmin(ctx);
    const first = await createCategory(ctx.prisma, { name: 'Material', type: 'OUT' });
    await createCategory(ctx.prisma, { name: 'Peralatan', type: 'OUT' });
    await createCategory(ctx.prisma, { name: 'Pendapatan Lain', type: 'IN' });

    await call(ctx, admin, 'patch', `${CATEGORIES}/${first.id}`).send({ name: 'peralatan' }).expect(409);
    await call(ctx, admin, 'patch', `${CATEGORIES}/${first.id}`).send({ name: 'MATERIAL' }).expect(200);
    await call(ctx, admin, 'patch', `${CATEGORIES}/${first.id}`)
      .send({ name: 'Pendapatan Lain' })
      .expect(200);
  });

  it.each([{ name: 'Nama Lain' }, { isActive: false }])(
    'leaves a system category untouched when asked for %j',
    async (body) => {
      const admin = await asAdmin(ctx);
      const system = await createCategory(ctx.prisma, { name: 'Transfer Masuk', type: 'IN', isSystem: true });

      const res = await call(ctx, admin, 'patch', `${CATEGORIES}/${system.id}`).send(body).expect(400);

      expect(res.body).toEqual({ statusCode: 400, message: 'Kategori sistem tidak bisa diubah' });
      expect(await ctx.prisma.category.findUniqueOrThrow({ where: { id: system.id } })).toEqual(system);
      expect(await ctx.prisma.auditLog.count({ where: { entity_type: 'category' } })).toBe(0);
    },
  );

  it('rejects null and answers 404 for an unknown id', async () => {
    const admin = await asAdmin(ctx);
    const category = await createCategory(ctx.prisma);

    await call(ctx, admin, 'patch', `${CATEGORIES}/${category.id}`).send({ name: null }).expect(400);
    const res = await call(ctx, admin, 'patch', `${CATEGORIES}/${randomUUID()}`)
      .send({ name: 'X' })
      .expect(404);
    expect(res.body).toEqual({ statusCode: 404, message: 'Kategori tidak ditemukan' });
  });
});
