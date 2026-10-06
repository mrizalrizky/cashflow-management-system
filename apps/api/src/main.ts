import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { setupDocs } from './docs.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  const config = app.get(ConfigService);
  // Dokumentasi API tidak dibuka di produksi.
  if (config.get<string>('NODE_ENV') !== 'production') {
    setupDocs(app);
  }
  await app.listen(config.getOrThrow<number>('PORT'));
}
await bootstrap();
