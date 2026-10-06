import { Injectable } from '@nestjs/common';
import type { Db } from '../audit/audit.service.js';
import { TokenService } from './token.service.js';

/** Penyimpanan refresh token. Dipakai modul auth dan modul user (pencabutan sesi). */
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

  /** Mencabut semua sesi aktif milik user. */
  async revokeAll(db: Db, userId: string, now: Date = new Date()): Promise<void> {
    await db.refreshToken.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: now },
    });
  }
}
