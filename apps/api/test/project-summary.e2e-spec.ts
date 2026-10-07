import { randomUUID } from 'node:crypto';
import type { ProjectSummaryResponse } from '../src/reports/report.mapper.js';
import { api, E2eContext, setupE2e } from './e2e-context.js';
import { asAdmin, assign, call, createProject, createTransaction, loginAs, TestSession } from './fixtures.js';
import { EXPECTED, ReportLedger, seedReportLedger } from './report-fixtures.js';
import { PROJECTS } from './routes.js';

function summaryUrl(projectId: string): string {
  return `${PROJECTS}/${projectId}/summary`;
}

async function summary(ctx: E2eContext, session: TestSession, projectId: string): Promise<ProjectSummaryResponse> {
  const res = await call(ctx, session, 'get', summaryUrl(projectId)).expect(200);
  return res.body as ProjectSummaryResponse;
}

/** Ringkasan tanpa id, dengan kategori cukup nama dan jumlahnya, supaya bisa dibandingkan dengan `EXPECTED`. */
function comparable(body: ProjectSummaryResponse) {
  const { projectId: _projectId, costByCategory, ...rest } = body;
  return { ...rest, costByCategory: costByCategory.map(({ name, amount }) => ({ name, amount })) };
}

describe('GET /projects/:id/summary', () => {
  const ctx = setupE2e();

  async function setup(): Promise<ReportLedger & { admin: TestSession }> {
    const ledger = await seedReportLedger(ctx);
    return { ...ledger, admin: await asAdmin(ctx) };
  }

  it('matches the figures computed by hand', async () => {
    const world = await setup();

    const a = await summary(ctx, world.admin, world.projectA.id);
    expect(a.projectId).toBe(world.projectA.id);
    expect(comparable(a)).toEqual(EXPECTED.projectA);
    expect(a.costByCategory[0]!.categoryId).toBe(world.material.id);
  });

  it('shows more received than the contract as a negative remainder and over 100 percent', async () => {
    const world = await setup();

    expect(comparable(await summary(ctx, world.admin, world.projectB.id))).toEqual(EXPECTED.projectB);
  });

  it('is open to the admin and to project managers assigned to the project only', async () => {
    const world = await setup();
    const assigned = await loginAs(ctx, { role: 'PROJECT_MANAGER' });
    const other = await loginAs(ctx, { role: 'PROJECT_MANAGER' });
    const staff = await loginAs(ctx, { role: 'STAFF' });
    await assign(ctx.prisma, world.projectA.id, assigned.user.id);
    await assign(ctx.prisma, world.projectB.id, other.user.id);

    expect(comparable(await summary(ctx, assigned, world.projectA.id))).toEqual(EXPECTED.projectA);
    await call(ctx, assigned, 'get', summaryUrl(world.projectB.id)).expect(404);
    await call(ctx, other, 'get', summaryUrl(world.projectA.id)).expect(404);
    await call(ctx, staff, 'get', summaryUrl(world.projectA.id)).expect(403);
    await call(ctx, world.admin, 'get', summaryUrl(randomUUID())).expect(404);
    await call(ctx, world.admin, 'get', summaryUrl('bukan-id')).expect(400);
    await api(ctx).get(summaryUrl(world.projectA.id)).expect(401);
  });

  it('answers a missing project and one out of reach in the same way', async () => {
    const world = await setup();
    const manager = await loginAs(ctx, { role: 'PROJECT_MANAGER' });

    const unknown = await call(ctx, manager, 'get', summaryUrl(randomUUID())).expect(404);
    const notMine = await call(ctx, manager, 'get', summaryUrl(world.projectA.id)).expect(404);

    expect(notMine.body).toEqual(unknown.body);
    expect(notMine.body).toEqual({ statusCode: 404, message: 'Proyek tidak ditemukan' });
  });

  it('is closed to a project manager the moment they are removed from the project', async () => {
    const world = await setup();
    const manager = await loginAs(ctx, { role: 'PROJECT_MANAGER' });
    await assign(ctx.prisma, world.projectA.id, manager.user.id);
    await call(ctx, manager, 'get', summaryUrl(world.projectA.id)).expect(200);

    await ctx.prisma.projectMember.deleteMany({ where: { user_id: manager.user.id } });

    await call(ctx, manager, 'get', summaryUrl(world.projectA.id)).expect(404);
  });

  it('counts only approved transactions of this project', async () => {
    const world = await setup();
    await ctx.prisma.transaction.updateMany({
      where: { OR: [{ project_id: { not: world.projectA.id } }, { project_id: null }, { status: { not: 'APPROVED' } }] },
      data: { amount: 999_999_999n },
    });

    expect(comparable(await summary(ctx, world.admin, world.projectA.id))).toEqual(EXPECTED.projectA);
  });

  it('shows a negative cash difference when costs exceed what was received', async () => {
    const world = await setup();

    const body = await summary(ctx, world.admin, world.projectA.id);

    expect(body.cashDifference).toBe('-7000000');
  });

  it('rounds the percentage down to two decimals', async () => {
    const world = await setup();
    const project = await createProject(ctx.prisma, { contractValue: 3_000_000n });
    await createTransaction(ctx.prisma, {
      type: 'IN',
      amount: 1_000_000n,
      accountId: world.bank.id,
      categoryId: world.income.id,
      createdById: world.recorder.id,
      projectId: project.id,
    });

    expect((await summary(ctx, world.admin, project.id)).receivedPercent).toBe(33.33);
  });

  it('reports zeros for a project without transactions, and no percentage without a contract value', async () => {
    const admin = await asAdmin(ctx);
    const quiet = await createProject(ctx.prisma, { contractValue: 50_000_000n });
    const noContract = await createProject(ctx.prisma, { contractValue: 0n });

    expect(await summary(ctx, admin, quiet.id)).toEqual({
      projectId: quiet.id,
      contractValue: '50000000',
      received: '0',
      outstanding: '50000000',
      receivedPercent: 0,
      cost: '0',
      cashDifference: '0',
      costByCategory: [],
      pendingCount: 0,
    });
    expect(await summary(ctx, admin, noContract.id)).toMatchObject({
      contractValue: '0',
      outstanding: '0',
      receivedPercent: null,
    });
  });

  it.each(['COMPLETED', 'CANCELLED'] as const)('is still available for a %s project', async (status) => {
    const world = await setup();
    await ctx.prisma.project.update({ where: { id: world.projectA.id }, data: { status } });

    expect(comparable(await summary(ctx, world.admin, world.projectA.id))).toEqual(EXPECTED.projectA);
  });
});
