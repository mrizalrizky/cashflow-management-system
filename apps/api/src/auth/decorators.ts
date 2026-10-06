import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../generated/prisma/client.js';
import type { AuthUser } from './auth.types.js';

export const IS_PUBLIC = 'auth:isPublic';
export const ROLES = 'auth:roles';
export const ALLOW_PENDING_PASSWORD_CHANGE = 'auth:allowPendingPasswordChange';

export type AuthenticatedRequest = Request & { user: AuthUser };

/** Rute tanpa autentikasi. Semua rute lain wajib membawa access token. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Membatasi rute untuk peran tertentu. Tanpa decorator ini, semua peran boleh. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Rute yang tetap boleh diakses selama user masih wajib ganti password. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
