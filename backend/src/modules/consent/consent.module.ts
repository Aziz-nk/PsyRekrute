import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ConsentService } from './consent.service';
import { MeConsentsController } from './me-consents.controller';

/**
 * M4 – Module des consentements.
 * Reutilise la configuration JWT et les guards exportes par AuthModule
 * (JwtModule, JwtAuthGuard, GlobalRolesGuard) et AuditService exporte par AuditModule.
 * Aucune dependance circulaire : ni AuthModule ni AuditModule n'importent ConsentModule.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [MeConsentsController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
