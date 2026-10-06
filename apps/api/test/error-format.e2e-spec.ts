import request from 'supertest';
import { createTestApp, TestApp } from './app-factory.js';

describe('error format', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an unknown API route with exactly statusCode and message', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/tidak-ada').expect(404);
    expect(Object.keys(res.body).sort()).toEqual(['message', 'statusCode']);
    expect(res.body.statusCode).toBe(404);
    expect(typeof res.body.message).toBe('string');
  });
});
