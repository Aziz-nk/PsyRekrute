import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import { StorageService } from './storage.service';
import { STORAGE_PROVIDER, StorageProvider } from './storage.types';
import { S3StorageProvider } from './s3-storage.provider';
import { LocalStorageProvider } from './local-storage.provider';
import { LocalStorageController } from './local-storage.controller';

/**
 * STORAGE_DRIVER=local (defaut en dev) | s3 (MinIO / compatible S3, cible).
 * Le mode local est REFUSE en production.
 */
@Global()
@Module({
  controllers: [LocalStorageController],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageProvider => {
        const logger = new Logger('StorageModule');
        const driver = config.get<string>('STORAGE_DRIVER', 'local');
        const bucket = config.get<string>('MINIO_BUCKET_DOCUMENTS', 'psyrekrute-documents');

        if (driver === 's3') {
          const endpoint = config.get<string>('S3_ENDPOINT', 'http://localhost:9000');
          const publicEndpoint = config.get<string>('S3_PUBLIC_ENDPOINT')?.trim() || undefined;
          logger.log(
            `Storage driver: s3 (endpoint=${endpoint}, publicEndpoint=${publicEndpoint ?? endpoint})`,
          );
          return new S3StorageProvider(bucket, {
            endpoint,
            publicEndpoint,
            region: config.get<string>('S3_REGION', 'us-east-1'),
            accessKey: config.get<string>('S3_ACCESS_KEY', ''),
            secretKey: config.get<string>('S3_SECRET_KEY', ''),
          });
        }
        if (driver !== 'local') throw new Error(`Unknown STORAGE_DRIVER "${driver}" (expected "local" or "s3")`);
        if (config.get('NODE_ENV') === 'production') {
          throw new Error('STORAGE_DRIVER=local is forbidden in production. Use STORAGE_DRIVER=s3.');
        }
        logger.warn('Storage driver: LOCAL DISK (development only, not for real documents).');
        const port = config.get<string>('APP_PORT', '4000');
        return new LocalStorageProvider(
          path.resolve(process.cwd(), config.get<string>('LOCAL_STORAGE_DIR', 'local-storage'), bucket),
          config.get<string>('PUBLIC_API_URL', `http://localhost:${port}/api/v1`),
          config.get<string>('STORAGE_LOCAL_SECRET') ?? config.get<string>('JWT_ACCESS_SECRET', 'dev-only-secret'),
        );
      },
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
