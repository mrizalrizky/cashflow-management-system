import { Module } from '@nestjs/common';
import { ProjectAccessService } from './project-access.service.js';
import { ProjectMembersService } from './project-members.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectMembersService, ProjectAccessService],
  // Aturan akses proyek dipakai ulang oleh modul transaksi dan ringkasan.
  exports: [ProjectAccessService],
})
export class ProjectsModule {}
