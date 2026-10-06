import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ALGORITHM = 'HS256';

export interface AccessTokenPayload {
  sub: string;
}

export interface RefreshToken {
  /** Nilai yang dikirim ke klien lewat cookie. */
  token: string;
  /** Nilai yang disimpan di database. */
  hash: string;
}

@Injectable()
export class TokenService {
  private readonly secret: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  signAccessToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId },
      { secret: this.secret, algorithm: ALGORITHM, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
  }

  /** Melempar error bila token tidak sah atau kedaluwarsa. */
  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.secret,
      algorithms: [ALGORITHM],
    });
  }

  generateRefreshToken(): RefreshToken {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  refreshExpiry(now: Date = new Date()): Date {
    return new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
  }
}
