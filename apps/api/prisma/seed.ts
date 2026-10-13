import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDatabase } from '../src/database/seed.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL wajib diisi');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  await seedDatabase(prisma);
  console.log('Seed selesai.');
} finally {
  await prisma.$disconnect();
}
