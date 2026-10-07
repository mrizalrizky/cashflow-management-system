import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../database/prisma.service.js';

const HEALTH_TIMEOUT_MS = 3000;

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aplikasinya sendiri hidup, tanpa menyentuh database. Dipakai pemeriksaan kesehatan
   * container, yang berjalan tiap beberapa detik: bila ikut bertanya ke database, database
   * terkelola (Neon) tidak pernah menganggur dan terus ditagih.
   */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Aplikasi dan databasenya; untuk diperiksa orang atau pemantau, bukan tiap beberapa detik. */
  @Get()
  async check(): Promise<{ status: 'ok'; database: 'up' }> {
    let timer: NodeJS.Timeout | undefined;
    // Database yang macet (bukan mati) tidak pernah menolak query, jadi dibatasi waktu.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('health check timeout')), HEALTH_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
    } catch {
      throw new ServiceUnavailableException('Database tidak tersedia');
    } finally {
      clearTimeout(timer);
    }
    return { status: 'ok', database: 'up' };
  }
}
