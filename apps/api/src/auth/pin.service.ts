import { ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { Db } from '../database/db.js';
import type { Prisma, PrismaClient, User } from '../generated/prisma/client.js';
import { afterFailure, lockedFor } from './pin-lockout.js';
import { PasswordService } from './password.service.js';

export function pinLocked(minutes: number): HttpException {
  return new HttpException(`PIN dikunci. Coba lagi dalam ${minutes} menit.`, HttpStatus.TOO_MANY_REQUESTS);
}

/**
 * Hasil memeriksa PIN. Penolakan dikembalikan, bukan dilempar: hitungan salah, jeda, dan
 * catatan auditnya harus tetap tersimpan, sedangkan error di dalam transaksi database
 * membatalkan semuanya. Pemanggil melempar errornya setelah transaksi selesai.
 */
export type PinCheck =
  | { kind: 'ok'; owner: User }
  | { kind: 'wrong' }
  | { kind: 'locked'; minutes: number };

/** Pemilik dibuat seed; tanpa itu aplikasi salah pasang, bukan salah input. */
async function ownerFor(db: Db): Promise<User> {
  const owner = await db.user.findFirst({ orderBy: { created_at: 'asc' } });
  if (!owner) throw new Error('Pemilik belum ada; jalankan seed.');
  return owner;
}

/**
 * PIN pemilik: membuat, memeriksa dengan jeda setelah terlalu banyak salah, mengganti, dan
 * mereset. Hash memakai argon2 lewat PasswordService; PIN sendiri tidak pernah disimpan atau dicatat.
 */
@Injectable()
export class PinService {
  constructor(
    private readonly hashes: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async isSet(db: Db): Promise<boolean> {
    return (await ownerFor(db)).pin_hash !== null;
  }

  /** Hanya berhasil selama PIN belum ada; dari dua permintaan bersamaan, satu yang menang. */
  async setup(tx: Prisma.TransactionClient, pin: string, ip: string | null): Promise<User> {
    const owner = await ownerFor(tx);
    const pin_hash = await this.hashes.hash(pin);
    const { count } = await tx.user.updateMany({ where: { id: owner.id, pin_hash: null }, data: { pin_hash } });
    if (count === 0) throw new ConflictException('PIN sudah dibuat');
    await this.audit.log(tx, { userId: owner.id, action: 'PIN_SETUP', entityType: 'user', entityId: owner.id, ip });
    return tx.user.findUniqueOrThrow({ where: { id: owner.id } });
  }

  async verify(tx: Prisma.TransactionClient, pin: string, ip: string | null, now = new Date()): Promise<PinCheck> {
    return this.check(tx, pin, ip, now);
  }

  /**
   * Mengganti PIN setelah PIN saat ini diperiksa dengan hitungan dan jeda yang sama seperti
   * masuk, supaya formulir ini tidak menjadi jalan menebak PIN. Versi sesi naik, jadi token
   * akses perangkat lain langsung ditolak.
   */
  async change(
    tx: Prisma.TransactionClient,
    currentPin: string,
    newPin: string,
    ip: string | null,
    now = new Date(),
  ): Promise<PinCheck> {
    const check = await this.check(tx, currentPin, ip, now);
    if (check.kind !== 'ok') return check;
    const owner = await tx.user.update({
      where: { id: check.owner.id },
      data: { pin_hash: await this.hashes.hash(newPin), session_version: { increment: 1 } },
    });
    await this.audit.log(tx, { userId: owner.id, action: 'PIN_CHANGE', entityType: 'user', entityId: owner.id, ip });
    return { kind: 'ok', owner };
  }

  /**
   * Memeriksa PIN di bawah kunci baris pemilik, supaya tebakan yang datang bersamaan tetap
   * dihitung satu per satu.
   */
  private async check(tx: Prisma.TransactionClient, pin: string, ip: string | null, now: Date): Promise<PinCheck> {
    const owner = await ownerFor(tx);
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${owner.id} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: owner.id } });
    if (current.pin_hash === null) throw new ConflictException('PIN belum dibuat');

    const event = (action: 'LOGIN_FAILED' | 'LOGIN_LOCKED') =>
      this.audit.log(tx, { userId: owner.id, action, entityType: 'user', entityId: owner.id, ip });

    const minutes = lockedFor(current.pin_locked_until, now);
    if (minutes !== null) {
      await event('LOGIN_LOCKED');
      return { kind: 'locked', minutes };
    }

    if (await this.hashes.verify(current.pin_hash, pin)) {
      const updated = await tx.user.update({
        where: { id: owner.id },
        data: { pin_failed_attempts: 0, pin_locked_until: null },
      });
      return { kind: 'ok', owner: updated };
    }

    const next = afterFailure({ attempts: current.pin_failed_attempts, now });
    await tx.user.update({
      where: { id: owner.id },
      data: { pin_failed_attempts: next.attempts, pin_locked_until: next.lockedUntil },
    });
    await event('LOGIN_FAILED');
    // PIN salah yang memulai jeda dijawab dengan pesan jeda, supaya pemilik tahu harus menunggu.
    const pause = lockedFor(next.lockedUntil, now);
    return pause === null ? { kind: 'wrong' } : { kind: 'locked', minutes: pause };
  }

  /**
   * Untuk perintah `reset-pin` di server: PIN, hitungan, jeda, dan semua sesi dikosongkan dalam
   * satu transaksi bersama catatan auditnya. Versi sesi naik, jadi token akses yang masih
   * beredar langsung ditolak.
   */
  async reset(db: PrismaClient): Promise<boolean> {
    return db.$transaction(async (tx) => {
      const owner = await tx.user.findFirst({ orderBy: { created_at: 'asc' } });
      if (!owner) return false;
      await tx.user.update({
        where: { id: owner.id },
        data: { pin_hash: null, pin_failed_attempts: 0, pin_locked_until: null, session_version: { increment: 1 } },
      });
      await tx.refreshToken.deleteMany({ where: { user_id: owner.id } });
      await this.audit.log(tx, { userId: owner.id, action: 'PIN_RESET', entityType: 'user', entityId: owner.id });
      return true;
    });
  }
}
