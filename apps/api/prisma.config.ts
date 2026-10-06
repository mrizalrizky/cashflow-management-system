import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Kosong saat `prisma generate` di CI; perintah migrasi butuh nilai sebenarnya.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
