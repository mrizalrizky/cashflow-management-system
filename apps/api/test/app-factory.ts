import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

export type TestApp = NestExpressApplication;

/**
 * Aplikasi utuh dengan konfigurasi yang sama seperti main.ts. `settings` menimpa nilai
 * konfigurasi untuk satu aplikasi ini saja (environment sudah dibaca saat modul dimuat).
 */
export async function createTestApp(settings: Record<string, unknown> = {}): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<TestApp>();
  const config = app.get(ConfigService);
  for (const [key, value] of Object.entries(settings)) config.set(key, value);
  configureApp(app);
  await app.init();
  return app;
}
