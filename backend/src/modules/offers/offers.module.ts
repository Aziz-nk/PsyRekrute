import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { JobOffersController } from './job-offers.controller';
import { OffersService } from './offers.service';
import { OrgJobOffersController } from './org-job-offers.controller';

@Module({
  imports: [PrismaModule, AuthModule, AuditModule],
  controllers: [JobOffersController, OrgJobOffersController],
  providers: [OffersService],
  exports: [OffersService],
})
export class OffersModule {}
