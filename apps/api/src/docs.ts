import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const DOCS_PATH = 'api/docs';

/**
 * Dokumentasi API untuk dibaca manusia, di `/api/docs` (JSON di `/api/docs-json`).
 * Hanya dipasang di luar produksi; lihat main.ts.
 */
export function setupDocs(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Arus Kas API')
    .setDescription(
      'Semua rute memakai access token (Bearer) kecuali login, refresh, logout, dan health. ' +
        'Nominal uang dikirim dan diterima sebagai string digit.',
    )
    .setVersion('1')
    .addBearerAuth()
    .addSecurityRequirements('bearer')
    .build();

  SwaggerModule.setup(DOCS_PATH, app, SwaggerModule.createDocument(app, config));
}
