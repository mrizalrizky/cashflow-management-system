import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { CashflowReportService } from './cashflow-report.service.js';
import { ProjectSummaryResponse, toProjectSummary } from './report.mapper.js';

/** Ringkasan keuangan satu proyek sepanjang umurnya: nilai kontrak, yang diterima, dan biayanya. */
@Injectable()
export class ProjectSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly report: CashflowReportService,
  ) {}

  async summary(user: AuthUser, projectId: string): Promise<ProjectSummaryResponse> {
    // Proyek di luar jangkauan dijawab 404, sama seperti proyek yang tidak ada.
    await this.access.assertCanView(this.prisma, user, projectId);

    const filter = { projectId };
    const [project, totals, costByCategory, pendingCount] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
      this.report.totals(this.prisma, filter),
      this.report.expenseByCategory(this.prisma, filter),
      this.prisma.transaction.count({ where: { project_id: projectId, status: 'PENDING' } }),
    ]);

    return toProjectSummary({
      projectId,
      contractValue: project.contract_value,
      contractValueWithPpn: project.contract_value_with_ppn,
      totals,
      costByCategory,
      pendingCount,
    });
  }
}
