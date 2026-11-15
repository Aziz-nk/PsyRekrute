import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { MatchingController } from './matching.controller';
import { MatchingOrchestratorService } from './matching-orchestrator.service';
import { MatchingService } from './matching.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MatchingController],
  providers: [MatchingService, MatchingOrchestratorService],
  exports: [MatchingService, MatchingOrchestratorService],
})
export class MatchingModule {}
