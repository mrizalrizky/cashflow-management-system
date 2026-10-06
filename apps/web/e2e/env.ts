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

export const apiEnv: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: String(API_PORT),
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    'postgresql://cashflow:cashflow_dev@localhost:5432/cashflow_test',
  JWT_ACCESS_SECRET: 'browser-test-secret-browser-test-secret-1234',
  LOGIN_RATE_LIMIT: '1000',
  SEED_ADMIN_NAME: ADMIN.name,
  SEED_ADMIN_EMAIL: ADMIN.email,
  SEED_ADMIN_PASSWORD: ADMIN.temporaryPassword,
}
