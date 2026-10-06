import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import type { Db } from '../database/db.js';
import type { Prisma } from '../generated/prisma/client.js';

export function projectNotFound(): NotFoundException {
  return new NotFoundException('Proyek tidak ditemukan');
}

const NOTHING: Prisma.ProjectWhereInput = { id: { in: [] } };

/**
 * Satu-satunya tempat aturan "proyek mana yang boleh dilihat siapa". Semua modul yang
 * menyentuh data proyek (proyek, transaksi, ringkasan, ekspor) memakai filter dari sini,
 * supaya pembatasan berlaku di query dan bukan hanya di tampilan.
 */
@Injectable()
export class ProjectAccessService {
  /** Proyek yang boleh dilihat: semua untuk SUPER_ADMIN, yang ditugaskan untuk koordinator. */
  scope(user: AuthUser): Prisma.ProjectWhereInput {
    switch (user.role) {
      case 'SUPER_ADMIN':
        return {};
      case 'PROJECT_MANAGER':
        return this.assignedTo(user);
      default:
        return NOTHING;
    }
  }

  /**
   * Proyek yang boleh dipilih saat input transaksi: hanya yang aktif. Staf boleh memilih
   * proyek aktif mana pun (ia hanya melihat kode dan namanya); koordinator hanya proyeknya.
   */
  optionsScope(user: AuthUser): Prisma.ProjectWhereInput {
    switch (user.role) {
      case 'SUPER_ADMIN':
      case 'STAFF':
        return { status: 'ACTIVE' };
      case 'PROJECT_MANAGER':
        return { ...this.assignedTo(user), status: 'ACTIVE' };
      default:
        return NOTHING;
    }
  }

  /** Proyek di luar jangkauan dijawab sama seperti proyek yang tidak ada. */
  async assertCanView(db: Db, user: AuthUser, projectId: string): Promise<void> {
    const project = await db.project.findFirst({
      where: { AND: [{ id: projectId }, this.scope(user)] },
      select: { id: true },
    });
    if (!project) throw projectNotFound();
  }

  private assignedTo(user: AuthUser): Prisma.ProjectWhereInput {
    return { members: { some: { user_id: user.id } } };
  }
}
