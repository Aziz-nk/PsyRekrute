import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { StorageDriver, StorageProvider } from './storage.types';

/**
 * Stockage sur disque : DEVELOPPEMENT UNIQUEMENT (cf. docs/sprint1-report.md, limites).
 * Les URLs "pre-signees" sont des URLs HMAC a expiration servies par LocalStorageController.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly driver: StorageDriver = 'local';
  private readonly root: string;

  constructor(
    rootDir: string,
    private readonly publicBaseUrl: string,
    private readonly secret: string,
  ) {
    this.root = path.resolve(rootDir);
    fs.mkdirSync(this.root, { recursive: true });
  }

  /** Resout une cle en chemin disque en refusant toute sortie du repertoire racine (path traversal). */
  resolveSafe(key: string): string {
    if (!key || key.includes('\0')) throw new Error('Invalid storage key');
    const full = path.resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + path.sep)) {
      throw new Error('Invalid storage key');
    }
    return full;
  }

  sign(method: 'PUT' | 'GET', key: string, expires: number): string {
    return crypto.createHmac('sha256', this.secret).update(`${method}:${key}:${expires}`).digest('hex');
  }

  verify(method: 'PUT' | 'GET', key: string, expires: number, sig: string): boolean {
    if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
    const expected = Buffer.from(this.sign(method, key, expires));
    const given = Buffer.from(sig ?? '');
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  }

  private url(method: 'PUT' | 'GET', key: string, expiresInSeconds: number): string {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const q = new URLSearchParams({ key, expires: String(expires), sig: this.sign(method, key, expires) });
    return `${this.publicBaseUrl}/storage/local/object?${q.toString()}`;
  }

  async createUploadUrl(key: string, _contentType: string, expiresInSeconds: number) {
    this.resolveSafe(key);
    return this.url('PUT', key, expiresInSeconds);
  }

  async createDownloadUrl(key: string, expiresInSeconds: number) {
    this.resolveSafe(key);
    return this.url('GET', key, expiresInSeconds);
  }

  async putObject(key: string, body: Buffer, _contentType: string): Promise<void> {
    const file = this.resolveSafe(key);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, body);
  }

  async getObject(key: string): Promise<Buffer> {
    return fs.promises.readFile(this.resolveSafe(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolveSafe(key));
      return true;
    } catch {
      return false;
    }
  }
}
