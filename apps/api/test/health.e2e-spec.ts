import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('GET /api/v1/health', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 when the database answers', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
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
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(503);
    expect(res.body.statusCode).toBe(503);
    expect(res.body.message).toBe('Database tidak tersedia');
    expect(JSON.stringify(res.body)).not.toContain('connection refused');
  });

  it('is not served outside the /api/v1 prefix', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('answers unknown API routes with a JSON 404', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const res = await request(app.getHttpServer()).get('/api/v1/tidak-ada').expect(404);
    expect(res.body.statusCode).toBe(404);
  });
});
