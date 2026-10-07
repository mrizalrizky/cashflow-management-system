import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { installBigIntJson } from './common/bigint-json.js';
import { createValidationPipe } from './common/validation.js';
import { DOCS_PATH } from './docs.js';

const NO_FRAMING = { frameguard: { action: 'deny' } } as const;

/** API hanya mengirim JSON dan berkas: browser tidak boleh memuat atau membingkai apa pun darinya. */
const apiHeaders = helmet({
  ...NO_FRAMING,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  },
});

/** Halaman dokumentasi (hanya di luar produksi) perlu memuat skrip dan gayanya sendiri. */
const docsHeaders = helmet({
  ...NO_FRAMING,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      frameAncestors: ["'none'"],
    },
  },
});

function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  const headers = req.path.startsWith(`/${DOCS_PATH}`) ? docsHeaders : apiHeaders;
  headers(req, res, next);
}

/** Dipakai oleh main.ts dan e2e test supaya keduanya berperilaku sama. */
export function configureApp(app: NestExpressApplication): void {
  installBigIntJson();
  app.setGlobalPrefix('api/v1');
  app.use(securityHeaders);
  app.use(cookieParser());
  app.useGlobalPipes(createValidationPipe());

  const config = app.get(ConfigService);

  // Tertutup secara bawaan: tanpa CORS_ORIGINS, browser tidak mengizinkan web lain memanggil API.
  const corsOrigins = config.get<string[]>('CORS_ORIGINS', []);
  if (corsOrigins.length > 0) {
    app.enableCors({ origin: corsOrigins, credentials: true });
  }

  // Di belakang reverse proxy, IP klien asli dibaca dari X-Forwarded-For.
  const trustProxyHops = config.get<number>('TRUST_PROXY_HOPS', 0);
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }

  app.enableShutdownHooks();
}
