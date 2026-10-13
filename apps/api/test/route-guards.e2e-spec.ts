import { randomUUID } from 'node:crypto';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { api, E2eContext, setupE2e } from './e2e-context.js';
import type { Method } from './fixtures.js';

interface Route {
  method: Method;
  /** Pola rute, mis. `/api/v1/transactions/{id}/approve`. */
  pattern: string;
}

/** Rute yang sengaja terbuka tanpa login. Menambah isi daftar ini adalah keputusan keamanan. */
const PUBLIC = [
  'GET /api/v1/health',
  'GET /api/v1/health/live',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
];

const METHODS = new Set<string>(['get', 'post', 'patch', 'put', 'delete']);

function nameOf(route: Route): string {
  return `${route.method.toUpperCase()} ${route.pattern}`;
}

/** Semua rute yang didaftarkan aplikasi, dibaca dari dokumen OpenAPI yang dibuat Nest sendiri. */
function registeredRoutes(ctx: E2eContext): Route[] {
  const document = SwaggerModule.createDocument(ctx.app, new DocumentBuilder().build());
  return Object.entries(document.paths).flatMap(([pattern, operations]) =>
    Object.keys(operations)
      .filter((method) => METHODS.has(method))
      .map((method) => ({ method: method as Method, pattern })),
  );
}

/** Alamat nyata untuk sebuah pola: tiap parameter diganti id acak yang sah. */
function urlOf(route: Route): string {
  return route.pattern.replace(/\{[^}]+\}/g, () => randomUUID());
}

describe('route guards', () => {
  const ctx = setupE2e();

  it('finds the routes of every module', () => {
    const names = registeredRoutes(ctx).map(nameOf);

    expect(names.length).toBeGreaterThanOrEqual(20);
    expect(names).toEqual(expect.arrayContaining(PUBLIC));
    expect(names).toEqual(
      expect.arrayContaining([
        'GET /api/v1/transactions/export',
        'POST /api/v1/transactions/{id}/attachments',
        'GET /api/v1/attachments/{id}/download',
      ]),
    );
  });

  it('has no approval routes in the personal edition', () => {
    const names = registeredRoutes(ctx).map(nameOf);
    for (const removed of ['approve', 'reject', 'cancel']) {
      expect(names).not.toContain(`POST /api/v1/transactions/{id}/${removed}`);
    }
  });

  it('has no user management routes in the personal edition', () => {
    expect(registeredRoutes(ctx).map(nameOf).filter((name) => name.includes('/users'))).toEqual([]);
  });

  it('has no project routes in the personal edition', () => {
    expect(registeredRoutes(ctx).map(nameOf).filter((name) => name.includes('/projects'))).toEqual([]);
  });

  it('refuse every route but the public ones to a visitor without a token', async () => {
    const open: string[] = [];
    for (const route of registeredRoutes(ctx)) {
      if (PUBLIC.includes(nameOf(route))) continue;
      const res = await api(ctx)[route.method](urlOf(route));
      if (res.status !== 401) open.push(`${nameOf(route)} -> ${res.status}`);
    }

    expect(open).toEqual([]);
  });

  it('refuse a token that is not ours on every route but the public ones', async () => {
    const open: string[] = [];
    for (const route of registeredRoutes(ctx)) {
      if (PUBLIC.includes(nameOf(route))) continue;
      const res = await api(ctx)[route.method](urlOf(route)).set('Authorization', 'Bearer bukan.token.kami');
      if (res.status !== 401) open.push(`${nameOf(route)} -> ${res.status}`);
    }

    expect(open).toEqual([]);
  });
});
