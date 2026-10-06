import { Injectable } from '@nestjs/common';
import type { Db } from '../database/db.js';
import { TokenService } from './token.service.js';

/**
 * Penyimpanan refresh token. Dipakai modul auth dan modul user.
 *
 * Sesi yang diakhiri (logout, ganti password, reset, ganti peran, nonaktif) dihapus barisnya.
 * `revoked_at` hanya diisi oleh rotasi, sehingga token ber-`revoked_at` yang muncul lagi
 * pasti token lama yang sudah ditukar, bukan sesi yang sengaja diakhiri.
 */
@Injectable()
export class SessionService {
  constructor(private readonly tokens: TokenService) {}

  /** Menyimpan refresh token baru dan mengembalikan nilai mentahnya untuk cookie. */
  async create(db: Db, userId: string, now: Date = new Date()): Promise<string> {
    const { token, hash } = this.tokens.generateRefreshToken();
    await db.refreshToken.create({
      data: { user_id: userId, token_hash: hash, expires_at: this.tokens.refreshExpiry(now) },
    });
    return token;
  }

  /**
   * Menukar token lama dengan yang baru. Mengembalikan null bila token itu sudah
   * dirotasi request lain, sehingga dari dua request yang berpacu hanya satu yang menang.
   */
  async rotate(db: Db, tokenId: string, userId: string, now: Date): Promise<string | null> {
    const { count } = await db.refreshToken.updateMany({
      where: { id: tokenId, revoked_at: null },
      data: { revoked_at: now },
    });
    return count === 1 ? this.create(db, userId, now) : null;
  }

  /** Mengakhiri satu sesi. */
  async end(db: Db, tokenId: string): Promise<void> {
    await db.refreshToken.deleteMany({ where: { id: tokenId } });
  }

  /** Mengakhiri semua sesi milik user. */
  async endAll(db: Db, userId: string): Promise<void> {
    await db.refreshToken.deleteMany({ where: { user_id: userId } });
  }
}
