import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly localStorageDir: string;
  private readonly isLocalFallback: boolean;

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.get<string>('MINIO_BUCKET_DOCUMENTS', 'psyrekrute-documents');
    this.localStorageDir = path.resolve(process.cwd(), 'local-storage', this.bucketName);

    const endpoint = this.configService.get<string>('S3_ENDPOINT', 'http://localhost:9000');
    const accessKey = this.configService.get<string>('S3_ACCESS_KEY', 'minio_dev_admin');
    const secretKey = this.configService.get<string>('S3_SECRET_KEY', 'minio_dev_secret_password');
    const region = this.configService.get<string>('S3_REGION', 'us-east-1');

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true,
    });

    // Ensure local storage directory exists for guaranteed local dev persistence
    if (!fs.existsSync(this.localStorageDir)) {
      fs.mkdirSync(this.localStorageDir, { recursive: true });
    }
  }

  validatePdfMagicBytes(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 4) {
      return false;
    }
    // PDF Magic Bytes: %PDF- (0x25 0x50 0x44 0x46)
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    );
  }

  async generateUploadPresignedUrl(
    candidateId: string,
    fileType: 'cv' | 'diploma',
  ): Promise<{ uploadUrl: string; storageKey: string; expiresInSeconds: number }> {
    const fileId = crypto.randomUUID();
    const storageKey = `candidates/${candidateId}/${fileType}/${fileId}.pdf`;
    const expiresIn = 900; // 15 minutes strict

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
        ContentType: 'application/pdf',
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      return { uploadUrl, storageKey, expiresInSeconds: expiresIn };
    } catch (err) {
      this.logger.warn(`S3 Presigner error, fallback to local URL: ${err.message}`);
      // Fallback local route for development without live S3 container
      return {
        uploadUrl: `/api/v1/storage/local-upload/${encodeURIComponent(storageKey)}`,
        storageKey,
        expiresInSeconds: expiresIn,
      };
    }
  }

  async generateDownloadPresignedUrl(
    storageKey: string,
  ): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
    const expiresIn = 900; // 15 minutes strict

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      });

      const downloadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      return { downloadUrl, expiresInSeconds: expiresIn };
    } catch (err) {
      this.logger.warn(`S3 Presigner error, fallback to local URL: ${err.message}`);
      return {
        downloadUrl: `/api/v1/storage/local-download/${encodeURIComponent(storageKey)}`,
        expiresInSeconds: expiresIn,
      };
    }
  }
}
