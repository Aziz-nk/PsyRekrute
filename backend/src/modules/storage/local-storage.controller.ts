import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { STORAGE_PROVIDER, StorageProvider } from './storage.types';
import { LocalStorageProvider } from './local-storage.provider';

const MAX_BYTES = 5 * 1024 * 1024; // 5 Mo strict (DCTF §8.2 / D3)

/** Endpoints actifs UNIQUEMENT quand STORAGE_DRIVER=local. Renvoient 404 sinon. URLs signees HMAC + expiration. */
@ApiExcludeController()
@Controller('storage/local')
export class LocalStorageController {
  constructor(@Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider) {}

  private local(): LocalStorageProvider {
    if (!(this.provider instanceof LocalStorageProvider)) throw new NotFoundException();
    return this.provider;
  }

  @Put('object')
  async upload(@Query('key') key: string, @Query('expires') expires: string, @Query('sig') sig: string, @Req() req: Request) {
    const p = this.local();
    if (!p.verify('PUT', key, Number(expires), sig)) throw new ForbiddenException('Invalid or expired URL');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BYTES) throw new BadRequestException('File too large');
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks);
    if (body.length < 4 || body.subarray(0, 4).toString('latin1') !== '%PDF') {
      throw new BadRequestException('Only PDF files are accepted');
    }
    await p.putObject(key, body, 'application/pdf');
    return { stored: true };
  }

  @Get('object')
  async download(@Query('key') key: string, @Query('expires') expires: string, @Query('sig') sig: string, @Res() res: Response) {
    const p = this.local();
    if (!p.verify('GET', key, Number(expires), sig)) throw new ForbiddenException('Invalid or expired URL');
    if (!(await p.exists(key))) throw new NotFoundException();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment');
    res.send(await p.getObject(key));
  }
}
