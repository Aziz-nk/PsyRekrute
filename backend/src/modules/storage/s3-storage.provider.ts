import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageDriver, StorageProvider } from './storage.types';

export interface S3StorageProviderOptions {
  endpoint: string;
  /**
   * Adresse publique / LAN utilisee exclusivement pour signer les URLs pre-signees (upload/download navigateur).
   * Lorsqu'elle est definie (ex: S3_PUBLIC_ENDPOINT=http://192.168.1.50 via reverse proxy Caddy),
   * la signature AWS SigV4 est calculee directement avec cet hote, sans aucune reecriture post-signature.
   */
  publicEndpoint?: string;
  region: string;
  accessKey: string;
  secretKey: string;
}

/** Fournisseur cible : MinIO (dev/staging/LAN) ou tout service compatible S3 (prod). */
export class S3StorageProvider implements StorageProvider {
  readonly driver: StorageDriver = 's3';
  private readonly client: S3Client;
  private readonly presignerClient: S3Client;

  constructor(
    private readonly bucket: string,
    opts: S3StorageProviderOptions,
  ) {
    const internalEndpoint = opts.endpoint.trim();
    const externalEndpoint = opts.publicEndpoint?.trim() || internalEndpoint;

    this.client = new S3Client({
      endpoint: internalEndpoint,
      region: opts.region,
      credentials: { accessKeyId: opts.accessKey, secretAccessKey: opts.secretKey },
      forcePathStyle: true, // requis par MinIO
    });

    this.presignerClient =
      externalEndpoint === internalEndpoint
        ? this.client
        : new S3Client({
            endpoint: externalEndpoint,
            region: opts.region,
            credentials: { accessKeyId: opts.accessKey, secretAccessKey: opts.secretKey },
            forcePathStyle: true, // requis par MinIO
          });
  }

  createUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.presignerClient,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds },
    );
  }

  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.presignerClient, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
