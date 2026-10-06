import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/** Klien biasa atau klien transaksi, supaya sebuah operasi bisa ikut transaksi pemanggilnya. */
export type Db = PrismaClient | Prisma.TransactionClient;
