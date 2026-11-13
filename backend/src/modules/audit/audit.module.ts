import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuditController } from './admin-audit.controller';
import { AuditService } from './audit.service';

/**
 * M3 – Module d'audit.
 * N'importe pas AuthModule (evite la dependance circulaire : AuthModule importe AuditModule).
 * JwtModule est enregistre sans configuration car JwtAuthGuard fournit explicitement
 * le secret et l'algorithme HS256 lors de la verification.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AdminAuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
