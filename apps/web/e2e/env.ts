import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Pengaturan bersama untuk test browser. Port dan database terpisah dari milik pengembangan. */
export const API_PORT = 3100
export const WEB_PORT = 5174
export const API_DIR = fileURLToPath(new URL('../../api', import.meta.url))

export const ADMIN = {
  name: 'Admin Uji',
  email: 'admin@example.com',
  temporaryPassword: 'sementara-admin-1',
  password: 'password-admin-1',
}

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://cashflow:cashflow_dev@localhost:5432/cashflow_test'

// Dicek di sini, sebelum server dijalankan atau migrasi diterapkan: test browser mengosongkan
// semua tabel, jadi hanya boleh menyentuh database yang namanya diakhiri `_test`.
if (!new URL(DATABASE_URL).pathname.endsWith('_test')) {
  throw new Error('Test browser menolak jalan: nama database harus diakhiri _test')
}

export const apiEnv: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  DATABASE_URL,
  JWT_ACCESS_SECRET: 'browser-test-secret-browser-test-secret-1234',
  LOGIN_RATE_LIMIT: '1000',
  STORAGE_DIR: join(tmpdir(), 'cashflow-browser-test-storage'),
  SEED_ADMIN_NAME: ADMIN.name,
  SEED_ADMIN_EMAIL: ADMIN.email,
  SEED_ADMIN_PASSWORD: ADMIN.temporaryPassword,
}
