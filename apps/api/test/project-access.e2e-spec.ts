import { randomUUID } from 'node:crypto';
import { toAuthUser } from '../src/auth/auth.types.js';
import type { Project } from '../src/generated/prisma/client.js';
import { ProjectAccessService } from '../src/projects/project-access.service.js';
import { E2eContext, setupE2e } from './e2e-context.js';
import {
  adminOnly,
  asAdmin,
  assign,
  call,
  createProject,
  createUser,
  expectAccess,
  loginAs,
} from './fixtures.js';
import { PROJECT_OPTIONS, PROJECTS } from './routes.js';

type Coded = { code: string };

/** Dua proyek aktif; koordinator `manager` hanya ditugaskan ke proyek A. */
async function twoProjects(ctx: E2eContext) {
  const projectA = await createProject(ctx.prisma, { code: 'PRJ-A', name: 'Proyek A' });
  const projectB = await createProject(ctx.prisma, { code: 'PRJ-B', name: 'Proyek B' });
  const manager = await loginAs(ctx, { role: 'PROJECT_MANAGER' });
  await assign(ctx.prisma, projectA.id, manager.user.id);
  return { projectA, projectB, manager };
}

describe('project access', () => {
  const ctx = setupE2e();

  it('limits each route to the roles that may use it', async () => {
    const project = await createProject(ctx.prisma);
    const body = { name: 'Baru', clientName: 'Klien' };

    await expectAccess(
      ctx,
      { method: 'get', path: PROJECTS },
      { SUPER_ADMIN: 200, PROJECT_MANAGER: 200, STAFF: 403 },
    );
    await expectAccess(
      ctx,
      { method: 'get', path: PROJECT_OPTIONS },
      { SUPER_ADMIN: 200, PROJECT_MANAGER: 200, STAFF: 200 },
    );
    await expectAccess(ctx, { method: 'post', path: PROJECTS, body }, adminOnly(201));
    await expectAccess(
      ctx,
      { method: 'patch', path: `${PROJECTS}/${project.id}`, body: { name: 'Lain' } },
      adminOnly(),
    );
    // Koordinator yang belum ditugaskan tidak melihat proyek itu; staf tidak boleh sama sekali.
    await expectAccess(
      ctx,
      { method: 'get', path: `${PROJECTS}/${project.id}` },
      { SUPER_ADMIN: 200, PROJECT_MANAGER: 404, STAFF: 403 },
    );
  });

  it('shows a project manager only the projects they are assigned to', async () => {
    const { projectA, projectB, manager } = await twoProjects(ctx);
    const admin = await asAdmin(ctx);

    const forAdmin = await call(ctx, admin, 'get', PROJECTS).expect(200);
    expect(forAdmin.body.data.map((p: Coded) => p.code).sort()).toEqual(['PRJ-A', 'PRJ-B']);

    const forManager = await call(ctx, manager, 'get', PROJECTS).expect(200);
    expect(forManager.body.data.map((p: Coded) => p.code)).toEqual(['PRJ-A']);
    expect(forManager.body.meta.total).toBe(1);

    const own = await call(ctx, manager, 'get', `${PROJECTS}/${projectA.id}`).expect(200);
    expect(own.body.members).toEqual([
      { id: manager.user.id, name: manager.user.name, email: manager.user.email },
    ]);

    // Proyek orang lain dijawab persis seperti proyek yang tidak ada.
    const foreign = await call(ctx, manager, 'get', `${PROJECTS}/${projectB.id}`).expect(404);
    const missing = await call(ctx, manager, 'get', `${PROJECTS}/${randomUUID()}`).expect(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it('does not let a project manager change even their own project', async () => {
    const { projectA, manager } = await twoProjects(ctx);

    await call(ctx, manager, 'patch', `${PROJECTS}/${projectA.id}`).send({ name: 'Diubah' }).expect(403);

    expect((await ctx.prisma.project.findUniqueOrThrow({ where: { id: projectA.id } })).name).toBe(
      'Proyek A',
    );
  });

  it('offers only active projects as options, scoped for project managers', async () => {
    const { manager } = await twoProjects(ctx);
    const finished = await createProject(ctx.prisma, { code: 'PRJ-C', status: 'COMPLETED' });
    await createProject(ctx.prisma, { code: 'PRJ-D', status: 'CANCELLED' });
    await assign(ctx.prisma, finished.id, manager.user.id);
    const admin = await asAdmin(ctx);
    const staff = await loginAs(ctx, { role: 'STAFF' });

    const options = async (session: typeof admin) =>
      (await call(ctx, session, 'get', PROJECT_OPTIONS).expect(200)).body;

    expect(await options(admin)).toEqual([
      { id: expect.any(String), code: 'PRJ-A', name: 'Proyek A' },
      { id: expect.any(String), code: 'PRJ-B', name: 'Proyek B' },
    ]);
    expect((await options(staff)).map((p: Coded) => p.code)).toEqual(['PRJ-A', 'PRJ-B']);
    expect((await options(manager)).map((p: Coded) => p.code)).toEqual(['PRJ-A']);
  });
});

describe('ProjectAccessService.assertCanView', () => {
  const ctx = setupE2e();

  async function canView(userId: string, project: Pick<Project, 'id'>): Promise<boolean> {
    const user = toAuthUser(await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } }));
    const access = ctx.app.get(ProjectAccessService);
    return access.assertCanView(ctx.prisma, user, project.id).then(
      () => true,
      (error: Error) => {
        if (error.message !== 'Proyek tidak ditemukan') throw error;
        return false;
      },
    );
  }

  it('follows role and assignment', async () => {
    const { projectA, projectB, manager } = await twoProjects(ctx);
    const admin = await createUser(ctx.prisma, { role: 'SUPER_ADMIN' });
    const staff = await createUser(ctx.prisma, { role: 'STAFF' });

    expect(await canView(admin.id, projectA)).toBe(true);
    expect(await canView(admin.id, projectB)).toBe(true);
    expect(await canView(manager.user.id, projectA)).toBe(true);
    expect(await canView(manager.user.id, projectB)).toBe(false);
    expect(await canView(staff.id, projectA)).toBe(false);
    expect(await canView(admin.id, { id: randomUUID() })).toBe(false);
  });
});
