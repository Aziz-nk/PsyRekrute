import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from '../audit/audit.module';
import { AuthRegistrationService } from './auth-registration.service';
import { AuthSessionService } from './auth-session.service';
import { AuthController } from './auth.controller';
import { GlobalRolesGuard } from './global-roles.guard';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  getJwtAccessSecret,
  JwtAuthGuard,
} from './jwt-auth.guard';
import { OrgRolesGuard } from './org-roles.guard';
import { PasswordHashService } from './password-hash.service';
import { ProxyAwareThrottlerGuard } from './proxy-throttler.guard';
import { UserSessionsService } from './user-sessions.service';

@Module({
  imports: [
    AuditModule,
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
    GlobalRolesGuard,
    OrgRolesGuard,
    ProxyAwareThrottlerGuard,
  ],
  exports: [
    PasswordHashService,
    UserSessionsService,
    AuthRegistrationService,
    AuthSessionService,
    JwtAuthGuard,
    GlobalRolesGuard,
    OrgRolesGuard,
    JwtModule,
  ],
})
export class AuthModule {}
