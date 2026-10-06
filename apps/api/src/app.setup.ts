import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { installBigIntJson } from './common/bigint-json.js';
import { createValidationPipe } from './common/validation.js';

/** Dipakai oleh main.ts dan e2e test supaya keduanya berperilaku sama. */
export function configureApp(app: NestExpressApplication): void {
  installBigIntJson();
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());
  app.useGlobalPipes(createValidationPipe());

  // Di belakang reverse proxy, IP klien asli dibaca dari X-Forwarded-For.
  const trustProxyHops = app.get(ConfigService).get<number>('TRUST_PROXY_HOPS', 0);
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  app.enableShutdownHooks();
}
