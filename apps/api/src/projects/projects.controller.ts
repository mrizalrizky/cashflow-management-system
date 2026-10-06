import {
  Body,
  Controller,
  Get,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser, Roles } from '../auth/decorators.js';
import type { Paginated } from '../common/pagination.js';
import {
  CreateProjectDto,
  ListProjectsQueryDto,
  SetProjectMembersDto,
  UpdateProjectDto,
} from './dto/project.dto.js';
import { ProjectMembersService } from './project-members.service.js';
import {
  ProjectOption,
  ProjectResponse,
  toProjectOption,
  toProjectResponse,
} from './project.mapper.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly members: ProjectMembersService,
  ) {}

  /** Semua peran: proyek aktif yang boleh dipilih saat input transaksi. */
  @Get('options')
  async options(@CurrentUser() user: AuthUser): Promise<ProjectOption[]> {
    return (await this.projects.options(user)).map(toProjectOption);
  }

  @Roles('SUPER_ADMIN', 'PROJECT_MANAGER')
  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListProjectsQueryDto,
  ): Promise<Paginated<ProjectResponse>> {
    const page = await this.projects.list(user, query);
    return { ...page, data: page.data.map(toProjectResponse) };
  }

  @Roles('SUPER_ADMIN', 'PROJECT_MANAGER')
  @Get(':id')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProjectResponse> {
    return toProjectResponse(await this.projects.get(user, id));
  }

  @Roles('SUPER_ADMIN')
  @Post()
  async create(
    @CurrentUser() actor: AuthUser,
    @Body() dto: CreateProjectDto,
    @Ip() ip: string,
  ): Promise<ProjectResponse> {
    return toProjectResponse(await this.projects.create(actor, dto, ip));
  }

  @Roles('SUPER_ADMIN')
  @Patch(':id')
  async update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @Ip() ip: string,
  ): Promise<ProjectResponse> {
    return toProjectResponse(await this.projects.update(actor, id, dto, ip));
  }

  @Roles('SUPER_ADMIN')
  @Put(':id/members')
  async setMembers(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetProjectMembersDto,
    @Ip() ip: string,
  ): Promise<ProjectResponse> {
    return toProjectResponse(await this.members.setMembers(actor, id, dto.userIds, ip));
  }
}
