import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { StorageModule } from './modules/storage/storage.module';
import { MatchingModule } from './modules/matching/matching.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { ConsentModule } from './modules/consent/consent.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      expandVariables: true, // permet ${VAR} dans .env (ex. DATABASE_URL)
      envFilePath: '.env',
    }),
    PrismaModule,
    StorageModule,
    MatchingModule,
    HealthModule,
    AuditModule,
    AuthModule,
    ConsentModule,
    OrganizationsModule,
  ],
})
export class AppModule {}
