import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { lockForTransaction, LOCKS } from '../common/advisory-lock.js';
import { validationFailed } from '../common/validation.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { projectNotFound } from './project-access.service.js';
import { PROJECT_INCLUDE, ProjectWithMembers } from './project.mapper.js';

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Mengganti daftar koordinator sebuah proyek. Yang tetap ada tidak disentuh atau diperiksa ulang. */
  async setMembers(
    actor: AuthUser,
    projectId: string,
    userIds: string[],
    ip: string | null,
  ): Promise<ProjectWithMembers> {
    return this.prisma.$transaction(async (tx) => {
      // Kunci yang sama dengan perubahan peran user: tanpa ini seorang user bisa ditugaskan
      // tepat saat perannya diganti, dan dua perubahan anggota bersamaan saling bertabrakan.
      await lockForTransaction(tx, LOCKS.userAccess);

      const project = await tx.project.findUnique({
        where: { id: projectId },
        include: { members: true },
      });
      if (!project) throw projectNotFound();

      const current = project.members.map((member) => member.user_id);
      const added = userIds.filter((id) => !current.includes(id));
      const removed = current.filter((id) => !userIds.includes(id));
      // Hanya yang baru ditugaskan yang diperiksa: koordinator nonaktif yang sudah ada tetap
      // dipertahankan, supaya aksesnya kembali saat ia diaktifkan lagi.
      await this.assertAllAssignable(tx, added);

      if (added.length > 0 || removed.length > 0) {
        await tx.projectMember.deleteMany({
          where: { project_id: projectId, user_id: { in: removed } },
        });
        await tx.projectMember.createMany({
          data: added.map((user_id) => ({
            project_id: projectId,
            user_id,
            assigned_by: actor.id,
          })),
        });
        await this.audit.log(tx, {
          userId: actor.id,
          action: 'SET_MEMBERS',
          entityType: 'project',
          entityId: projectId,
          before: { user_ids: [...current].sort() },
          after: { user_ids: [...userIds].sort() },
          ip,
        });
      }

      return tx.project.findUniqueOrThrow({ where: { id: projectId }, include: PROJECT_INCLUDE });
    });
  }

  /** Hanya koordinator proyek yang aktif yang bisa ditugaskan. */
  private async assertAllAssignable(tx: Prisma.TransactionClient, userIds: string[]): Promise<void> {
    const assignable = await tx.user.count({
      where: { id: { in: userIds }, role: 'PROJECT_MANAGER', is_active: true },
    });
    if (assignable !== userIds.length) {
      throw validationFailed([
        {
          field: 'userIds',
          messages: ['Pengguna yang baru ditugaskan harus koordinator proyek yang aktif'],
        },
      ]);
    }
  }
}
