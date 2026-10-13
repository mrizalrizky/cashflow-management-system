import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service.js';
import { toAuthUser } from './auth.types.js';
import { AuthenticatedRequest, IS_PUBLIC } from './decorators.js';
import { TokenService } from './token.service.js';

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
    const userId = await this.resolveUserId(request.headers.authorization);

    // Dibaca ulang tiap request supaya sesi berakhir seketika setelah PIN direset.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw invalidSession();

    request.user = toAuthUser(user);

    return true;
  }

  private async resolveUserId(authorization: string | undefined): Promise<string> {
    const token = extractBearerToken(authorization);
    if (!token) throw invalidSession();
    try {
      return (await this.tokens.verifyAccessToken(token)).sub;
    } catch {
      throw invalidSession();
    }
  }
}

function invalidSession(): UnauthorizedException {
  return new UnauthorizedException('Sesi tidak valid');
}
