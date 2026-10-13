import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import type { Db } from '../database/db.js';
import { PrismaService } from '../database/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import { validationFailed } from '../common/validation.js';
import { Session, toAuthUser } from './auth.types.js';
import { PinService, pinLocked } from './pin.service.js';
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
    private readonly pins: PinService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  pinStatus(): Promise<{ pinSet: boolean }> {
    return this.pins.isSet(this.prisma).then((pinSet) => ({ pinSet }));
  }

  /** PIN pertama; langsung membuka sesi. */
  async setupPin(pin: string, ip: string | null): Promise<Session> {
    const { owner, refreshToken } = await this.prisma.$transaction(async (tx) => {
      const owner = await this.pins.setup(tx, pin, ip);
      return { owner, refreshToken: await this.sessions.create(tx, owner.id) };
    });
    return this.buildSession(owner, refreshToken);
  }

  async login(pin: string, ip: string | null): Promise<Session> {
    // Penolakan dilempar setelah transaksi selesai, supaya hitungan salah dan auditnya tersimpan.
    const outcome = await this.prisma.$transaction(async (tx) => {
      const check = await this.pins.verify(tx, pin, ip);
      if (check.kind !== 'ok') return check;
      await this.logUserEvent(tx, 'LOGIN', check.owner.id, ip);
      return { ...check, refreshToken: await this.sessions.create(tx, check.owner.id) };
    });
    if (outcome.kind === 'wrong') throw new UnauthorizedException('PIN salah');
    if (outcome.kind === 'locked') throw pinLocked(outcome.minutes);
    return this.buildSession(outcome.owner, outcome.refreshToken);
  }

  /** Mengganti PIN, mengakhiri semua sesi lain, dan membuka sesi baru untuk pemanggil. */
  async changePin(ownerId: string, currentPin: string, newPin: string, ip: string | null): Promise<Session> {
    if (newPin === currentPin) {
      throw validationFailed([{ field: 'newPin', messages: ['PIN baru harus berbeda dari PIN saat ini'] }]);
    }
    // Seperti masuk: penolakan dilempar setelah transaksi, supaya hitungan salah tersimpan.
    const outcome = await this.prisma.$transaction(async (tx) => {
      const check = await this.pins.change(tx, currentPin, newPin, ip);
      if (check.kind !== 'ok') return check;
      await this.sessions.endAll(tx, ownerId);
      return { ...check, refreshToken: await this.sessions.create(tx, ownerId) };
    });
    // Sengaja 400, bukan 401: sesi pemanggil masih sah, hanya isian formulirnya yang salah.
    if (outcome.kind === 'wrong') throw validationFailed([{ field: 'currentPin', messages: ['PIN saat ini salah'] }]);
    if (outcome.kind === 'locked') throw pinLocked(outcome.minutes);
    return this.buildSession(outcome.owner, outcome.refreshToken);
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
      accessToken: await this.tokens.signAccessToken(user.id, user.session_version),
      refreshToken,
      user: toAuthUser(user),
    };
  }
}
