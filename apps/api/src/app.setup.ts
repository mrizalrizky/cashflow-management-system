import { INestApplication, ValidationPipe } from '@nestjs/common';
import { installBigIntJson } from './common/bigint-json.js';

/** Dipakai oleh main.ts dan e2e test supaya keduanya berperilaku sama. */
export function configureApp(app: INestApplication): void {
  installBigIntJson();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableShutdownHooks();
}
