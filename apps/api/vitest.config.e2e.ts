import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// e2e selalu memakai TEST_DATABASE_URL, tidak pernah DATABASE_URL milik dev.
const testEnv = {
  NODE_ENV: 'test',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://cashflow:cashflow_dev@localhost:5432/cashflow_test',
  JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-1234',
  // Cukup tinggi supaya test yang sering login tidak terkena batas.
  LOGIN_RATE_LIMIT: '1000',
  // Berkas bukti dari test tidak boleh bercampur dengan milik pengembangan.
  STORAGE_DIR: join(tmpdir(), 'cashflow-e2e-storage'),
};
Object.assign(process.env, testEnv);

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    // Database test bisa berada jauh (mis. Neon): tiap permintaan butuh ratusan milidetik.
    // Test yang kehabisan waktu meninggalkan permintaan yang masih berjalan saat test berikutnya
    // mengosongkan tabel, jadi batasnya dibuat longgar.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: testEnv,
  },
});
