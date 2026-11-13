import type { INestApplication } from '@nestjs/common';
import type { Request } from 'express';
import { BlockList, isIP } from 'net';

export const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/**
 * Normalise une adresse IP (supprime le prefixe IPv4-mapped IPv6 `::ffff:`
 * et tronque a 45 caracteres conformement a VARCHAR(45)).
 */
export function normalizeIpAddress(rawIp: string | undefined): string {
  if (!rawIp || typeof rawIp !== 'string') {
    return '0.0.0.0';
  }
  const trimmed = rawIp.trim();
  if (trimmed.length === 0) {
    return '0.0.0.0';
  }
  const normalized = trimmed.toLowerCase().startsWith('::ffff:')
    ? trimmed.slice(7)
    : trimmed;
  return normalized.slice(0, 45);
}

/**
 * Construit un validateur de proxys de confiance pour Express (`app.set('trust proxy', fn)`).
 *
 * Exigences de securite (Audit M1.2) :
 * - Ne jamais accepter aveuglement `true` ou `*` (tous les proxys).
 * - Identifier explicitement les adresses/sous-reseaux des reverse proxys de confiance
 *   via `trustedProxiesSpec` (ex: `loopback`, `uniquelocal`, `linklocal`, ou CIDR/IP explicites).
 * - Limiter le nombre de sauts de proxy traverses depuis la droite de `X-Forwarded-For`
 *   via `maxHops` (par defaut 1), afin qu'un reverse proxy ajoutant l'IP reelle du client
 *   a droite de `X-Forwarded-For` ignore toute valeur falsifiee par le client a gauche.
 * - Si aucune configuration valide n'est fournie, retourne `false` (connexion directe uniquement).
 */
export function createExpressTrustProxyValidator(
  trustedProxiesSpec?: string,
  maxHopsInput: number | string = DEFAULT_TRUSTED_PROXY_HOPS,
): false | ((ip: string, hopIndex: number) => boolean) {
  if (!trustedProxiesSpec || typeof trustedProxiesSpec !== 'string') {
    return false;
  }

  const normalizedSpec = trustedProxiesSpec.trim().toLowerCase();
  if (
    normalizedSpec.length === 0 ||
    normalizedSpec === 'false' ||
    normalizedSpec === 'none' ||
    normalizedSpec === '0' ||
    normalizedSpec === 'true' ||
    normalizedSpec === '*' ||
    normalizedSpec === 'all'
  ) {
    return false;
  }

  const parsedHops =
    typeof maxHopsInput === 'number'
      ? maxHopsInput
      : typeof maxHopsInput === 'string' && maxHopsInput.trim().length > 0
        ? Number.parseInt(maxHopsInput.trim(), 10)
        : DEFAULT_TRUSTED_PROXY_HOPS;

  const maxHops =
    Number.isInteger(parsedHops) && parsedHops >= 1
      ? parsedHops
      : DEFAULT_TRUSTED_PROXY_HOPS;

  const blockList = new BlockList();
  let ruleCount = 0;

  const tokens = normalizedSpec
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  for (const token of tokens) {
    if (token === 'loopback') {
      blockList.addSubnet('127.0.0.0', 8, 'ipv4');
      blockList.addAddress('::1', 'ipv6');
      ruleCount += 2;
      continue;
    }
    if (token === 'linklocal') {
      blockList.addSubnet('169.254.0.0', 16, 'ipv4');
      blockList.addSubnet('fe80::', 10, 'ipv6');
      ruleCount += 2;
      continue;
    }
    if (token === 'uniquelocal') {
      blockList.addSubnet('10.0.0.0', 8, 'ipv4');
      blockList.addSubnet('172.16.0.0', 12, 'ipv4');
      blockList.addSubnet('192.168.0.0', 16, 'ipv4');
      blockList.addSubnet('fc00::', 7, 'ipv6');
      ruleCount += 4;
      continue;
    }

    if (token.includes('/')) {
      const [netAddr, prefixStr] = token.split('/');
      const family = isIP(netAddr);
      const prefix = Number.parseInt(prefixStr, 10);
      if (
        family === 4 &&
        Number.isInteger(prefix) &&
        prefix >= 1 &&
        prefix <= 32
      ) {
        blockList.addSubnet(netAddr, prefix, 'ipv4');
        ruleCount += 1;
      } else if (
        family === 6 &&
        Number.isInteger(prefix) &&
        prefix >= 1 &&
        prefix <= 128
      ) {
        blockList.addSubnet(netAddr, prefix, 'ipv6');
        ruleCount += 1;
      }
      continue;
    }

    const family = isIP(token);
    if (family === 4) {
      blockList.addAddress(token, 'ipv4');
      ruleCount += 1;
    } else if (family === 6) {
      blockList.addAddress(token, 'ipv6');
      ruleCount += 1;
    }
  }

  if (ruleCount === 0) {
    return false;
  }

  return (ip: string, hopIndex: number): boolean => {
    if (hopIndex >= maxHops) {
      return false;
    }
    const cleanIp = normalizeIpAddress(ip);
    const family = isIP(cleanIp);
    if (family === 4) {
      return blockList.check(cleanIp, 'ipv4');
    }
    if (family === 6) {
      return blockList.check(cleanIp, 'ipv6');
    }
    return false;
  };
}

/**
 * Applique la politique de proxys de confiance sur l'instance Express sous-jacente.
 * A utiliser de maniere identique dans `main.ts` et dans les tests d'integration HTTP.
 */
export function configureTrustedProxies(
  app: INestApplication,
  trustedProxiesSpec: string | undefined = process.env.TRUSTED_PROXIES,
  maxHopsInput: number | string | undefined = process.env.TRUSTED_PROXY_HOPS,
): void {
  const validator = createExpressTrustProxyValidator(
    trustedProxiesSpec,
    maxHopsInput,
  );
  app.getHttpAdapter().getInstance().set('trust proxy', validator);
}

/**
 * Extrait l'adresse IP cliente exclusivement a partir de `req.ip` calcule par Express
 * selon la politique `trust proxy` configuree (ou repli sur `req.socket.remoteAddress`).
 * Ne lit jamais directement `req.headers['x-forwarded-for']`.
 */
export function extractClientIp(req: Partial<Request> | undefined): string {
  if (!req) {
    return '0.0.0.0';
  }
  const resolvedIp = req.ip ?? req.socket?.remoteAddress ?? '0.0.0.0';
  return normalizeIpAddress(resolvedIp);
}

/** Extrait le User-Agent tronque de maniere securisee. */
export function extractUserAgent(req: Partial<Request> | undefined): string {
  const ua = req?.headers?.['user-agent'];
  const raw = Array.isArray(ua) ? ua[0] : ua;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim().slice(0, 512);
  }
  return 'unknown';
}
