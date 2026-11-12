import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { LocalStorageProvider } from './local-storage.provider';
import { StorageService } from './storage.service';

const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n${extra}`);

describe('Stockage – abstraction (provider local, dev uniquement)', () => {
  let dir: string;
  let provider: LocalStorageProvider;
  let service: StorageService;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-storage-'));
    provider = new LocalStorageProvider(dir, 'http://localhost:4000/api/v1', 'test-secret');
    service = new StorageService(provider); // StorageService ne depend que de l'interface StorageProvider
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('le service expose le driver sans exposer l implementation', () => {
    expect(service.driver).toBe('local');
  });

  it('aller-retour : savePdf puis read', async () => {
    const key = 'candidates/11111111-1111-1111-1111-111111111111/cv/a.pdf';
    await service.savePdf(key, pdf('hello'));
    expect(await service.exists(key)).toBe(true);
    expect((await service.read(key)).toString()).toContain('hello');
  });

  it('refuse un fichier qui n est pas un PDF (magic bytes)', async () => {
    await expect(service.savePdf('x/a.pdf', Buffer.from('MZ-executable'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse un fichier trop volumineux (> 10 Mo)', async () => {
    const big = Buffer.concat([pdf(), Buffer.alloc(10 * 1024 * 1024 + 1)]);
    await expect(service.savePdf('x/big.pdf', big)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloque le path traversal', async () => {
    await expect(provider.putObject('../evil.pdf', pdf(), 'application/pdf')).rejects.toThrow('Invalid storage key');
    await expect(provider.getObject('../../etc/passwd')).rejects.toThrow('Invalid storage key');
    expect(() => provider.resolveSafe('a/../../b')).toThrow();
  });

  it('URL d upload : cle sous candidates/<id>/<type>/<uuid>.pdf, expiration 900 s', async () => {
    const r = await service.generateUploadPresignedUrl('11111111-1111-1111-1111-111111111111', 'cv');
    expect(r.storageKey).toMatch(/^candidates\/11111111-1111-1111-1111-111111111111\/cv\/[0-9a-f-]{36}\.pdf$/);
    expect(r.expiresInSeconds).toBe(900);
    expect(r.uploadUrl).toContain('/storage/local/object?');
  });

  it('refuse un identifiant candidat invalide', async () => {
    await expect(service.generateUploadPresignedUrl('../../x', 'cv')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('signature valide, falsifiee, mauvaise methode, expiree', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = provider.sign('GET', 'k.pdf', exp);
    expect(provider.verify('GET', 'k.pdf', exp, sig)).toBe(true);
    const tampered = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0'); // toujours different de sig
    expect(tampered).not.toBe(sig);
    expect(provider.verify('GET', 'k.pdf', exp, tampered)).toBe(false);
    expect(provider.verify('PUT', 'k.pdf', exp, sig)).toBe(false);
    expect(provider.verify('GET', 'other.pdf', exp, sig)).toBe(false);
    const past = Math.floor(Date.now() / 1000) - 1;
    expect(provider.verify('GET', 'k.pdf', past, provider.sign('GET', 'k.pdf', past))).toBe(false);
  });
});
