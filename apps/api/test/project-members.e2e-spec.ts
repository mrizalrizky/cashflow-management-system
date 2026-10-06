import { randomUUID } from 'node:crypto';
import { E2eContext, setupE2e } from './e2e-context.js';
import {
  adminOnly,
  asAdmin,
  assign,
  call,
  createProject,
  createUser,
  errorFields,
  expectAccess,
  login,
  loginAs,
  TestSession,
} from './fixtures.js';
import { PROJECT_OPTIONS, PROJECTS, USERS } from './routes.js';

function membersUrl(projectId: string): string {
  return `${PROJECTS}/${projectId}/members`;
}

function setMembers(ctx: E2eContext, admin: TestSession, projectId: string, userIds: unknown) {
  return call(ctx, admin, 'put', membersUrl(projectId)).send({ userIds });
}

function memberIds(ctx: E2eContext, projectId: string): Promise<string[]> {
  return ctx.prisma.projectMember
    .findMany({ where: { project_id: projectId } })
    .then((rows) => rows.map((row) => row.user_id).sort());
}

describe('PUT /projects/:id/members', () => {
  const ctx = setupE2e();

  it('is for SUPER_ADMIN only', async () => {
    const project = await createProject(ctx.prisma);
    await expectAccess(
      ctx,
      { method: 'put', path: membersUrl(project.id), body: { userIds: [] } },
      adminOnly(),
    );
  });

  it('assigns project managers and returns the project with its members by name', async () => {
    const admin = await asAdmin(ctx);
    const project = await createProject(ctx.prisma);
    const zaki = await createUser(ctx.prisma, { role: 'PROJECT_MANAGER', name: 'Zaki' });
    const ani = await createUser(ctx.prisma, { role: 'PROJECT_MANAGER', name: 'Ani' });

    const res = await setMembers(ctx, admin, project.id, [zaki.id, ani.id]).expect(200);

    expect(res.body.id).toBe(project.id);
    expect(res.body.members).toEqual([
      { id: ani.id, name: 'Ani', email: ani.email },
      { id: zaki.id, name: 'Zaki', email: zaki.email },
    ]);
    const rows = await ctx.prisma.projectMember.findMany({ where: { project_id: project.id } });
    expect(rows.map((r) => r.assigned_by)).toEqual([admin.user.id, admin.user.id]);
  });

  it('replaces the list, keeping the original assignment of those who stay', async () => {
    const admin = await asAdmin(ctx);
    const project = await createProject(ctx.prisma);
    const [stays, leaves, joins] = await Promise.all(
      ['Tetap', 'Keluar', 'Masuk'].map((name) => createUser(ctx.prisma, { role: 'PROJECT_MANAGER', name })),
    );
    await setMembers(ctx, admin, project.id, [stays!.id, leaves!.id]).expect(200);
    const original = await ctx.prisma.projectMember.findUniqueOrThrow({
      where: { project_id_user_id: { project_id: project.id, user_id: stays!.id } },
    });

    await setMembers(ctx, admin, project.id, [stays!.id, joins!.id]).expect(200);

    expect(await memberIds(ctx, project.id)).toEqual([stays!.id, joins!.id].sort());
    const kept = await ctx.prisma.projectMember.findUniqueOrThrow({
      where: { project_id_user_id: { project_id: project.id, user_id: stays!.id } },
    });
    expect(kept.assigned_at).toEqual(original.assigned_at);

    const cleared = await setMembers(ctx, admin, project.id, []).expect(200);
    expect(cleared.body.members).toEqual([]);
  });

  it('records each change once, and nothing when the list is unchanged', async () => {
    const admin = await asAdmin(ctx);
    const project = await createProject(ctx.prisma);
    const first = await createUser(ctx.prisma, { role: 'PROJECT_MANAGER' });
    const second = await createUser(ctx.prisma, { role: 'PROJECT_MANAGER' });

    await setMembers(ctx, admin, project.id, [first.id]).expect(200);
    await setMembers(ctx, admin, project.id, [first.id]).expect(200);
    await setMembers(ctx, admin, project.id, [second.id, first.id]).expect(200);

    const rows = await ctx.prisma.auditLog.findMany({
      where: { action: 'SET_MEMBERS' },
      orderBy: { created_at: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ user_id: admin.user.id, entity_type: 'project', entity_id: project.id });
    expect(rows[1]!.before).toEqual({ user_ids: [first.id] });
    expect(rows[1]!.after).toEqual({ user_ids: [first.id, second.id].sort() });
  });

  it('refuses the whole request, changing nothing, when any id is not an active project manager', async () => {
    const admin = await asAdmin(ctx);
    const project = await createProject(ctx.prisma);
    const valid = await createUser(ctx.prisma, { role: 'PROJECT_MANAGER' });
    const staff = await createUser(ctx.prisma, { role: 'STAFF' });
    const inactive = await createUser(ctx.prisma, { role: 'PROJECT_MANAGER', isActive: false });
    await assign(ctx.prisma, project.id, valid.id);

    const refused: [string, unknown][] = [
      ['a staff user', [valid.id, staff.id]],
      ['a super admin', [admin.user.id]],
      ['an inactive project manager', [inactive.id]],
      ['an unknown user', [valid.id, randomUUID()]],
      ['a malformed id', ['bukan-uuid']],
      ['the same id twice', [valid.id, valid.id]],
      ['more than 50 ids', Array.from({ length: 51 }, () => randomUUID())],
      ['something that is not a list', valid.id],
      ['a missing list', undefined],
    ];
    for (const [label, userIds] of refused) {
      const res = await setMembers(ctx, admin, project.id, userIds);
      expect(res.status, label).toBe(400);
      expect(errorFields(res.body), label).toEqual(['userIds']);
    }

    expect(await memberIds(ctx, project.id)).toEqual([valid.id]);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'SET_MEMBERS' } })).toBe(0);
  });

  it('keeps a deactivated manager who is already assigned while others are added', async () => {
    const admin = await asAdmin(ctx);
    const project = await createProject(ctx.prisma);
    const away = await createUser(ctx.prisma, { role: 'PROJECT_MANAGER', isActive: false });
    const joins = await createUser(ctx.prisma, { role: 'PROJECT_MANAGER' });
    await assign(ctx.prisma, project.id, away.id);

    await setMembers(ctx, admin, project.id, [away.id, joins.id]).expect(200);

    expect(await memberIds(ctx, project.id)).toEqual([away.id, joins.id].sort());
  });

  it('handles two edits of the same project arriving together', async () => {
    const admin = await asAdmin(ctx);
    const project = await createProject(ctx.prisma);
    const manager = await createUser(ctx.prisma, { role: 'PROJECT_MANAGER' });

    const results = await Promise.all([
      setMembers(ctx, admin, project.id, [manager.id]),
      setMembers(ctx, admin, project.id, [manager.id]),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await memberIds(ctx, project.id)).toEqual([manager.id]);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'SET_MEMBERS' } })).toBe(1);
  });

  it('answers 404 for an unknown project', async () => {
    const admin = await asAdmin(ctx);
    const res = await setMembers(ctx, admin, randomUUID(), []).expect(404);
    expect(res.body).toEqual({ statusCode: 404, message: 'Proyek tidak ditemukan' });
  });

  it('takes access away at once when a project manager is removed', async () => {
    const admin = await asAdmin(ctx);
    const project = await createProject(ctx.prisma);
    const manager = await loginAs(ctx, { role: 'PROJECT_MANAGER' });
    await setMembers(ctx, admin, project.id, [manager.user.id]).expect(200);
    await call(ctx, manager, 'get', `${PROJECTS}/${project.id}`).expect(200);

    await setMembers(ctx, admin, project.id, []).expect(200);

    await call(ctx, manager, 'get', `${PROJECTS}/${project.id}`).expect(404);
    expect((await call(ctx, manager, 'get', PROJECTS).expect(200)).body.data).toEqual([]);
    expect((await call(ctx, manager, 'get', PROJECT_OPTIONS).expect(200)).body).toEqual([]);
  });
});

describe('project assignments when a user changes', () => {
  const ctx = setupE2e();

  it('removes the assignments of a project manager whose role changes, and records which', async () => {
    const admin = await asAdmin(ctx);
    const project = await createProject(ctx.prisma);
    const other = await createProject(ctx.prisma);
    const manager = await createUser(ctx.prisma, { role: 'PROJECT_MANAGER' });
    const colleague = await createUser(ctx.prisma, { role: 'PROJECT_MANAGER' });
    await assign(ctx.prisma, project.id, manager.id);
    await assign(ctx.prisma, other.id, manager.id);
    await assign(ctx.prisma, project.id, colleague.id);

    await call(ctx, admin, 'patch', `${USERS}/${manager.id}`).send({ role: 'STAFF' }).expect(200);

    expect(await ctx.prisma.projectMember.count({ where: { user_id: manager.id } })).toBe(0);
    expect(await memberIds(ctx, project.id)).toEqual([colleague.id]);
    const row = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'UPDATE', entity_id: manager.id },
    });
    expect(row.after).toMatchObject({
      role: 'STAFF',
      removed_project_ids: [project.id, other.id].sort(),
    });
  });

  it('keeps the assignments of a deactivated project manager for when they return', async () => {
    const admin = await asAdmin(ctx);
    const project = await createProject(ctx.prisma);
    const manager = await loginAs(ctx, { role: 'PROJECT_MANAGER' });
    await assign(ctx.prisma, project.id, manager.user.id);

    await call(ctx, admin, 'patch', `${USERS}/${manager.user.id}`).send({ isActive: false }).expect(200);
    expect(await memberIds(ctx, project.id)).toEqual([manager.user.id]);

    await call(ctx, admin, 'patch', `${USERS}/${manager.user.id}`).send({ isActive: true }).expect(200);
    // Sesi lama sudah diakhiri saat dinonaktifkan, jadi ia login lagi.
    const back = await login(ctx, manager.user.email);
    await call(ctx, back, 'get', `${PROJECTS}/${project.id}`).expect(200);
  });
});
