import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import type { TestApp } from './app-factory.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('GET /api/v1/health', () => {
  let app: TestApp;

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 when the database answers', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<TestApp>();
    configureApp(app);
    await app.init();

    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('returns 503 with a JSON body when the database is down', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: () => Promise.reject(new Error('connection refused')) })
      .compile();
    app = moduleRef.createNestApplication<TestApp>();
    configureApp(app);
    await app.init();

    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    expect(res.body.statusCode).toBe(503);
    expect(res.body.message).toBe('Database tidak tersedia');
    expect(JSON.stringify(res.body)).not.toContain('connection refused');
  });

  it('reports the application itself as alive without touching the database', async () => {
    const queries = vi.fn<() => Promise<never>>(() => Promise.reject(new Error('connection refused')));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: queries })
      .compile();
    app = moduleRef.createNestApplication<TestApp>();
    configureApp(app);
    await app.init();

    const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);

    expect(res.body).toEqual({ status: 'ok' });
    expect(queries).not.toHaveBeenCalled();
  });

  it('is not served outside the /api/v1 prefix', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<TestApp>();
    configureApp(app);
    await app.init();

    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('answers unknown API routes with a JSON 404', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<TestApp>();
    configureApp(app);
    await app.init();

    const res = await request(app.getHttpServer()).get('/api/v1/tidak-ada').expect(404);
    expect(res.body.statusCode).toBe(404);
  });

  it('returns 503 within a few seconds when the database never answers', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: () => new Promise(() => {}) })
      .compile();
    app = moduleRef.createNestApplication<TestApp>();
    configureApp(app);
    await app.init();

    const started = Date.now();
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    expect(res.body.message).toBe('Database tidak tersedia');
    expect(Date.now() - started).toBeLessThan(4500);
  }, 8000);

  it('returns 503 promptly when the real database client cannot connect', async () => {
    const unreachable = new PrismaService({
      getOrThrow: () => 'postgresql://cashflow:cashflow_dev@127.0.0.1:1/cashflow_test',
    } as unknown as ConfigService);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(unreachable)
      .compile();
    app = moduleRef.createNestApplication<TestApp>();
    configureApp(app);
    await app.init();

    const started = Date.now();
    await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    expect(Date.now() - started).toBeLessThan(4500);
  }, 8000);
});
