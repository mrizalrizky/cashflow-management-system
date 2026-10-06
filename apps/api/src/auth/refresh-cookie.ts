import type { CookieOptions, Request, Response } from 'express';
import { REFRESH_TOKEN_TTL_MS } from './token.service.js';

export const REFRESH_COOKIE = 'refresh_token';

/** Cookie hanya dikirim ke rute auth, tidak terbaca JavaScript, dan tidak ikut request lintas situs. */
function baseOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure, path: '/api/v1/auth' };
}

export function setRefreshCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(REFRESH_COOKIE, token, { ...baseOptions(secure), maxAge: REFRESH_TOKEN_TTL_MS });
}

export function clearRefreshCookie(res: Response, secure: boolean): void {
  res.clearCookie(REFRESH_COOKIE, baseOptions(secure));
}

export function readRefreshCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
