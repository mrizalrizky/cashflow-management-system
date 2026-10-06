import { randomUUID } from 'node:crypto';
import { currentYearInJakarta } from '../src/common/calendar-date.js';
import { setupE2e } from './e2e-context.js';
import { asAdmin, call, createProject, errorFields } from './fixtures.js';
import { PROJECTS } from './routes.js';

const YEAR = currentYearInJakarta();
const NEW_PROJECT = {
  name: 'Rumah Pak Budi',
  clientName: 'Budi Santoso',
  contractValue: '850000000',
  startDate: '2026-10-01',
  endDate: '2027-03-31',
  notes: 'Dua lantai',
};

type Coded = { code: string };

describe('POST /projects', () => {
  const ctx = setupE2e();

  it('creates an active project with a generated code and records it', async () => {
    const admin = await asAdmin(ctx);

    const res = await call(ctx, admin, 'post', PROJECTS).send(NEW_PROJECT).expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      code: `PRJ-${YEAR}-001`,
      name: 'Rumah Pak Budi',
      clientName: 'Budi Santoso',
      contractValue: '850000000',
      status: 'ACTIVE',
      startDate: '2026-10-01',
      endDate: '2027-03-31',
      notes: 'Dua lantai',
      members: [],
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entity_type: 'project' } });
    expect(row).toMatchObject({ action: 'CREATE', user_id: admin.user.id, entity_id: res.body.id });
    expect(row.after).toMatchObject({ code: `PRJ-${YEAR}-001`, contract_value: '850000000' });
  });

  it('needs only a name and a client, defaulting the rest', async () => {
    const admin = await asAdmin(ctx);
    const res = await call(ctx, admin, 'post', PROJECTS)
      .send({ name: 'Interior Kantor', clientName: 'PT Maju' })
      .expect(201);
    expect(res.body).toMatchObject({
      contractValue: '0',
      startDate: null,
      endDate: null,
      notes: null,
    });
  });

  it('numbers projects consecutively', async () => {
    const admin = await asAdmin(ctx);
    const codes: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await call(ctx, admin, 'post', PROJECTS).send(NEW_PROJECT).expect(201);
      codes.push(res.body.code);
    }
    expect(codes).toEqual([`PRJ-${YEAR}-001`, `PRJ-${YEAR}-002`, `PRJ-${YEAR}-003`]);
  });

  it('gives ten projects created at the same moment ten distinct consecutive codes', async () => {
    const admin = await asAdmin(ctx);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => call(ctx, admin, 'post', PROJECTS).send(NEW_PROJECT)),
    );

    expect(results.map((r) => r.status)).toEqual(Array(10).fill(201));
    const expected = Array.from({ length: 10 }, (_, i) => `PRJ-${YEAR}-${String(i + 1).padStart(3, '0')}`);
    expect(results.map((r) => r.body.code).sort()).toEqual(expected);
  });

  it('restarts the numbering each year and ignores codes of other shapes', async () => {
    const admin = await asAdmin(ctx);
    await createProject(ctx.prisma, { code: `PRJ-${YEAR - 1}-007` });
    await createProject(ctx.prisma, { code: `PRJ-${YEAR}-abc` });
    await createProject(ctx.prisma, { code: 'LAMA-99' });

    const res = await call(ctx, admin, 'post', PROJECTS).send(NEW_PROJECT).expect(201);

    expect(res.body.code).toBe(`PRJ-${YEAR}-001`);
  });

  it('keeps counting past 999 by number, not by text', async () => {
    const admin = await asAdmin(ctx);
    await createProject(ctx.prisma, { code: `PRJ-${YEAR}-999` });

    const first = await call(ctx, admin, 'post', PROJECTS).send(NEW_PROJECT).expect(201);
    const second = await call(ctx, admin, 'post', PROJECTS).send(NEW_PROJECT).expect(201);

    expect([first.body.code, second.body.code]).toEqual([`PRJ-${YEAR}-1000`, `PRJ-${YEAR}-1001`]);
  });

  it.each([
    ['a blank name', { name: ' ' }, 'name'],
    ['a blank client', { clientName: '' }, 'clientName'],
    ['a negative contract value', { contractValue: '-1' }, 'contractValue'],
    ['a decimal contract value', { contractValue: '1000.5' }, 'contractValue'],
    ['a numeric contract value', { contractValue: 1000 }, 'contractValue'],
    ['a start date that does not exist', { startDate: '2026-02-30' }, 'startDate'],
    ['an end date before the start date', { endDate: '2026-09-30' }, 'endDate'],
    ['a code chosen by the client', { code: 'PRJ-2026-777' }, 'code'],
    ['a status chosen at creation', { status: 'COMPLETED' }, 'status'],
  ])('rejects %s', async (_label, override, field) => {
    const admin = await asAdmin(ctx);
    const res = await call(ctx, admin, 'post', PROJECTS)
      .send({ ...NEW_PROJECT, ...override })
      .expect(400);
    expect(errorFields(res.body)).toContain(field);
    expect(await ctx.prisma.project.count()).toBe(0);
  });
});

describe('PATCH /projects/:id', () => {
  const ctx = setupE2e();

  async function createViaApi(admin: Awaited<ReturnType<typeof asAdmin>>) {
    return (await call(ctx, admin, 'post', PROJECTS).send(NEW_PROJECT).expect(201)).body;
  }

  it('updates the project and records before and after', async () => {
    const admin = await asAdmin(ctx);
    const project = await createViaApi(admin);

    const res = await call(ctx, admin, 'patch', `${PROJECTS}/${project.id}`)
      .send({ name: 'Rumah Bu Ani', clientName: 'Ani', contractValue: '900000000', status: 'COMPLETED' })
      .expect(200);

    expect(res.body).toMatchObject({
      code: project.code,
      name: 'Rumah Bu Ani',
      clientName: 'Ani',
      contractValue: '900000000',
      status: 'COMPLETED',
    });
    const row = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'UPDATE' } });
    expect(row.before).toMatchObject({ name: 'Rumah Pak Budi', status: 'ACTIVE' });
    expect(row.after).toMatchObject({ name: 'Rumah Bu Ani', status: 'COMPLETED', contract_value: '900000000' });
  });

  it('lets the status move in any direction', async () => {
    const admin = await asAdmin(ctx);
    const project = await createViaApi(admin);

    for (const status of ['CANCELLED', 'ACTIVE', 'COMPLETED', 'ACTIVE']) {
      const res = await call(ctx, admin, 'patch', `${PROJECTS}/${project.id}`).send({ status }).expect(200);
      expect(res.body.status).toBe(status);
    }
  });

  it('can clear the optional fields with null, but not the required ones', async () => {
    const admin = await asAdmin(ctx);
    const project = await createViaApi(admin);

    const res = await call(ctx, admin, 'patch', `${PROJECTS}/${project.id}`)
      .send({ startDate: null, endDate: null, notes: null })
      .expect(200);
    expect(res.body).toMatchObject({ startDate: null, endDate: null, notes: null });

    for (const body of [{ name: null }, { clientName: null }, { contractValue: null }, { status: null }]) {
      await call(ctx, admin, 'patch', `${PROJECTS}/${project.id}`).send(body).expect(400);
    }
  });

  it('checks the date range against the stored dates when only one date changes', async () => {
    const admin = await asAdmin(ctx);
    const project = await createViaApi(admin);

    const tooEarly = await call(ctx, admin, 'patch', `${PROJECTS}/${project.id}`)
      .send({ endDate: '2026-09-30' })
      .expect(400);
    expect(errorFields(tooEarly.body)).toEqual(['endDate']);

    const tooLate = await call(ctx, admin, 'patch', `${PROJECTS}/${project.id}`)
      .send({ startDate: '2027-04-01' })
      .expect(400);
    expect(errorFields(tooLate.body)).toEqual(['endDate']);

    await call(ctx, admin, 'patch', `${PROJECTS}/${project.id}`).send({ endDate: '2026-10-01' }).expect(200);
  });

  it('never accepts a new code, and answers 400 or 404 for bad ids', async () => {
    const admin = await asAdmin(ctx);
    const project = await createViaApi(admin);

    await call(ctx, admin, 'patch', `${PROJECTS}/${project.id}`).send({ code: 'X-1' }).expect(400);
    await call(ctx, admin, 'patch', `${PROJECTS}/bukan-uuid`).send({ name: 'X' }).expect(400);
    const res = await call(ctx, admin, 'patch', `${PROJECTS}/${randomUUID()}`).send({ name: 'X' }).expect(404);
    expect(res.body).toEqual({ statusCode: 404, message: 'Proyek tidak ditemukan' });
  });
});

describe('GET /projects', () => {
  const ctx = setupE2e();

  it('lists newest first with search, status filter and paging', async () => {
    const admin = await asAdmin(ctx);
    for (const [name, clientName] of [
      ['Rumah Pak Budi', 'Budi'],
      ['Interior Kafe', 'PT 100% Kopi'],
      ['Ruko Tiga Lantai', 'Citra'],
    ]) {
      await call(ctx, admin, 'post', PROJECTS).send({ name, clientName }).expect(201);
    }
    const [newest] = (await call(ctx, admin, 'get', PROJECTS).expect(200)).body.data;
    await call(ctx, admin, 'patch', `${PROJECTS}/${newest.id}`).send({ status: 'COMPLETED' }).expect(200);

    const codes = async (query = '') => {
      const res = await call(ctx, admin, 'get', `${PROJECTS}?${query}`).expect(200);
      return res.body.data.map((p: Coded) => p.code.slice(-3));
    };

    expect(await codes()).toEqual(['003', '002', '001']);
    expect(await codes('search=kafe')).toEqual(['002']);
    expect(await codes('search=budi')).toEqual(['001']);
    expect(await codes(`search=${YEAR}-003`)).toEqual(['003']);
    expect(await codes('search=100%25')).toEqual(['002']);
    expect(await codes('search=%25')).toEqual(['002']);
    expect(await codes('status=COMPLETED')).toEqual(['003']);
    expect(await codes('status=ACTIVE')).toEqual(['002', '001']);

    const page = await call(ctx, admin, 'get', `${PROJECTS}?page=2&pageSize=2`).expect(200);
    expect(page.body.data.map((p: Coded) => p.code.slice(-3))).toEqual(['001']);
    expect(page.body.meta).toEqual({ page: 2, pageSize: 2, total: 3 });
    await call(ctx, admin, 'get', `${PROJECTS}?status=DONE`).expect(400);
  });
});
