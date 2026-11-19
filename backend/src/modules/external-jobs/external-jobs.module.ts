import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminExternalJobsController } from './admin-external-jobs.controller';
import { ExternalJobsController } from './external-jobs.controller';
import { ExternalJobsService } from './external-jobs.service';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [ExternalJobsController, AdminExternalJobsController],
  providers: [ExternalJobsService],
  exports: [ExternalJobsService],
})
export class ExternalJobsModule {}
