import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { lockForTransaction, LOCKS } from '../common/advisory-lock.js';
import { currentYearInJakarta, parseCalendarDate } from '../common/calendar-date.js';
import { toMoney } from '../common/money.js';
import { Paginated, paginated, toSkipTake } from '../common/pagination.js';
import { containsText } from '../common/search.js';
import { validationFailed } from '../common/validation.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma, Project } from '../generated/prisma/client.js';
import type { CreateProjectDto, ListProjectsQueryDto, UpdateProjectDto } from './dto/project.dto.js';
import { ProjectAccessService, projectNotFound } from './project-access.service.js';
import { PROJECT_INCLUDE, ProjectWithMembers } from './project.mapper.js';

const ENTITY = 'project';
const NOT_FILLED = 0n;
const CODE_DIGITS = 3;

function toWhere(query: ListProjectsQueryDto): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.search) {
    const text = containsText(query.search);
    where.OR = [{ code: text }, { name: text }, { client_name: text }];
  }
  return where;
}

/** Nilai berikut PPN boleh belum diisi (0), tetapi tidak pernah lebih kecil dari nilai kontraknya. */
function assertContractValues(contractValue: bigint, withPpn: bigint): void {
  if (withPpn !== NOT_FILLED && withPpn < contractValue) {
    throw validationFailed([
      {
        field: 'contractValueWithPpn',
        messages: ['Nilai kontrak + PPN tidak boleh lebih kecil dari nilai kontrak'],
      },
    ]);
  }
}

/** `undefined` berarti tidak diubah, `null` berarti dikosongkan. */
function toNullableDate(value: string | null | undefined): Date | null | undefined {
  return value === undefined || value === null ? value : parseCalendarDate(value);
}

function assertDateRange(start: Date | null, end: Date | null): void {
  if (start && end && end < start) {
    throw validationFailed([
      { field: 'endDate', messages: ['Tanggal selesai tidak boleh sebelum tanggal mulai'] },
    ]);
  }
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: ListProjectsQueryDto): Promise<Paginated<ProjectWithMembers>> {
    const where: Prisma.ProjectWhereInput = { AND: [this.access.scope(user), toWhere(query)] };
    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        include: PROJECT_INCLUDE,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
      }),
      this.prisma.project.count({ where }),
    ]);
    return paginated(projects, total, query);
  }

  async get(user: AuthUser, id: string): Promise<ProjectWithMembers> {
    const project = await this.prisma.project.findFirst({
      where: { AND: [{ id }, this.access.scope(user)] },
      include: PROJECT_INCLUDE,
    });
    if (!project) throw projectNotFound();
    return project;
  }

  options(user: AuthUser): Promise<Pick<Project, 'id' | 'code' | 'name'>[]> {
    return this.prisma.project.findMany({
      where: this.access.optionsScope(user),
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, name: true },
    });
  }

  async create(actor: AuthUser, dto: CreateProjectDto, ip: string | null): Promise<ProjectWithMembers> {
    const start_date = toNullableDate(dto.startDate) ?? null;
    const end_date = toNullableDate(dto.endDate) ?? null;
    assertDateRange(start_date, end_date);
    const contract_value = toMoney(dto.contractValue ?? '0');
    const contract_value_with_ppn = toMoney(dto.contractValueWithPpn ?? '0');
    assertContractValues(contract_value, contract_value_with_ppn);

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          code: await this.nextCode(tx),
          name: dto.name,
          client_name: dto.clientName,
          contract_value,
          contract_value_with_ppn,
          start_date,
          end_date,
          notes: dto.notes || null,
        },
        include: PROJECT_INCLUDE,
      });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'CREATE',
        entityType: ENTITY,
        entityId: project.id,
        after: withoutMembers(project),
        ip,
      });
      return project;
    });
  }

  async update(
    actor: AuthUser,
    id: string,
    dto: UpdateProjectDto,
    ip: string | null,
  ): Promise<ProjectWithMembers> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.project.findUnique({ where: { id } });
      if (!before) throw projectNotFound();

      const start_date = toNullableDate(dto.startDate);
      const end_date = toNullableDate(dto.endDate);
      // Rentang dicek terhadap nilai akhir: tanggal yang tidak dikirim memakai nilai tersimpan.
      assertDateRange(
        start_date === undefined ? before.start_date : start_date,
        end_date === undefined ? before.end_date : end_date,
      );

      // Sama seperti tanggal: nilai yang tidak dikirim memakai nilai tersimpan.
      const contract_value =
        dto.contractValue === undefined ? before.contract_value : toMoney(dto.contractValue);
      const contract_value_with_ppn =
        dto.contractValueWithPpn === undefined
          ? before.contract_value_with_ppn
          : toMoney(dto.contractValueWithPpn);
      assertContractValues(contract_value, contract_value_with_ppn);

      const project = await tx.project.update({
        where: { id },
        data: {
          name: dto.name,
          client_name: dto.clientName,
          contract_value,
          contract_value_with_ppn,
          status: dto.status,
          start_date,
          end_date,
          notes: dto.notes === undefined ? undefined : dto.notes || null,
        },
        include: PROJECT_INCLUDE,
      });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'UPDATE',
        entityType: ENTITY,
        entityId: id,
        before,
        after: withoutMembers(project),
        ip,
      });
      return project;
    });
  }

  /** Kode berikutnya untuk tahun berjalan, mis. PRJ-2026-001. */
  private async nextCode(tx: Prisma.TransactionClient): Promise<string> {
    // Tanpa kunci, dua proyek yang dibuat bersamaan membaca nomor terakhir yang sama.
    await lockForTransaction(tx, LOCKS.projectCode);

    const prefix = `PRJ-${currentYearInJakarta()}-`;
    // Dibaca sebagai angka, bukan teks: sebagai teks "…-1000" terurut sebelum "…-999".
    // Pola dibatasi 9 digit supaya CAST ke INTEGER tidak pernah meluap.
    const rows = await tx.$queryRaw<{ last: number | null }[]>`
      SELECT MAX(CAST(split_part(code, '-', 3) AS INTEGER)) AS last
      FROM projects
      WHERE code ~ ${`^${prefix}[0-9]{1,9}$`}`;
    const next = (rows[0]?.last ?? 0) + 1;
    return `${prefix}${String(next).padStart(CODE_DIGITS, '0')}`;
  }
}

/** Baris proyek saja untuk audit; perubahan anggota dicatat tersendiri. */
function withoutMembers({ members: _members, ...project }: ProjectWithMembers): Project {
  return project;
}
