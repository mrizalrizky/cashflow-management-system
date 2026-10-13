import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

export type TestApp = NestExpressApplication;

export interface ProviderOverride {
  provide: string | symbol | (abstract new (...args: never[]) => unknown);
  useValue: unknown;
}

/**
 * Aplikasi utuh dengan konfigurasi yang sama seperti main.ts. `settings` menimpa nilai
 * konfigurasi untuk satu aplikasi ini saja (environment sudah dibaca saat modul dimuat).
 * `overrides` mengganti provider, mis. panggilan ke Claude dengan tiruan.
 */
export async function createTestApp(
  settings: Record<string, unknown> = {},
  overrides: ProviderOverride[] = [],
): Promise<TestApp> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  for (const override of overrides) builder.overrideProvider(override.provide).useValue(override.useValue);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<TestApp>();
  const config = app.get(ConfigService);
  for (const [key, value] of Object.entries(settings)) config.set(key, value);
  configureApp(app);
  await app.init();
  return app;
}
