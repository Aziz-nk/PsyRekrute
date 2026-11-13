import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminOrganizationsController } from './admin-organizations.controller';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

/**
 * M5 – Module de gestion des organisations et membres (DCTF §3.3 #3-4, §4.1, §4.2).
 * Réutilise les guards et la configuration JWT d'AuthModule
 * et AuditService d'AuditModule.
 */
@Module({
  imports: [AuthModule, AuditModule],
  controllers: [OrganizationsController, AdminOrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
