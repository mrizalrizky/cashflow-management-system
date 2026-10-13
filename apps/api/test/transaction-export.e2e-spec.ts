import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { SAMPLE_FILES } from '../src/attachments/testing/sample-files.js';
import { toAuthUser } from '../src/auth/auth.types.js';
import { PrismaService } from '../src/database/prisma.service.js';
import type { Prisma } from '../src/generated/prisma/client.js';
import { EXPORT_BATCH_SIZE, TransactionExportService } from '../src/transactions/transaction-export.service.js';
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
  'Status',
  'Transfer',
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
  const [header, ...rows] = parseCsv(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  return { res, bytes, header, rows };
}

async function exported(ctx: E2eContext, session: TestSession, query = ''): Promise<string[]> {
  return (await download(ctx, session, query)).rows.map((row) => row[DESCRIPTION]!);
}

async function listed(ctx: E2eContext, session: TestSession, query = ''): Promise<{ total: number; names: string[] }> {
  const res = await call(ctx, session, 'get', `${TRANSACTIONS}?pageSize=100${query.replace('?', '&')}`).expect(200);
  return { total: res.body.meta.total, names: res.body.data.map((t: { description: string }) => t.description) };
}

/** Transaksi dengan keterangan yang berbeda-beda, dari berbagai pembuat, status, tipe dan tanggal. */
async function seedVariety(ctx: E2eContext, world: World): Promise<void> {
  const second = await createAccount(ctx.prisma, { name: 'Bank Uji' });
  await record(ctx, world.owner, expenseBody(world, { description: 'staf semen' }));
  await record(ctx, world.owner, expenseBody(world, { description: 'staf besi', transactionDate: '2026-09-15' }));
  await record(ctx, world.owner, expenseBody(world, { description: 'staf overhead listrik', accountId: second.id }));
  await record(ctx, world.owner, expenseBody(world, { description: 'staf lain pasir', transactionDate: '2026-09-20' }));
  await record(ctx, world.owner, incomeBody(world, { description: 'koordinator termin' }));
  const voided = await record(ctx, world.owner, incomeBody(world, { description: 'admin termin' }));
  await call(ctx, world.owner, 'post', transactionUrl(voided.id, 'void')).send({ reason: 'Ganda' }).expect(200);
  const group = randomUUID();
  for (const type of ['OUT', 'IN'] as const) {
    await createTransaction(ctx.prisma, {
      type,
      amount: 1_000n,
      description: `transfer ${type}`,
      accountId: type === 'OUT' ? world.account.id : second.id,
      categoryId: type === 'OUT' ? world.expense.id : world.income.id,
      createdById: world.owner.user.id,
      transferGroupId: group,
    });
  }
}

describe('GET /transactions/export', () => {
  const ctx = setupE2e();

  it('needs a session', async () => {
    const world = await setupWorld(ctx);

    await api(ctx).get(TRANSACTION_EXPORT).expect(401);
    await call(ctx, world.owner, 'get', TRANSACTION_EXPORT).expect(200);
  });

  it('is a UTF-8 CSV download with a header row', async () => {
    const world = await setupWorld(ctx);

    const { res, bytes, header, rows } = await download(ctx, world.owner);

    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="transaksi-\d{8}-\d{4}\.csv"$/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(header).toEqual(HEADER);
    expect(rows).toEqual([]);
  });

  it('writes one row per transaction with everything needed to read it on its own', async () => {
    const world = await setupWorld(ctx);
    const tx = await record(ctx, world.owner, expenseBody(world));
    await call(ctx, world.owner, 'post', transactionUrl(tx.id, 'attachments'))
      .attach('file', SAMPLE_FILES.pdf, 'nota.pdf')
      .expect(201);
    await call(ctx, world.owner, 'post', transactionUrl(tx.id, 'void')).send({ reason: 'Nota buram' }).expect(200);
    await record(ctx, world.owner, incomeBody(world, { transactionDate: '2026-09-30' }));

    const { rows } = await download(ctx, world.owner);

    expect(rows).toHaveLength(2);
    expect(rows[0]!.slice(0, 10)).toEqual([
      '2026-10-01',
      'Keluar',
      '150000',
      'Beli semen',
      'Kas Uji',
      'Material Uji',
      'Dibatalkan',
      'Tidak',
      'Nota buram',
      '1',
    ]);
    expect(rows[0]![10]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(rows[1]!.slice(0, 8)).toEqual([
      '2026-09-30',
      'Masuk',
      '500000',
      'Termin pertama',
      'Kas Uji',
      'Termin Uji',
      'Tercatat',
      'Tidak',
    ]);
  });

  it('writes the recording time in Jakarta, and marks transfers', async () => {
    const world = await setupWorld(ctx);
    await createTransaction(ctx.prisma, {
      type: 'OUT',
      amount: 5n,
      accountId: world.account.id,
      categoryId: world.expense.id,
      createdById: world.owner.user.id,
      createdAt: new Date('2026-10-06T17:30:00.000Z'),
      transferGroupId: randomUUID(),
    });

    const { rows } = await download(ctx, world.owner);

    expect(rows[0]![HEADER.indexOf('Transfer')]).toBe('Ya');
    expect(rows[0]![HEADER.indexOf('Dicatat pada')]).toBe('2026-10-07 00:30');
  });

  it.each([
    '',
    '?status=VOID',
    '?type=IN',
    '?dateFrom=2026-09-01&dateTo=2026-09-30',
    '?search=termin',
    '?includeTransfers=false',
    '?type=OUT&status=APPROVED&includeTransfers=false',
  ])('gives exactly the rows, in the order, of the list for %j', async (query) => {
    const world = await setupWorld(ctx);
    await seedVariety(ctx, world);

    const list = await listed(ctx, world.owner, query);
    const file = await exported(ctx, world.owner, query);

    expect(file).toEqual(list.names);
    expect(file).toHaveLength(list.total);
  });

  it('follows the account and category filters the same way', async () => {
    const world = await setupWorld(ctx);
    await seedVariety(ctx, world);

    for (const query of [`?accountId=${world.account.id}`, `?categoryId=${world.income.id}`]) {
      expect(await exported(ctx, world.owner, query)).toEqual((await listed(ctx, world.owner, query)).names);
    }
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
        createdById: world.owner.user.id,
        createdAt: new Date(Date.UTC(2026, 9, 6, 3, 0, hostile.length - index)),
      });
    }
    await ctx.prisma.account.update({ where: { id: world.account.id }, data: { name: '=cmd|x' } });

    const { rows, bytes } = await download(ctx, world.owner);

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
    expect(bytes.toString('utf8')).not.toMatch(/(^|;|\n)"?[=+\-@]/);
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
      created_by_id: world.owner.user.id,
    }));
    for (let start = 0; start < rows.length; start += 5_000) {
      await ctx.prisma.transaction.createMany({ data: rows.slice(start, start + 5_000) });
    }
    const findMany = vi.spyOn(ctx.app.get(PrismaService).transaction, 'findMany');

    const file = await download(ctx, world.owner);

    expect(file.rows).toHaveLength(20_000);
    expect(new Set(file.rows.map((row) => row[DESCRIPTION])).size).toBe(20_000);
    expect(findMany.mock.calls.length).toBeGreaterThanOrEqual(20_000 / EXPORT_BATCH_SIZE);
    for (const [args] of findMany.mock.calls) expect(args?.take).toBeLessThanOrEqual(EXPORT_BATCH_SIZE);
    const list = await call(ctx, world.owner, 'get', `${TRANSACTIONS}?pageSize=1`).expect(200);
    expect(list.body.meta.total).toBe(20_000);
    findMany.mockRestore();
  }, 120_000);

  it('records who exported what', async () => {
    const world = await setupWorld(ctx);
    await seedVariety(ctx, world);

    await download(ctx, world.owner, '?status=APPROVED&search=koordinator');

    const entries = await ctx.prisma.auditLog.findMany({ where: { action: 'EXPORT' } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      user_id: world.owner.user.id,
      entity_type: 'transaction',
      entity_id: 'export',
      after: { filters: { status: 'APPROVED', search: 'koordinator' }, rows: 1 },
    });
  });

  it.each([
    ['an unknown status', '?status=LUNAS', 'status'],
    ['a project filter, which no longer exists', `?projectId=${randomUUID()}`, 'projectId'],
    ['paging, which an export does not have', '?page=2', 'page'],
    ['a page size', '?pageSize=10', 'pageSize'],
  ])('refuses %s without writing an audit entry', async (_label, query, field) => {
    const world = await setupWorld(ctx);

    const res = await call(ctx, world.owner, 'get', `${TRANSACTION_EXPORT}${query}`).expect(400);

    expect(errorFields(res.body)).toEqual([field]);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'EXPORT' } })).toBe(0);
  });
});

describe('TransactionExportService under awkward conditions', () => {
  const ctx = setupE2e();

  /** Lebih dari satu kelompok baca, semuanya tercatat, dengan urutan yang pasti. */
  async function seedRecorded(world: World, count: number): Promise<void> {
    const rows: Prisma.TransactionCreateManyInput[] = Array.from({ length: count }, (_unused, i) => ({
      type: 'OUT',
      amount: 1n,
      status: 'APPROVED',
      transaction_date: new Date('2026-10-01T00:00:00.000Z'),
      description: `baris ${i}`,
      account_id: world.account.id,
      category_id: world.expense.id,
      created_by_id: world.owner.user.id,
      created_at: new Date(Date.UTC(2026, 9, 2, 0, 0, 0, i)),
    }));
    await ctx.prisma.transaction.createMany({ data: rows });
  }

  /** Penerima yang menjalankan `onFirstChunk` setelah kelompok pertama diterima. */
  function collector(onFirstChunk: () => Promise<void>) {
    const chunks: string[] = [];
    const out = new Writable({
      write(chunk: Buffer, _encoding, done) {
        chunks.push(chunk.toString('utf8'));
        if (chunks.length === 1) void onFirstChunk().then(() => done(), done);
        else done();
      },
    });
    /** Keterangan tiap baris data yang tertulis (tanpa baris judul). */
    const descriptions = () =>
      chunks
        .join('')
        .split('\r\n')
        .filter(Boolean)
        .slice(1)
        .map((line) => line.split(';')[DESCRIPTION]!);
    return { out, descriptions };
  }

  it('records the export before the first byte is sent, so leaving early cannot avoid it', async () => {
    const world = await setupWorld(ctx);
    await seedRecorded(world, 3);
    const service = ctx.app.get(TransactionExportService);

    await service.prepare(toAuthUser(world.owner.user), { status: 'APPROVED' }, '10.0.0.9');

    const entries = await ctx.prisma.auditLog.findMany({ where: { action: 'EXPORT' } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      user_id: world.owner.user.id,
      ip: '10.0.0.9',
      after: { filters: { status: 'APPROVED' }, rows: 3 },
    });
  });

  it('stops, instead of waiting forever, when the client goes away mid-file', async () => {
    const world = await setupWorld(ctx);
    await seedRecorded(world, EXPORT_BATCH_SIZE * 2 + 5);
    const service = ctx.app.get(TransactionExportService);
    // Penerima yang tidak pernah selesai menerima kelompok pertama, lalu memutus sambungan.
    const out = new Writable({ highWaterMark: 1, write: () => undefined });
    setTimeout(() => out.destroy(), 200);

    const prepared = await service.prepare(toAuthUser(world.owner.user), {}, null);
    const written = await prepared.writeTo(out);

    expect(written).toBeLessThan(EXPORT_BATCH_SIZE * 2 + 5);
  }, 10_000);

  it.each([
    ['leaves the filter', { status: 'VOID' as const }],
    ['moves elsewhere in the order', { transaction_date: new Date('2020-01-01T00:00:00.000Z') }],
  ])('loses no row when the last row of a batch %s before the next batch is read', async (_label, change) => {
    const world = await setupWorld(ctx);
    const total = EXPORT_BATCH_SIZE + 5;
    await seedRecorded(world, total);
    const service = ctx.app.get(TransactionExportService);
    // Baris terakhir kelompok pertama: yang ke-1.000 menurut urutan daftar (terbaru dicatat dulu).
    const boundary = await ctx.prisma.transaction.findFirstOrThrow({
      where: { description: `baris ${total - EXPORT_BATCH_SIZE}` },
    });
    const { out, descriptions } = collector(async () => {
      await ctx.prisma.transaction.update({ where: { id: boundary.id }, data: change });
    });

    const prepared = await service.prepare(toAuthUser(world.owner.user), { status: 'APPROVED' }, null);
    const written = await prepared.writeTo(out);

    // Baris yang berubah sudah telanjur tertulis, dan boleh muncul sekali lagi bila ia pindah
    // ke belakang; yang tidak boleh terjadi adalah baris lain hilang.
    expect(new Set(descriptions()).size).toBe(total);
    expect(written).toBe(descriptions().length);
    expect(written).toBeLessThanOrEqual(total + 1);
  }, 30_000);
});
