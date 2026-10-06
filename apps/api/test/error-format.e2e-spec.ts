import { api, setupE2e } from './e2e-context.js';

describe('error format', () => {
  const ctx = setupE2e();

  it('answers an unknown API route with exactly statusCode and message', async () => {
    const res = await api(ctx).get('/api/v1/tidak-ada').expect(404);
    expect(Object.keys(res.body).sort()).toEqual(['message', 'statusCode']);
    expect(res.body.statusCode).toBe(404);
    expect(typeof res.body.message).toBe('string');
  });
});
