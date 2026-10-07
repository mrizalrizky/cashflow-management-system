import { randomUUID } from 'node:crypto';
import { SAMPLE_FILES } from '../src/attachments/testing/sample-files.js';
import type { AuditLogResponse } from '../src/audit/audit-log.mapper.js';
import { E2eContext, setupE2e } from './e2e-context.js';
import { adminOnly, asAdmin, call, errorFields, expectAccess, TestSession } from './fixtures.js';
import { ACCOUNTS, AUDIT_LOGS, CHANGE_PASSWORD, USERS } from './routes.js';
import { expenseBody, record, setupWorld, transactionUrl, World } from './transaction-fixtures.js';

const SECRET_KEYS = ['password', 'password_hash', 'passwordHash', 'token', 'token_hash', 'storage_key', 'storageKey'];

async function logs(ctx: E2eContext, admin: TestSession, query = ''): Promise<AuditLogResponse[]> {
  const res = await call(ctx, admin, 'get', `${AUDIT_LOGS}?pageSize=100${query}`).expect(200);
  return res.body.data as AuditLogResponse[];
}

/** Semua kunci objek di kedalaman berapa pun. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
}

/** Staf mencatat pengeluaran berbukti di proyek A, lalu admin menyetujuinya. */
async function approvedExpense(ctx: E2eContext, world: World): Promise<string> {
  const tx = await record(ctx, world.staff, expenseBody(world, { projectId: world.projectA.id }));
  await call(ctx, world.staff, 'post', transactionUrl(tx.id, 'attachments'))
    .attach('file', SAMPLE_FILES.pdf, 'nota.pdf')
    .expect(201);
  await call(ctx, world.admin, 'post', transactionUrl(tx.id, 'approve')).expect(200);
  return tx.id;
}

function entry(ctx: E2eContext, marker: string, createdAt: string, userId: string | null = null) {
  return ctx.prisma.auditLog.create({
    data: { action: 'CREATE', entity_type: marker, entity_id: randomUUID(), user_id: userId, created_at: new Date(createdAt) },
  });
}

describe('GET /audit-logs', () => {
  const ctx = setupE2e();

  it('is for the admin only', async () => {
    await expectAccess(ctx, { method: 'get', path: AUDIT_LOGS }, adminOnly());
  });

  it('cannot be written to', async () => {
    const admin = await asAdmin(ctx);
    const row = await entry(ctx, 'penanda', '2026-10-06T03:00:00.000Z');

    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      await call(ctx, admin, method, AUDIT_LOGS).send({}).expect(404);
      await call(ctx, admin, method, `${AUDIT_LOGS}/${row.id}`).send({}).expect(404);
    }
    expect(await ctx.prisma.auditLog.count({ where: { id: row.id } })).toBe(1);
  });

  it('lists entries newest first, with who did what to which record', async () => {
    const world = await setupWorld(ctx);
    const id = await approvedExpense(ctx, world);

    const all = await logs(ctx, world.admin);

    expect(all[0]).toEqual({
      id: expect.any(String),
      action: 'APPROVE',
      entityType: 'transaction',
      entityId: id,
      user: { id: world.admin.user.id, name: world.admin.user.name },
      before: expect.objectContaining({ status: 'PENDING', amount: '150000' }),
      after: expect.objectContaining({ status: 'APPROVED' }),
      ip: expect.any(String),
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
    const times = all.map((row) => row.createdAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(all.map((row) => row.action)).toEqual(expect.arrayContaining(['LOGIN', 'CREATE', 'ATTACH', 'APPROVE']));
  });

  it('shows an entry nobody is attached to, such as a failed login', async () => {
    const admin = await asAdmin(ctx);
    await entry(ctx, 'penanda', '2026-10-06T03:00:00.000Z');

    const [row] = await logs(ctx, admin, '&entityType=penanda');

    expect(row).toMatchObject({ user: null, before: null, after: null, ip: null });
  });

  it('filters by record, user and action, alone and together', async () => {
    const world = await setupWorld(ctx);
    const id = await approvedExpense(ctx, world);
    await call(ctx, world.admin, 'post', ACCOUNTS).send({ name: 'Kas Baru', type: 'CASH' }).expect(201);

    const history = await logs(ctx, world.admin, `&entityType=transaction&entityId=${id}`);
    expect(history.map((row) => row.action)).toEqual(['APPROVE', 'ATTACH', 'CREATE']);

    const byStaff = await logs(ctx, world.admin, `&userId=${world.staff.user.id}`);
    expect(byStaff.length).toBeGreaterThan(0);
    expect(new Set(byStaff.map((row) => row.user?.id))).toEqual(new Set([world.staff.user.id]));

    const approvals = await logs(ctx, world.admin, '&action=APPROVE');
    expect(approvals.map((row) => row.entityId)).toEqual([id]);

    const accounts = await logs(ctx, world.admin, '&entityType=account');
    expect(accounts.map((row) => [row.action, (row.after as { name: string }).name])).toEqual([['CREATE', 'Kas Baru']]);

    expect(await logs(ctx, world.admin, `&entityType=transaction&action=CREATE&userId=${world.admin.user.id}`)).toEqual([]);
  });

  it('filters by Jakarta calendar days, both ends included', async () => {
    const admin = await asAdmin(ctx);
    // 23:59:59 tanggal 5, 23:30 tanggal 6, dan 00:00 tanggal 7, semuanya waktu Jakarta (UTC+7).
    const fifth = await entry(ctx, 'penanda', '2026-10-05T16:59:59.000Z');
    const sixth = await entry(ctx, 'penanda', '2026-10-06T16:30:00.000Z');
    const seventh = await entry(ctx, 'penanda', '2026-10-06T17:00:00.000Z');
    const ids = async (query: string) => (await logs(ctx, admin, `&entityType=penanda${query}`)).map((row) => row.id);

    expect(await ids('&dateFrom=2026-10-06&dateTo=2026-10-06')).toEqual([sixth.id]);
    expect(await ids('&dateTo=2026-10-06')).toEqual([sixth.id, fifth.id]);
    expect(await ids('&dateFrom=2026-10-06')).toEqual([seventh.id, sixth.id]);
    expect(await ids('&dateFrom=2026-10-05&dateTo=2026-10-07')).toEqual([seventh.id, sixth.id, fifth.id]);
  });

  it('pages through the entries', async () => {
    const admin = await asAdmin(ctx);
    for (let i = 0; i < 5; i += 1) await entry(ctx, 'penanda', `2026-10-06T03:00:0${i}.000Z`);

    const res = await call(ctx, admin, 'get', `${AUDIT_LOGS}?entityType=penanda&page=2&pageSize=2`).expect(200);

    expect(res.body.meta).toEqual({ page: 2, pageSize: 2, total: 5 });
    expect(res.body.data.map((row: AuditLogResponse) => row.createdAt)).toEqual([
      '2026-10-06T03:00:02.000Z',
      '2026-10-06T03:00:01.000Z',
    ]);
  });

  it('never shows a password, a token or where a file is stored', async () => {
    const world = await setupWorld(ctx);
    await approvedExpense(ctx, world);
    await call(ctx, world.staff, 'post', CHANGE_PASSWORD)
      .send({ currentPassword: 'password-123', newPassword: 'password-baru-456' })
      .expect(200);
    await call(ctx, world.admin, 'post', `${USERS}/${world.otherStaff.user.id}/reset-password`)
      .send({ newPassword: 'sementara-789' })
      .expect(200);

    const all = await logs(ctx, world.admin);

    expect(all.map((row) => row.action)).toEqual(
      expect.arrayContaining(['LOGIN', 'CHANGE_PASSWORD', 'RESET_PASSWORD', 'ATTACH']),
    );
    const keys = new Set(keysOf(all));
    for (const secret of SECRET_KEYS) expect(keys.has(secret)).toBe(false);
    const text = JSON.stringify(all);
    expect(text).not.toContain('password-baru-456');
    expect(text).not.toContain('sementara-789');
    expect(text).not.toContain('$argon2');
  });

  it.each([
    ['a user id that is not an id', 'userId=abc', 'userId'],
    ['a date that does not exist', 'dateFrom=2026-13-01', 'dateFrom'],
    ['a range that runs backwards', 'dateFrom=2026-10-07&dateTo=2026-10-06', 'dateFrom'],
    ['a page size over the limit', 'pageSize=1000', 'pageSize'],
    ['an action that is not a word', 'action=DROP%20TABLE', 'action'],
    ['an unknown parameter', 'hapus=1', 'hapus'],
  ])('refuses %s', async (_label, query, field) => {
    const res = await call(ctx, await asAdmin(ctx), 'get', `${AUDIT_LOGS}?${query}`).expect(400);

    expect(errorFields(res.body)).toEqual([field]);
  });
});
