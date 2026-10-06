import { setupDocs } from '../src/docs.js';
import { api, setupE2e } from './e2e-context.js';

describe('API documentation', () => {
  const ctx = setupE2e();

  beforeAll(() => {
    setupDocs(ctx.app);
  });

  it('serves an OpenAPI document that lists the routes, without needing a token', async () => {
    const res = await api(ctx).get('/api/docs-json').expect(200);

    expect(res.body.openapi).toMatch(/^3\./);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/auth/login',
        '/api/v1/users',
        '/api/v1/accounts',
        '/api/v1/accounts/options',
        '/api/v1/categories',
        '/api/v1/projects',
        '/api/v1/projects/{id}/members',
      ]),
    );
    expect(res.body.components.securitySchemes.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('serves the browsable page', async () => {
    const res = await api(ctx).get('/api/docs').redirects(1).expect(200);
    expect(res.text).toContain('swagger-ui');
  });
});
