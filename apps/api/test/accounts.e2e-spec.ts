import { randomUUID } from 'node:crypto';
import { setupE2e } from './e2e-context.js';
import {
  adminOnly,
  asAdmin,
  call,
  createAccount,
  createCategory,
  createTransaction,
  errorFields,
  expectAccess,
} from './fixtures.js';
import { ACCOUNT_OPTIONS, ACCOUNTS } from './routes.js';

const NEW_ACCOUNT = { name: 'Kas Proyek', type: 'CASH', openingBalance: '1000000' };

describe('accounts: access', () => {
  const ctx = setupE2e();

  it('limits the account list and changes to SUPER_ADMIN', async () => {
    const account = await createAccount(ctx.prisma);

    await expectAccess(ctx, { method: 'get', path: ACCOUNTS }, adminOnly());
    await expectAccess(ctx, { method: 'post', path: ACCOUNTS, body: NEW_ACCOUNT }, adminOnly(201));
    await expectAccess(
      ctx,
      { method: 'patch', path: `${ACCOUNTS}/${account.id}`, body: { name: 'Lain' } },
      adminOnly(),
    );
  });

  it('lets every role read the account options, which never include a balance', async () => {
    await createAccount(ctx.prisma, { name: 'Kas Kecil', type: 'CASH', openingBalance: 500000n });
    await createAccount(ctx.prisma, { name: 'Tidak Dipakai', isActive: false });

    await expectAccess(
      ctx,
      { method: 'get', path: ACCOUNT_OPTIONS },
      { SUPER_ADMIN: 200, PROJECT_MANAGER: 200, STAFF: 200 },
    );
    const res = await call(ctx, await asAdmin(ctx), 'get', ACCOUNT_OPTIONS).expect(200);

    expect(res.body).toEqual([{ id: expect.any(String), name: 'Kas Kecil', type: 'CASH' }]);
  });
});

describe('POST /accounts', () => {
  const ctx = setupE2e();

  it('creates an account whose balance starts at the opening balance', async () => {
    const admin = await asAdmin(ctx);

    const res = await call(ctx, admin, 'post', ACCOUNTS)
      .send({ ...NEW_ACCOUNT, name: '  Kas Proyek  ' })
      .expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Kas Proyek',
      type: 'CASH',
      openingBalance: '1000000',
      balance: '1000000',
      isActive: true,
      createdAt: expect.any(String),
    });
  });

  it('defaults the opening balance to zero', async () => {
    const admin = await asAdmin(ctx);
    const res = await call(ctx, admin, 'post', ACCOUNTS)
      .send({ name: 'Bank Baru', type: 'BANK' })
      .expect(201);
    expect(res.body).toMatchObject({ openingBalance: '0', balance: '0' });
  });

  it.each(['9007199254740993', '-500000', '000123'])(
    'stores the opening balance %j exactly',
    async (openingBalance) => {
      const admin = await asAdmin(ctx);
      const res = await call(ctx, admin, 'post', ACCOUNTS)
        .send({ ...NEW_ACCOUNT, openingBalance })
        .expect(201);
      expect(res.body.openingBalance).toBe(BigInt(openingBalance).toString());
    },
  );

  it.each([
    ['thousand separators', { openingBalance: '1.250.000' }, 'openingBalance'],
    ['a JSON number', { openingBalance: 1250000 }, 'openingBalance'],
    ['a decimal', { openingBalance: '12.5' }, 'openingBalance'],
    ['an unknown type', { type: 'EWALLET' }, 'type'],
    ['a blank name', { name: '   ' }, 'name'],
    ['an unknown property', { balance: '5' }, 'balance'],
  ])('rejects %s', async (_label, override, field) => {
    const admin = await asAdmin(ctx);
    const res = await call(ctx, admin, 'post', ACCOUNTS)
      .send({ ...NEW_ACCOUNT, ...override })
      .expect(400);
    expect(errorFields(res.body)).toContain(field);
    expect(await ctx.prisma.account.count()).toBe(0);
  });

  it('rejects a name that is already used, in any case, and records nothing', async () => {
    const admin = await asAdmin(ctx);
    await call(ctx, admin, 'post', ACCOUNTS).send(NEW_ACCOUNT).expect(201);

    const res = await call(ctx, admin, 'post', ACCOUNTS)
      .send({ ...NEW_ACCOUNT, name: 'KAS PROYEK' })
      .expect(409);

    expect(res.body).toEqual({ statusCode: 409, message: 'Nama akun sudah dipakai' });
    expect(await ctx.prisma.auditLog.count({ where: { entity_type: 'account' } })).toBe(1);
  });

  it('does not treat _ and % in a name as wildcards when checking for duplicates', async () => {
    const admin = await asAdmin(ctx);
    await call(ctx, admin, 'post', ACCOUNTS).send({ ...NEW_ACCOUNT, name: 'Kas A1' }).expect(201);
    await call(ctx, admin, 'post', ACCOUNTS).send({ ...NEW_ACCOUNT, name: 'Kas A_' }).expect(201);
    await call(ctx, admin, 'post', ACCOUNTS).send({ ...NEW_ACCOUNT, name: 'Kas %' }).expect(201);
  });

  it('records the creation with the money as a string', async () => {
    const admin = await asAdmin(ctx);
    const res = await call(ctx, admin, 'post', ACCOUNTS).send(NEW_ACCOUNT).expect(201);

    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity_type: 'account' } });
    expect(row).toMatchObject({ action: 'CREATE', user_id: admin.user.id, entity_id: res.body.id });
    expect(row.after).toMatchObject({ name: 'Kas Proyek', opening_balance: '1000000' });
  });
});

describe('GET /accounts', () => {
  const ctx = setupE2e();

  it('counts only approved transactions of that account towards its balance', async () => {
    const admin = await asAdmin(ctx);
    const account = await createAccount(ctx.prisma, { name: 'Utama', openingBalance: 1_000_000n });
    const other = await createAccount(ctx.prisma, { name: 'Lain', openingBalance: 50n });
    const untouched = await createAccount(ctx.prisma, { name: 'Kosong', openingBalance: -700n });
    const category = await createCategory(ctx.prisma);
    const base = { categoryId: category.id, createdById: admin.user.id };
    const onAccount = { ...base, accountId: account.id };

    await createTransaction(ctx.prisma, { ...onAccount, type: 'IN', amount: 500_000n });
    await createTransaction(ctx.prisma, { ...onAccount, type: 'OUT', amount: 200_000n });
    await createTransaction(ctx.prisma, { ...onAccount, type: 'OUT', amount: 9n, status: 'PENDING' });
    await createTransaction(ctx.prisma, { ...onAccount, type: 'IN', amount: 9n, status: 'REJECTED' });
    await createTransaction(ctx.prisma, { ...onAccount, type: 'OUT', amount: 9n, status: 'VOID' });
    await createTransaction(ctx.prisma, { ...base, accountId: other.id, type: 'OUT', amount: 80n });

    const res = await call(ctx, admin, 'get', ACCOUNTS).expect(200);

    const balances = Object.fromEntries(
      res.body.data.map((a: { id: string; balance: string }) => [a.id, a.balance]),
    );
    expect(balances).toEqual({
      [account.id]: '1300000',
      [other.id]: '-30',
      [untouched.id]: '-700',
    });
  });

  it('orders by name and supports search, type and status filters with paging', async () => {
    const admin = await asAdmin(ctx);
    await createAccount(ctx.prisma, { name: 'Rekening BCA', type: 'BANK' });
    await createAccount(ctx.prisma, { name: 'Kas Kecil', type: 'CASH' });
    await createAccount(ctx.prisma, { name: 'Kas Lama', type: 'CASH', isActive: false });

    const names = async (query = '') => {
      const res = await call(ctx, admin, 'get', `${ACCOUNTS}?${query}`).expect(200);
      return res.body.data.map((a: { name: string }) => a.name);
    };

    expect(await names()).toEqual(['Kas Kecil', 'Kas Lama', 'Rekening BCA']);
    expect(await names('search=kas')).toEqual(['Kas Kecil', 'Kas Lama']);
    expect(await names('type=BANK')).toEqual(['Rekening BCA']);
    expect(await names('isActive=false')).toEqual(['Kas Lama']);

    const page = await call(ctx, admin, 'get', `${ACCOUNTS}?page=2&pageSize=2`).expect(200);
    expect(page.body.data.map((a: { name: string }) => a.name)).toEqual(['Rekening BCA']);
    expect(page.body.meta).toEqual({ page: 2, pageSize: 2, total: 3 });
  });
});

describe('PATCH /accounts/:id', () => {
  const ctx = setupE2e();

  it('updates the account and records before and after', async () => {
    const admin = await asAdmin(ctx);
    const account = await createAccount(ctx.prisma, { name: 'Lama', type: 'CASH', openingBalance: 10n });

    const res = await call(ctx, admin, 'patch', `${ACCOUNTS}/${account.id}`)
      .send({ name: 'Baru', type: 'BANK', openingBalance: '25', isActive: false })
      .expect(200);

    expect(res.body).toMatchObject({
      name: 'Baru',
      type: 'BANK',
      openingBalance: '25',
      balance: '25',
      isActive: false,
    });
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'UPDATE' } });
    expect(row.before).toMatchObject({ name: 'Lama', opening_balance: '10', is_active: true });
    expect(row.after).toMatchObject({ name: 'Baru', opening_balance: '25', is_active: false });
  });

  it('lets an account keep its own name in a different case, but not take another one', async () => {
    const admin = await asAdmin(ctx);
    const first = await createAccount(ctx.prisma, { name: 'Kas Kecil' });
    await createAccount(ctx.prisma, { name: 'Bank Utama' });

    await call(ctx, admin, 'patch', `${ACCOUNTS}/${first.id}`).send({ name: 'KAS KECIL' }).expect(200);
    await call(ctx, admin, 'patch', `${ACCOUNTS}/${first.id}`).send({ name: 'bank utama' }).expect(409);
  });

  it('rejects null, a malformed id and an unknown id', async () => {
    const admin = await asAdmin(ctx);
    const account = await createAccount(ctx.prisma);

    await call(ctx, admin, 'patch', `${ACCOUNTS}/${account.id}`).send({ name: null }).expect(400);
    await call(ctx, admin, 'patch', `${ACCOUNTS}/${account.id}`).send({ openingBalance: null }).expect(400);
    await call(ctx, admin, 'patch', `${ACCOUNTS}/bukan-uuid`).send({ name: 'X' }).expect(400);
    const res = await call(ctx, admin, 'patch', `${ACCOUNTS}/${randomUUID()}`).send({ name: 'X' }).expect(404);
    expect(res.body).toEqual({ statusCode: 404, message: 'Akun tidak ditemukan' });
  });
});
