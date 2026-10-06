import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { validationFailed } from '../common/validation.js';
import { PrismaService } from '../database/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import { Session, toAuthUser } from './auth.types.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

const REUSE_GRACE_MS = 10_000;

function sessionEnded(): UnauthorizedException {
  return new UnauthorizedException('Sesi berakhir, silakan login kembali');
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
      await this.audit.log(tx, {
        userId: user.id,
        action: 'LOGIN',
        entityType: 'user',
        entityId: user.id,
        ip,
      });
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
    if (!current) throw sessionEnded();

    const now = new Date();
    if (current.revoked_at) {
      await this.handleRevokedTokenUse(current.user_id, current.revoked_at, now, ip);
      throw sessionEnded();
    }
    if (current.expires_at <= now || !current.user.is_active) throw sessionEnded();

    const refreshToken = await this.prisma.$transaction(async (tx) => {
      // Bersyarat: bila dua request berpacu, hanya satu yang berhasil merotasi.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: current.id, revoked_at: null },
        data: { revoked_at: now },
      });
      return count === 1 ? this.sessions.create(tx, current.user_id, now) : null;
    });
    if (!refreshToken) throw sessionEnded();

    return this.buildSession(current.user, refreshToken);
  }

  async logout(rawToken: string | undefined, ip: string | null): Promise<void> {
    if (!rawToken) return;
    const hash = this.tokens.hashRefreshToken(rawToken);

    await this.prisma.$transaction(async (tx) => {
      const token = await tx.refreshToken.findUnique({ where: { token_hash: hash } });
      if (!token || token.revoked_at) return;

      await tx.refreshToken.update({ where: { id: token.id }, data: { revoked_at: new Date() } });
      await this.audit.log(tx, {
        userId: token.user_id,
        action: 'LOGOUT',
        entityType: 'user',
        entityId: token.user_id,
        ip,
      });
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
      throw new UnauthorizedException('Password saat ini salah');
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
      await this.sessions.revokeAll(tx, userId);
      await this.audit.log(tx, {
        userId,
        action: 'CHANGE_PASSWORD',
        entityType: 'user',
        entityId: userId,
        ip,
      });
      return { updated, refreshToken: await this.sessions.create(tx, userId) };
    });
    return this.buildSession(updated, refreshToken);
  }

  /**
   * Token yang sudah dirotasi dipakai lagi. Dalam jeda singkat, itu tab lain yang refresh
   * bersamaan dan cukup ditolak. Di luar jeda itu dianggap pencurian: semua sesi dicabut.
   */
  private async handleRevokedTokenUse(
    userId: string,
    revokedAt: Date,
    now: Date,
    ip: string | null,
  ): Promise<void> {
    if (now.getTime() - revokedAt.getTime() <= REUSE_GRACE_MS) return;

    await this.prisma.$transaction(async (tx) => {
      await this.sessions.revokeAll(tx, userId, now);
      await this.audit.log(tx, {
        userId,
        action: 'TOKEN_REUSE',
        entityType: 'user',
        entityId: userId,
        ip,
      });
    });
  }

  private async buildSession(user: User, refreshToken: string): Promise<Session> {
    return {
      accessToken: await this.tokens.signAccessToken(user.id),
      refreshToken,
      user: toAuthUser(user),
    };
  }
}
