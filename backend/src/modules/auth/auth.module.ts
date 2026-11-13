import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthRegistrationService } from './auth-registration.service';
import { AuthSessionService } from './auth-session.service';
import { AuthController } from './auth.controller';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  getJwtAccessSecret,
  JwtAuthGuard,
} from './jwt-auth.guard';
import { PasswordHashService } from './password-hash.service';
import { ProxyAwareThrottlerGuard } from './proxy-throttler.guard';
import { UserSessionsService } from './user-sessions.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 5,
      },
    ]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getJwtAccessSecret(),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    PasswordHashService,
    UserSessionsService,
    AuthRegistrationService,
    AuthSessionService,
    JwtAuthGuard,
    ProxyAwareThrottlerGuard,
  ],
  exports: [
    PasswordHashService,
    UserSessionsService,
    AuthRegistrationService,
    AuthSessionService,
    JwtAuthGuard,
    JwtModule,
  ],
})
export class AuthModule {}
