import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth.types.js';

export const IS_PUBLIC = 'auth:isPublic';

export type AuthenticatedRequest = Request & { user: AuthUser };

/** Rute tanpa autentikasi. Semua rute lain wajib membawa access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
