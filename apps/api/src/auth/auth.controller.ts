import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, ConcurrentRefreshException } from './auth.service.js';
import type { AuthUser, Session } from './auth.types.js';
import { AllowPendingPasswordChange, CurrentUser, Public } from './decorators.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
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
  @UseGuards(ThrottlerGuard)
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
    try {
      return this.respondWithSession(res, await this.auth.refresh(readRefreshCookie(req), ip));
    } catch (error) {
      // Supaya browser berhenti mengirim token yang sudah tidak berlaku. Kecuali bila hanya
      // kalah cepat dari tab lain: cookie di browser saat itu sudah milik sesi yang baru.
      if (!(error instanceof ConcurrentRefreshException)) {
        clearRefreshCookie(res, this.secureCookies);
      }
      throw error;
    }
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
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const session = await this.auth.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      ip,
    );
    return this.respondWithSession(res, session);
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
