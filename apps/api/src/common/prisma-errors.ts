import { Prisma } from '../generated/prisma/client.js';

/** Pelanggaran constraint unik (P2002), mis. email yang sudah dipakai. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
