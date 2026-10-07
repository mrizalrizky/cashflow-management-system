import { randomUUID } from 'node:crypto';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { api, E2eContext, setupE2e } from './e2e-context.js';
import { call, loginAs, Method } from './fixtures.js';

interface Route {
  method: Method;
  /** Pola rute, mis. `/api/v1/transactions/{id}/approve`. */
  pattern: string;
}

/** Rute yang sengaja terbuka tanpa login. Menambah isi daftar ini adalah keputusan keamanan. */
const PUBLIC = [
  'GET /api/v1/health',
  'GET /api/v1/health/live',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
];

/** Rute yang hanya untuk SUPER_ADMIN; peran lain harus ditolak sebelum apa pun diproses. */
const ADMIN_ONLY = [
  'GET /api/v1/users',
  'POST /api/v1/users',
  'GET /api/v1/users/{id}',
  'PATCH /api/v1/users/{id}',
  'POST /api/v1/users/{id}/reset-password',
  'GET /api/v1/accounts',
  'POST /api/v1/accounts',
  'PATCH /api/v1/accounts/{id}',
  'POST /api/v1/categories',
  'PATCH /api/v1/categories/{id}',
  'POST /api/v1/projects',
  'PATCH /api/v1/projects/{id}',
  'PUT /api/v1/projects/{id}/members',
  'POST /api/v1/transactions/transfer',
  'GET /api/v1/dashboard/company',
  'GET /api/v1/audit-logs',
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

    expect(names.length).toBeGreaterThanOrEqual(40);
    expect(names).toEqual(expect.arrayContaining([...PUBLIC, ...ADMIN_ONLY]));
    expect(names).toEqual(
      expect.arrayContaining([
        'GET /api/v1/transactions/export',
        'POST /api/v1/transactions/{id}/attachments',
        'GET /api/v1/attachments/{id}/download',
        'GET /api/v1/projects/{id}/summary',
      ]),
    );
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

  it.each(['PROJECT_MANAGER', 'STAFF'] as const)('refuse every admin-only route to a %s', async (role) => {
    const session = await loginAs(ctx, { role });
    const routes = registeredRoutes(ctx).filter((route) => ADMIN_ONLY.includes(nameOf(route)));
    expect(routes).toHaveLength(ADMIN_ONLY.length);

    const allowed: string[] = [];
    for (const route of routes) {
      const res = await call(ctx, session, route.method, urlOf(route));
      if (res.status !== 403) allowed.push(`${nameOf(route)} -> ${res.status}`);
    }

    expect(allowed).toEqual([]);
  });
});
