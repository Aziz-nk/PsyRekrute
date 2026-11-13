import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { extractClientIp } from './ip-extractor.util';

/**
 * Guard de limitation de debit (D7) :
 * Utilise `extractClientIp` (base sur `req.ip` resolu par Express via `TRUSTED_PROXIES`)
 * pour calculer la cle de suivi par IP cliente verifiee (ou IP socket directe par defaut).
 */
@Injectable()
export class ProxyAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return extractClientIp(req as unknown as Partial<Request>);
  }
}
