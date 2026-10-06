import { Body, Controller, Get, HttpCode, Ip, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthUser, Session } from './auth.types.js';
import { AllowPendingPasswordChange, CurrentUser, Public } from './decorators.js';
import { LoginDto } from './dto/login.dto.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie.js';

interface SessionResponse {
  accessToken: string;
  user: AuthUser;
}

@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.secureCookies = config.get<string>('NODE_ENV') === 'production';
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return this.respondWithSession(res, await this.auth.login(dto.email, dto.password, ip));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return this.respondWithSession(res, await this.auth.refresh(readRefreshCookie(req), ip));
  }

  /** Publik karena access token boleh saja sudah kedaluwarsa saat user logout. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(req), ip);
    clearRefreshCookie(res, this.secureCookies);
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() user: AuthUser): { user: AuthUser } {
    return { user };
  }

  /** Refresh token hanya keluar lewat cookie, tidak pernah lewat body. */
  private respondWithSession(res: Response, session: Session): SessionResponse {
    setRefreshCookie(res, session.refreshToken, this.secureCookies);
    return { accessToken: session.accessToken, user: session.user };
  }
}
