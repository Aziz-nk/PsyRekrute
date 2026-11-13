import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthRegistrationService } from './auth-registration.service';
import { AuthController } from './auth.controller';
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
  ],
  controllers: [AuthController],
  providers: [
    PasswordHashService,
    UserSessionsService,
    AuthRegistrationService,
    ProxyAwareThrottlerGuard,
  ],
  exports: [
    PasswordHashService,
    UserSessionsService,
    AuthRegistrationService,
  ],
})
export class AuthModule {}
