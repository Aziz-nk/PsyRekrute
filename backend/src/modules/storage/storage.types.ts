/** Contrat d'un fournisseur de stockage documentaire. Les modules metier ne dependent QUE de StorageService. */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export type StorageDriver = 'local' | 's3';

export interface StorageProvider {
  readonly driver: StorageDriver;
  /** URL temporaire pour deposer un objet (PUT). */
  createUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<string>;
  /** URL temporaire pour lire un objet (GET). */
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  /** Ecriture serveur (utilise par le mode local et les tests). */
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
}
