import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service.js';
import { toAuthUser } from './auth.types.js';
import { AuthenticatedRequest, IS_PUBLIC } from './decorators.js';
import { AccessTokenPayload, TokenService } from './token.service.js';

function extractBearerToken(header: string | undefined): string | null {
  const [scheme, token] = (header ?? '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const payload = await this.resolvePayload(request.headers.authorization);

    // Dibaca ulang tiap request: setelah PIN diganti atau direset, versi sesinya naik dan token
    // lama ditolak pada permintaan berikutnya, tidak menunggu kedaluwarsa.
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.pin_hash === null || user.session_version !== payload.ver) throw invalidSession();

    request.user = toAuthUser(user);

    return true;
  }

  private async resolvePayload(authorization: string | undefined): Promise<AccessTokenPayload> {
    const token = extractBearerToken(authorization);
    if (!token) throw invalidSession();
    try {
      return await this.tokens.verifyAccessToken(token);
    } catch {
      throw invalidSession();
    }
  }
}

function invalidSession(): UnauthorizedException {
  return new UnauthorizedException('Sesi tidak valid');
}
