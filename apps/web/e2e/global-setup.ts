import { execSync } from 'node:child_process'
import { API_DIR, apiEnv } from './env'

/** Migrasi lalu isi ulang database uji sebelum test browser berjalan. */
export default function globalSetup(): void {
  const options = { cwd: API_DIR, env: { ...process.env, ...apiEnv }, stdio: 'inherit' as const }
  execSync('npx prisma migrate deploy', options)
  // Skrip ini sendiri menolak jalan bila nama database tidak diakhiri `_test`.
  execSync('npx tsx scripts/e2e-prepare.ts', options)
}
