import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { STORAGE_PROVIDER, StorageProvider } from './storage.types';

const URL_TTL_SECONDS = 900; // 15 minutes
const MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * Facade utilisee par les modules metier. Elle ne connait PAS MinIO ni le disque :
 * le basculement local -> MinIO se fait uniquement via STORAGE_DRIVER (voir storage.module.ts).
 */
@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider) {}

  get driver() {
    return this.provider.driver;
  }

  validatePdfMagicBytes(buffer: Buffer): boolean {
    // %PDF- (0x25 0x50 0x44 0x46)
    return !!buffer && buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }

  async generateUploadPresignedUrl(candidateId: string, fileType: 'cv' | 'diploma') {
    if (!/^[0-9a-fA-F-]{8,64}$/.test(candidateId)) throw new BadRequestException('Invalid candidate id');
    const storageKey = `candidates/${candidateId}/${fileType}/${crypto.randomUUID()}.pdf`;
    const uploadUrl = await this.provider.createUploadUrl(storageKey, 'application/pdf', URL_TTL_SECONDS);
    return { uploadUrl, storageKey, expiresInSeconds: URL_TTL_SECONDS };
  }

  async generateDownloadPresignedUrl(storageKey: string) {
    const downloadUrl = await this.provider.createDownloadUrl(storageKey, URL_TTL_SECONDS);
    return { downloadUrl, expiresInSeconds: URL_TTL_SECONDS };
  }

  /** Depot cote serveur avec controle du contenu (PDF uniquement, taille bornee). */
  async savePdf(storageKey: string, body: Buffer): Promise<void> {
    if (body.length > MAX_PDF_BYTES) throw new BadRequestException('File too large');
    if (!this.validatePdfMagicBytes(body)) throw new BadRequestException('Only PDF files are accepted');
    await this.provider.putObject(storageKey, body, 'application/pdf');
  }

  read(storageKey: string): Promise<Buffer> {
    return this.provider.getObject(storageKey);
  }

  exists(storageKey: string): Promise<boolean> {
    return this.provider.exists(storageKey);
  }
}
