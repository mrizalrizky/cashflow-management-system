import { randomUUID } from 'node:crypto';
import { SAMPLE_FILES } from '../src/attachments/testing/sample-files.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { EXPORT_BATCH_SIZE } from '../src/transactions/transaction-export.service.js';
import { api, E2eContext, setupE2e } from './e2e-context.js';
import { call, createAccount, createTransaction, errorFields, TestSession } from './fixtures.js';
import { TRANSACTION_EXPORT, TRANSACTIONS } from './routes.js';
import { expenseBody, incomeBody, record, setupWorld, transactionUrl, World } from './transaction-fixtures.js';

const HEADER = [
  'Tanggal',
  'Tipe',
  'Jumlah',
  'Keterangan',
  'Akun',
  'Kategori',
  'Kode Proyek',
  'Proyek',
  'Status',
  'Transfer',
  'Dicatat oleh',
  'Ditinjau oleh',
  'Alasan penolakan',
  'Alasan pembatalan',
  'Jumlah bukti',
  'Dicatat pada',
];
const DESCRIPTION = HEADER.indexOf('Keterangan');

/** Pembaca CSV sederhana tetapi lengkap: pemisah `;`, kutip ganda, dan ganti baris di dalam kutip. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ';') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else cell += char;
  }
  return rows;
}

async function download(ctx: E2eContext, session: TestSession, query = '') {
  const res = await call(ctx, session, 'get', `${TRANSACTION_EXPORT}${query}`)
    .buffer(true)
    .parse((response, done) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => done(null, Buffer.concat(chunks)));
    })
    .expect(200);
  const bytes = res.body as Buffer;
  const [header, ...rows] = parseCsv(bytes.toString('utf8').replace(/^﻿/, ''));
  return { res, bytes, header, rows };
}

async function exported(ctx: E2eContext, session: TestSession, query = ''): Promise<string[]> {
  return (await download(ctx, session, query)).rows.map((row) => row[DESCRIPTION]!);
}

async function listed(ctx: E2eContext, session: TestSession, query = ''): Promise<{ total: number; names: string[] }> {
  const res = await call(ctx, session, 'get', `${TRANSACTIONS}?pageSize=100${query.replace('?', '&')}`).expect(200);
  return { total: res.body.meta.total, names: res.body.data.map((t: { description: string }) => t.description) };
}

/** Transaksi dengan keterangan yang berbeda-beda, di berbagai proyek, status, tipe dan tanggal. */
async function seedVariety(ctx: E2eContext, world: World): Promise<void> {
  const second = await createAccount(ctx.prisma, { name: 'Bank Uji' });
  await record(ctx, world.staff, expenseBody(world, { description: 'staf A semen', projectId: world.projectA.id }));
  await record(ctx, world.staff, expenseBody(world, { description: 'staf B besi', projectId: world.projectB.id, transactionDate: '2026-09-15' }));
  await record(ctx, world.staff, expenseBody(world, { description: 'staf overhead listrik', accountId: second.id }));
  await record(ctx, world.otherStaff, expenseBody(world, { description: 'staf lain A pasir', projectId: world.projectA.id, transactionDate: '2026-09-20' }));
  await record(ctx, world.manager, incomeBody(world, { description: 'koordinator A termin', projectId: world.projectA.id }));
  const approved = await record(ctx, world.admin, incomeBody(world, { description: 'admin B termin', projectId: world.projectB.id }));
  await call(ctx, world.admin, 'post', transactionUrl(approved.id, 'approve')).expect(200);
  const group = randomUUID();
  for (const type of ['OUT', 'IN'] as const) {
    await createTransaction(ctx.prisma, {
      type,
      amount: 1_000n,
      description: `transfer ${type}`,
      accountId: type === 'OUT' ? world.account.id : second.id,
      categoryId: type === 'OUT' ? world.expense.id : world.income.id,
      createdById: world.admin.user.id,
      transferGroupId: group,
    });
  }
}

describe('GET /transactions/export', () => {
  const ctx = setupE2e();

  it('needs a login, and is open to every role', async () => {
    const world = await setupWorld(ctx);

    await api(ctx).get(TRANSACTION_EXPORT).expect(401);
    for (const session of [world.admin, world.manager, world.staff]) {
      await call(ctx, session, 'get', TRANSACTION_EXPORT).expect(200);
    }
  });

  it('is a UTF-8 CSV download with a header row', async () => {
    const world = await setupWorld(ctx);

    const { res, bytes, header, rows } = await download(ctx, world.admin);

    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="transaksi-\d{8}-\d{4}\.csv"$/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(header).toEqual(HEADER);
    expect(rows).toEqual([]);
  });

  it('writes one row per transaction with everything needed to read it on its own', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.staff, expenseBody(world, { projectId: world.projectA.id }));
    await call(ctx, world.staff, 'post', transactionUrl(tx.id, 'attachments'))
      .attach('file', SAMPLE_FILES.pdf, 'nota.pdf')
      .expect(201);
    await call(ctx, world.manager, 'post', transactionUrl(tx.id, 'reject')).send({ reason: 'Nota buram' }).expect(200);
    await record(ctx, world.admin, incomeBody(world, { transactionDate: '2026-09-30' }));

    const { rows } = await download(ctx, world.admin);

    expect(rows).toHaveLength(2);
    expect(rows[0]!.slice(0, 15)).toEqual([
      '2026-10-01',
      'Keluar',
      '150000',
      'Beli semen',
      'Kas Uji',
      'Material Uji',
      'PRJ-A',
      'Proyek A',
      'Ditolak',
      'Tidak',
      'Staf Satu',
      'Koordinator A',
      'Nota buram',
      '',
      '1',
    ]);
    expect(rows[0]![15]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(rows[1]!.slice(0, 12)).toEqual([
      '2026-09-30',
      'Masuk',
      '500000',
      'Termin pertama',
      'Kas Uji',
      'Termin Uji',
      '',
      '',
      'Menunggu',
      'Tidak',
      'Admin',
      '',
    ]);
  });

  it('writes the recording time in Jakarta, and marks transfers', async () => {
    const world = await setupWorld(ctx);
    await createTransaction(ctx.prisma, {
      type: 'OUT',
      amount: 5n,
      accountId: world.account.id,
      categoryId: world.expense.id,
      createdById: world.admin.user.id,
      createdAt: new Date('2026-10-06T17:30:00.000Z'),
      transferGroupId: randomUUID(),
    });

    const { rows } = await download(ctx, world.admin);

    expect(rows[0]![HEADER.indexOf('Transfer')]).toBe('Ya');
    expect(rows[0]![HEADER.indexOf('Dicatat pada')]).toBe('2026-10-07 00:30');
  });

  it.each([
    '',
    '?status=PENDING',
    '?type=IN',
    '?dateFrom=2026-09-01&dateTo=2026-09-30',
    '?search=termin',
    '?overhead=true',
    '?includeTransfers=false',
    '?type=OUT&status=PENDING&includeTransfers=false',
  ])('gives each role exactly the rows, in the order, of their list for %j', async (query) => {
    const world = await setupWorld(ctx);
    await seedVariety(ctx, world);

    for (const session of [world.admin, world.manager, world.staff, world.otherStaff]) {
      const list = await listed(ctx, session, query);
      const file = await exported(ctx, session, query);

      expect(file).toEqual(list.names);
      expect(file).toHaveLength(list.total);
    }
  });

  it('follows the project and account filters the same way', async () => {
    const world = await setupWorld(ctx);
    await seedVariety(ctx, world);

    for (const query of [`?projectId=${world.projectA.id}`, `?accountId=${world.account.id}`, `?categoryId=${world.income.id}`]) {
      for (const session of [world.admin, world.manager, world.staff]) {
        expect(await exported(ctx, session, query)).toEqual((await listed(ctx, session, query)).names);
      }
    }
  });

  it('never hands over rows that are not the user’s to see', async () => {
    const world = await setupWorld(ctx);
    await seedVariety(ctx, world);

    // Koordinator proyek A: tidak ada proyek B, overhead, atau transfer.
    const manager = await exported(ctx, world.manager);
    expect(manager.sort()).toEqual(['koordinator A termin', 'staf A semen', 'staf lain A pasir']);
    expect(await exported(ctx, world.manager, `?projectId=${world.projectB.id}`)).toEqual([]);
    expect(await exported(ctx, world.manager, '?overhead=true')).toEqual([]);
    expect(await exported(ctx, world.manager, '?search=besi')).toEqual([]);

    // Staf: hanya miliknya sendiri, walau memfilter proyek tempat orang lain mencatat.
    expect((await exported(ctx, world.otherStaff)).sort()).toEqual(['staf lain A pasir']);
    expect(await exported(ctx, world.otherStaff, `?projectId=${world.projectA.id}&search=semen`)).toEqual([]);
    expect(await exported(ctx, world.staff, '?includeTransfers=true&search=transfer')).toEqual([]);
  });

  it('keeps hostile text as text, one row per transaction', async () => {
    const world = await setupWorld(ctx);
    const hostile = [
      '=HYPERLINK("http://x","y")',
      '+62 812',
      '-5 unit',
      '@SUM(A1)',
      'Semen; 10 "sak"',
      'baris satu\nbaris dua',
    ];
    for (const [index, description] of hostile.entries()) {
      await createTransaction(ctx.prisma, {
        type: 'OUT',
        amount: 1n,
        description,
        accountId: world.account.id,
        categoryId: world.expense.id,
        createdById: world.admin.user.id,
        createdAt: new Date(Date.UTC(2026, 9, 6, 3, 0, hostile.length - index)),
      });
    }
    await ctx.prisma.account.update({ where: { id: world.account.id }, data: { name: '=cmd|x' } });

    const { rows, bytes } = await download(ctx, world.admin);

    expect(rows.map((row) => row[DESCRIPTION])).toEqual([
      `'=HYPERLINK("http://x","y")`,
      `'+62 812`,
      `'-5 unit`,
      `'@SUM(A1)`,
      'Semen; 10 "sak"',
      'baris satu\nbaris dua',
    ]);
    expect(rows.every((row) => row.length === HEADER.length)).toBe(true);
    expect(rows[0]![HEADER.indexOf('Akun')]).toBe(`'=cmd|x`);
    // Tidak ada sel yang dimulai langsung dengan karakter rumus.
    expect(bytes.toString('utf8')).not.toMatch(/(^|;|\n)"?[=+@]/);
  });

  it('exports 20,000 transactions in batches', async () => {
    const world = await setupWorld(ctx);
    const rows: Prisma.TransactionCreateManyInput[] = Array.from({ length: 20_000 }, (_unused, i) => ({
      type: 'OUT',
      amount: BigInt(i + 1),
      transaction_date: new Date(Date.UTC(2026, 0, 1 + (i % 250))),
      description: `baris ${i}`,
      account_id: world.account.id,
      category_id: world.expense.id,
      created_by_id: world.admin.user.id,
    }));
    for (let start = 0; start < rows.length; start += 5_000) {
      await ctx.prisma.transaction.createMany({ data: rows.slice(start, start + 5_000) });
    }
    const findMany = vi.spyOn(ctx.app.get(PrismaService).transaction, 'findMany');

    const file = await download(ctx, world.admin);

    expect(file.rows).toHaveLength(20_000);
    expect(new Set(file.rows.map((row) => row[DESCRIPTION])).size).toBe(20_000);
    expect(findMany.mock.calls.length).toBeGreaterThanOrEqual(20_000 / EXPORT_BATCH_SIZE);
    for (const [args] of findMany.mock.calls) expect(args?.take).toBeLessThanOrEqual(EXPORT_BATCH_SIZE);
    const list = await call(ctx, world.admin, 'get', `${TRANSACTIONS}?pageSize=1`).expect(200);
    expect(list.body.meta.total).toBe(20_000);
    findMany.mockRestore();
  }, 120_000);

  it('records who exported what', async () => {
    const world = await setupWorld(ctx);
    await seedVariety(ctx, world);

    await download(ctx, world.manager, '?status=PENDING&search=termin');

    const entries = await ctx.prisma.auditLog.findMany({ where: { action: 'EXPORT' } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      user_id: world.manager.user.id,
      entity_type: 'transaction',
      entity_id: 'export',
      after: { filters: { status: 'PENDING', search: 'termin' }, rows: 1 },
    });
  });

  it.each([
    ['an unknown status', '?status=LUNAS', 'status'],
    ['a project id that is not an id', '?projectId=abc', 'projectId'],
    ['a project together with overhead', `?projectId=${randomUUID()}&overhead=true`, 'overhead'],
    ['paging, which an export does not have', '?page=2', 'page'],
    ['a page size', '?pageSize=10', 'pageSize'],
  ])('refuses %s without writing an audit entry', async (_label, query, field) => {
    const world = await setupWorld(ctx);

    const res = await call(ctx, world.admin, 'get', `${TRANSACTION_EXPORT}${query}`).expect(400);

    expect(errorFields(res.body)).toEqual([field]);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'EXPORT' } })).toBe(0);
  });
});
