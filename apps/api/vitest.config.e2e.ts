import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// e2e selalu memakai TEST_DATABASE_URL, tidak pernah DATABASE_URL milik dev.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://cashflow:cashflow_dev@localhost:5432/cashflow_test';
process.env.DATABASE_URL = testDatabaseUrl;
process.env.NODE_ENV = 'test';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    env: { DATABASE_URL: testDatabaseUrl, NODE_ENV: 'test' },
  },
});
