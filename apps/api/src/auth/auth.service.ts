import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../database/prisma.service.js';
import type { User } from '../generated/prisma/client.js';
import { Session, toAuthUser } from './auth.types.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

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

  private async buildSession(user: User, refreshToken: string): Promise<Session> {
    return {
      accessToken: await this.tokens.signAccessToken(user.id),
      refreshToken,
      user: toAuthUser(user),
    };
  }
}
