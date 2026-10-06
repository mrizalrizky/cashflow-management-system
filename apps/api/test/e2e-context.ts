import request from 'supertest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createTestApp, TestApp } from './app-factory.js';
import { createTestPrisma, resetDb } from './test-db.js';

export interface E2eContext {
  app: TestApp;
  prisma: PrismaClient;
}

/**
 * Satu aplikasi dan satu klien database per file test, dengan database dikosongkan
 * sebelum tiap test. Panggil di dalam `describe`.
 */
export function setupE2e(): E2eContext {
  const ctx = {} as E2eContext;

  beforeAll(async () => {
    ctx.app = await createTestApp();
    ctx.prisma = createTestPrisma();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.app.close();
    await ctx.prisma.$disconnect();
  });

  return ctx;
}

export function api(ctx: E2eContext) {
  return request(ctx.app.getHttpServer());
}
