import { formatCalendarDate } from '../common/calendar-date.js';
import { fromMoney } from '../common/money.js';
import type { Prisma, Project, ProjectStatus } from '../generated/prisma/client.js';

/** Proyek selalu dimuat bersama koordinatornya, terurut nama; hanya kolom yang ditampilkan. */
export const PROJECT_INCLUDE = {
  members: {
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: 'asc' } },
  },
} satisfies Prisma.ProjectInclude;

export type ProjectWithMembers = Prisma.ProjectGetPayload<{ include: typeof PROJECT_INCLUDE }>;

export interface ProjectMemberResponse {
  id: string;
  name: string;
  email: string;
}

export interface ProjectResponse {
  id: string;
  code: string;
  name: string;
  clientName: string;
  contractValue: string;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  members: ProjectMemberResponse[];
  createdAt: string;
  updatedAt: string;
}

/** Untuk dropdown input transaksi. */
export interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

export function toProjectResponse(project: ProjectWithMembers): ProjectResponse {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    clientName: project.client_name,
    contractValue: fromMoney(project.contract_value),
    status: project.status,
    startDate: project.start_date ? formatCalendarDate(project.start_date) : null,
    endDate: project.end_date ? formatCalendarDate(project.end_date) : null,
    notes: project.notes,
    members: project.members.map(({ user }) => user),
    createdAt: project.created_at.toISOString(),
    updatedAt: project.updated_at.toISOString(),
  };
}

export function toProjectOption(project: Pick<Project, 'id' | 'code' | 'name'>): ProjectOption {
  return { id: project.id, code: project.code, name: project.name };
}
