import { execSync } from 'node:child_process';
import { assertTestDatabaseUrl } from './test-env.js';

export default function setup(): void {
  assertTestDatabaseUrl(process.env.DATABASE_URL);
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
