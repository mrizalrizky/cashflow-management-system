import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { PasswordService } from './password.service.js';
import { RolesGuard } from './roles.guard.js';
import { SessionService } from './session.service.js';
import { TokenService } from './token.service.js';

@Global()
@Module({
  imports: [
    JwtModule.register({}),
    // Hanya dipakai rute yang memasang ThrottlerGuard (login).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60_000, limit: config.getOrThrow<number>('LOGIN_RATE_LIMIT') }],
        errorMessage: 'Terlalu banyak percobaan login. Coba lagi nanti.',
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    SessionService,
    // Urutan penting: autentikasi dulu, baru pengecekan peran.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [PasswordService, SessionService],
})
export class AuthModule {}
