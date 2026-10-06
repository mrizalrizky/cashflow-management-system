import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { validationFailed } from '../common/validation.js';
import type { Db } from '../database/db.js';
import { PrismaService } from '../database/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import { Session, toAuthUser } from './auth.types.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

/** Jeda saat token yang baru dirotasi masih boleh muncul lagi (tab lain yang refresh bersamaan). */
const REUSE_GRACE_MS = 10_000;

const SESSION_ENDED = 'Sesi berakhir, silakan login kembali';

function sessionEnded(): UnauthorizedException {
  return new UnauthorizedException(SESSION_ENDED);
}

/**
 * Refresh kalah cepat dari request lain yang memakai token yang sama (biasanya tab lain).
 * Sesinya sendiri masih hidup lewat token baru milik pemenang, jadi cookie tidak boleh dihapus.
 */
export class ConcurrentRefreshException extends UnauthorizedException {
  constructor() {
    super(SESSION_ENDED);
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /** `email` sudah dinormalisasi oleh DTO. */
  async login(email: string, password: string, ip: string | null): Promise<Session> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordMatches = await this.passwords.verify(user?.password_hash ?? null, password);

    if (!user || !passwordMatches || !user.is_active) {
      await this.audit.log(this.prisma, {
        userId: user?.id ?? null,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: user?.id ?? 'unknown',
        after: { email },
        ip,
      });
      // Pesan yang sama untuk semua sebab, supaya tidak membocorkan email mana yang terdaftar.
      throw new UnauthorizedException('Email atau password salah');
    }

    const refreshToken = await this.prisma.$transaction(async (tx) => {
      await this.logUserEvent(tx, 'LOGIN', user.id, ip);
      return this.sessions.create(tx, user.id);
    });
    return this.buildSession(user, refreshToken);
  }

  /** Menukar refresh token dengan yang baru. Token lama langsung tidak berlaku. */
  async refresh(rawToken: string | undefined, ip: string | null): Promise<Session> {
    if (!rawToken) throw sessionEnded();

    const current = await this.prisma.refreshToken.findUnique({
      where: { token_hash: this.tokens.hashRefreshToken(rawToken) },
      include: { user: true },
    });
    const now = new Date();
    if (!current || current.expires_at <= now) throw sessionEnded();

    if (current.revoked_at) {
      const withinGrace = now.getTime() - current.revoked_at.getTime() <= REUSE_GRACE_MS;
      if (withinGrace) throw new ConcurrentRefreshException();
      await this.endSessionsAfterTokenReuse(current.user_id, ip);
      throw sessionEnded();
    }
    if (!current.user.is_active) throw sessionEnded();

    const refreshToken = await this.prisma.$transaction((tx) =>
      this.sessions.rotate(tx, current.id, current.user_id, now),
    );
    if (!refreshToken) throw new ConcurrentRefreshException();

    return this.buildSession(current.user, refreshToken);
  }

  async logout(rawToken: string | undefined, ip: string | null): Promise<void> {
    if (!rawToken) return;
    const hash = this.tokens.hashRefreshToken(rawToken);

    await this.prisma.$transaction(async (tx) => {
      const token = await tx.refreshToken.findUnique({ where: { token_hash: hash } });
      // Token yang sudah dirotasi bukan sesi aktif; tidak ada yang perlu diakhiri.
      if (!token || token.revoked_at) return;

      await this.sessions.end(tx, token.id);
      await this.logUserEvent(tx, 'LOGOUT', token.user_id, ip);
    });
  }

  /** Mengganti password, mengakhiri semua sesi lain, dan membuka sesi baru untuk pemanggil. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ip: string | null,
  ): Promise<Session> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.password_hash, currentPassword))) {
      // Sengaja 400, bukan 401: sesi pemanggil masih sah, hanya isian formulirnya yang salah.
      throw validationFailed([{ field: 'currentPassword', messages: ['Password saat ini salah'] }]);
    }
    if (newPassword === currentPassword) {
      throw validationFailed([
        { field: 'newPassword', messages: ['Password baru harus berbeda dari password saat ini'] },
      ]);
    }

    const password_hash = await this.passwords.hash(newPassword);
    const { updated, refreshToken } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { password_hash, must_change_password: false },
      });
      await this.sessions.endAll(tx, userId);
      await this.logUserEvent(tx, 'CHANGE_PASSWORD', userId, ip);
      return { updated, refreshToken: await this.sessions.create(tx, userId) };
    });
    return this.buildSession(updated, refreshToken);
  }

  /**
   * Token yang sudah lama dirotasi dipakai lagi: dianggap pencurian, semua sesi diakhiri.
   * (Dalam jeda singkat setelah rotasi, itu hanya tab lain yang refresh bersamaan.)
   */
  private async endSessionsAfterTokenReuse(userId: string, ip: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.sessions.endAll(tx, userId);
      await this.logUserEvent(tx, 'TOKEN_REUSE', userId, ip);
    });
  }

  /** Catatan audit untuk kejadian yang dilakukan user terhadap akunnya sendiri. */
  private logUserEvent(
    db: Db,
    action: AuditAction,
    userId: string,
    ip: string | null,
  ): Promise<void> {
    return this.audit.log(db, { userId, action, entityType: 'user', entityId: userId, ip });
  }

  private async buildSession(user: User, refreshToken: string): Promise<Session> {
    return {
      accessToken: await this.tokens.signAccessToken(user.id),
      refreshToken,
      user: toAuthUser(user),
    };
  }
}
