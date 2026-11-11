import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { StorageModule } from './modules/storage/storage.module';
import { MatchingModule } from './modules/matching/matching.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    StorageModule,
    MatchingModule,
    HealthModule,
  ],
})
export class AppModule {}
