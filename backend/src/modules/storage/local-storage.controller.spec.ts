import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LocalStorageProvider } from './local-storage.provider';
import { LocalStorageController } from './local-storage.controller';
import { StorageProvider } from './storage.types';

const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n${extra}`);

function streamReq(buf: Buffer): Request {
  return Readable.from([buf]) as unknown as Request;
}

function mockRes() {
  const headers: Record<string, string> = {};
  let body: Buffer | undefined;
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    send: (b: Buffer) => {
      body = b;
    },
  };
  return { res: res as unknown as Response, headers, getBody: () => body };
}

describe('LocalStorageController – controle d acces aux documents et limites D3 (5 Mo / PDF)', () => {
  let dir: string;
  let provider: LocalStorageProvider;
  let controller: LocalStorageController;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'psy-ctrl-'));
    provider = new LocalStorageProvider(dir, 'http://localhost:4000/api/v1', 'ctrl-secret');
    controller = new LocalStorageController(provider);
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('refuse l upload sans autorisation (signature absente ou falsifiee -> 403 Forbidden)', async () => {
    const exp = String(Math.floor(Date.now() / 1000) + 60);
    await expect(
      controller.upload('candidates/u1/cv/doc.pdf', exp, 'bad-sig', streamReq(pdf())),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse le telechargement d un document sans autorisation (signature invalide ou expiree -> 403 Forbidden)', async () => {
    const key = 'candidates/u1/cv/doc.pdf';
    await provider.putObject(key, pdf('secret'), 'application/pdf');
    const exp = String(Math.floor(Date.now() / 1000) + 60);
    const { res } = mockRes();

    await expect(controller.download(key, exp, 'forged', res)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const expired = Math.floor(Date.now() / 1000) - 10;
    const expiredSig = provider.sign('GET', key, expired);
    await expect(
      controller.download(key, String(expired), expiredSig, res),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuse un fichier non-PDF meme avec une URL signee valide (magic bytes)', async () => {
    const key = 'candidates/u1/cv/doc.pdf';
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = provider.sign('PUT', key, exp);
    await expect(
      controller.upload(key, String(exp), sig, streamReq(Buffer.from('NOT_A_PDF'))),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuse un flux depassant la limite D3 de 5 Mo', async () => {
    const key = 'candidates/u1/cv/big.pdf';
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = provider.sign('PUT', key, exp);
    const big = Buffer.concat([pdf(), Buffer.alloc(5 * 1024 * 1024 + 10)]);
    await expect(
      controller.upload(key, String(exp), sig, streamReq(big)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('autorise l upload puis le telechargement avec signatures valides', async () => {
    const key = 'candidates/11111111-1111-1111-1111-111111111111/cv/ok.pdf';
    const exp = Math.floor(Date.now() / 1000) + 60;
    const putSig = provider.sign('PUT', key, exp);
    const up = await controller.upload(key, String(exp), putSig, streamReq(pdf('contenu-cv')));
    expect(up).toEqual({ stored: true });

    const getSig = provider.sign('GET', key, exp);
    const { res, headers, getBody } = mockRes();
    await controller.download(key, String(exp), getSig, res);
    expect(headers['Content-Type']).toBe('application/pdf');
    expect(getBody()?.toString()).toContain('contenu-cv');
  });

  it('renvoie 404 si le document demande n existe pas', async () => {
    const key = 'candidates/u1/cv/missing.pdf';
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = provider.sign('GET', key, exp);
    const { res } = mockRes();
    await expect(controller.download(key, String(exp), sig, res)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('renvoie 404 si le fournisseur actif n est pas LocalStorageProvider (ex. S3 actif)', async () => {
    const fakeS3: StorageProvider = {
      driver: 's3',
      createUploadUrl: async () => '',
      createDownloadUrl: async () => '',
      putObject: async () => undefined,
      getObject: async () => Buffer.alloc(0),
      exists: async () => false,
    };
    const s3Ctrl = new LocalStorageController(fakeS3);
    const { res } = mockRes();
    await expect(s3Ctrl.download('k.pdf', '9999999999', 'sig', res)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
