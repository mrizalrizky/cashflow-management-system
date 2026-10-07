import request from 'supertest';
import { validateEnv } from '../src/config/env.validation.js';
import { setupDocs } from '../src/docs.js';
import { createTestApp, TestApp } from './app-factory.js';
import { api, setupE2e } from './e2e-context.js';
import { HEALTH, USERS } from './routes.js';

const ALLOWED = 'https://kas.example.com';
const STRANGER = 'https://lain.example';
const BASE_ENV = {
  DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('security headers', () => {
  const ctx = setupE2e();

  beforeAll(() => {
    setupDocs(ctx.app);
  });

  it.each([
    ['a public route', HEALTH, 200],
    ['a refused request', USERS, 401],
    ['a route that does not exist', '/api/v1/tidak-ada', 404],
  ])('are sent with %s', async (_label, path, status) => {
    const res = await api(ctx).get(path).expect(status);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    // API hanya mengirim JSON dan berkas: tidak ada yang boleh dimuat atau dibingkai dari sini.
    expect(res.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
    // Kebijakan HTTPS milik proxy di depan (Cloudflare), yang tahu nama host-nya.
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('let the documentation page load its own scripts, and nothing from elsewhere', async () => {
    const res = await api(ctx).get('/api/docs/').expect(200);

    expect(res.text).toContain('swagger-ui');
    const policy = res.headers['content-security-policy'] as string;
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('*');
  });
});

describe('CORS', () => {
  describe('by default', () => {
    const ctx = setupE2e();

    it('approves no other origin', async () => {
      const res = await api(ctx).get(HEALTH).set('Origin', STRANGER).expect(200);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('approves no preflight', async () => {
      const res = await api(ctx)
        .options(USERS)
        .set('Origin', STRANGER)
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-methods']).toBeUndefined();
    });
  });

  describe('with CORS_ORIGINS set', () => {
    let app: TestApp;

    beforeAll(async () => {
      app = await createTestApp({ CORS_ORIGINS: [ALLOWED, 'https://admin.example.com'] });
    });

    afterAll(async () => {
      await app.close();
    });

    it('approves a listed origin, with credentials, and never a wildcard', async () => {
      const res = await request(app.getHttpServer()).get(HEALTH).set('Origin', ALLOWED).expect(200);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('approves the preflight of a listed origin', async () => {
      const res = await request(app.getHttpServer())
        .options(USERS)
        .set('Origin', ALLOWED)
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    });

    it('still approves no other origin', async () => {
      const res = await request(app.getHttpServer()).get(HEALTH).set('Origin', STRANGER).expect(200);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('CORS_ORIGINS setting', () => {
    it('is empty unless set, and reads a comma-separated list', () => {
      expect(validateEnv(BASE_ENV).CORS_ORIGINS).toEqual([]);
      expect(validateEnv({ ...BASE_ENV, CORS_ORIGINS: '' }).CORS_ORIGINS).toEqual([]);
      expect(
        validateEnv({ ...BASE_ENV, CORS_ORIGINS: ' https://kas.example.com ,http://localhost:5173' }).CORS_ORIGINS,
      ).toEqual(['https://kas.example.com', 'http://localhost:5173']);
    });

    it.each(['*', 'https://*.example.com', 'kas.example.com', 'https://kas.example.com/app', 'https://a.example, *'])(
      'refuses %j at start-up',
      (value) => {
        expect(() => validateEnv({ ...BASE_ENV, CORS_ORIGINS: value })).toThrow('CORS_ORIGINS');
      },
    );
  });
});
