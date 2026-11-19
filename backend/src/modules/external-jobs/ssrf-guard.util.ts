import * as dns from 'dns';
import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import { BadRequestException } from '@nestjs/common';

export const MAX_RESPONSE_SIZE = 2 * 1024 * 1024; // 2 Mo max
export const REQUEST_TIMEOUT_MS = 8000; // 8 secondes max
export const MAX_REDIRECTS = 3;

/**
 * Interface étendant URL pour embarquer l'adresse IP épinglée et sa famille (IPv4 ou IPv6).
 * Empêche toute seconde résolution DNS incontrôlée lors de la connexion socket réelle (Anti-DNS Rebinding).
 */
export interface ValidatedSafeUrl extends URL {
  pinnedIp: string;
  ipFamily: 4 | 6;
}

export type DnsLookupFn = (
  hostname: string,
  options: { all: true },
) => Promise<dns.LookupAddress[]>;

/**
 * Convertit une représentation hexadécimale IPv4-mapped (ex: 7f00:1 ou 7f00:0001) en IPv4 décimale.
 */
function parseIpv4MappedHex(sub: string): string | null {
  const hexParts = sub.split(':');
  if (hexParts.length === 2) {
    const h1 = Number.parseInt(hexParts[0], 16);
    const h2 = Number.parseInt(hexParts[1], 16);
    if (
      !Number.isNaN(h1) &&
      !Number.isNaN(h2) &&
      h1 >= 0 &&
      h1 <= 0xffff &&
      h2 >= 0 &&
      h2 <= 0xffff
    ) {
      const b0 = (h1 >> 8) & 0xff;
      const b1 = h1 & 0xff;
      const b2 = (h2 >> 8) & 0xff;
      const b3 = h2 & 0xff;
      return `${b0}.${b1}.${b2}.${b3}`;
    }
  }
  return null;
}

/**
 * Vérifie rigoureusement si une adresse IP est privée, interne ou réservée.
 * Bloque IPv4 et IPv6 dans tous leurs formats et encodages alternatifs.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  let cleanIp = ip.toLowerCase().trim();

  // Gestion des adresses IPv4-mapped IPv6 (ex: ::ffff:192.168.1.1 ou ::ffff:7f00:1)
  if (cleanIp.startsWith('::ffff:')) {
    const rest = cleanIp.slice(7);
    const hexMapped = parseIpv4MappedHex(rest);
    cleanIp = hexMapped || rest;
  }

  const family = net.isIP(cleanIp);
  if (family === 4) {
    const parts = cleanIp.split('.').map((p) => Number.parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
      return true; // Fail-closed
    }
    const [b0, b1, b2] = parts;

    // 0.0.0.0/8 (Réseau actuel)
    if (b0 === 0) return true;
    // 10.0.0.0/8 (Privé RFC 1918)
    if (b0 === 10) return true;
    // 127.0.0.0/8 (Loopback RFC 1122)
    if (b0 === 127) return true;
    // 100.64.0.0/10 (CGNAT RFC 6598)
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;
    // 169.254.0.0/16 (Link-local RFC 3927 & Métadonnées Cloud AWS/GCP/Azure 169.254.169.254)
    if (b0 === 169 && b1 === 254) return true;
    // 172.16.0.0/12 (Privé RFC 1918, conteneurs Docker/Podman)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
    // 192.168.0.0/16 (Privé RFC 1918)
    if (b0 === 192 && b1 === 168) return true;
    // 198.18.0.0/15 (Benchmark RFC 2544)
    if (b0 === 198 && (b1 === 18 || b1 === 19)) return true;
    // 192.0.2.0/24 (TEST-NET-1 RFC 5737)
    if (b0 === 192 && b1 === 0 && b2 === 2) return true;
    // 198.51.100.0/24 (TEST-NET-2 RFC 5737)
    if (b0 === 198 && b1 === 51 && b2 === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3 RFC 5737)
    if (b0 === 203 && b1 === 0 && b2 === 113) return true;
    // Multicast & Expérimental (224.0.0.0/4, 240.0.0.0/4)
    if (b0 >= 224) return true;

    return false;
  }

  if (family === 6) {
    if (cleanIp === '::1' || cleanIp === '::') return true;
    // Unique local fc00::/7 (fc00... ou fd00...)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true;
    // Link local fe80::/10
    if (
      cleanIp.startsWith('fe80') ||
      cleanIp.startsWith('fe9') ||
      cleanIp.startsWith('fea') ||
      cleanIp.startsWith('feb')
    ) {
      return true;
    }
    // Documentation 2001:db8::/32
    if (cleanIp.startsWith('2001:db8')) return true;

    return false;
  }

  // Format non reconnu ou invalide : rejet systématique (Fail-closed)
  return true;
}

/**
 * Valide une URL, vérifie toutes les adresses IP résolues et épingle l'IP vérifiée.
 * @throws BadRequestException si l'URL est invalide, locale, privée ou résout vers une IP interdite.
 */
export async function validateSafeUrl(
  rawUrl: string,
  dnsLookupFn: DnsLookupFn = dns.promises.lookup,
): Promise<ValidatedSafeUrl> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl.trim());
  } catch {
    throw new BadRequestException('Format d\'URL invalide');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new BadRequestException('Protocole non autorisé : seuls HTTP et HTTPS sont acceptés');
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Noms d'hôtes locaux évidents et services de l'infrastructure Docker
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    ['postgres', 'minio', 'backend', 'frontend', 'nginx'].includes(hostname)
  ) {
    throw new BadRequestException('Accès aux hôtes internes ou locaux interdit');
  }

  // Si c'est directement une adresse IP littérale
  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new BadRequestException('Accès aux adresses IP privées ou locales interdit');
    }
    const validated = parsedUrl as ValidatedSafeUrl;
    validated.pinnedIp = hostname;
    validated.ipFamily = (hostname.includes(':') ? 6 : 4) as 4 | 6;
    return validated;
  }

  // Résolution DNS et contrôle strict de TOUTES les adresses IP résolues
  let records: dns.LookupAddress[];
  try {
    records = await dnsLookupFn(hostname, { all: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Résolution DNS impossible';
    throw new BadRequestException(`Résolution du nom d'hôte impossible : ${msg}`);
  }

  if (!records || records.length === 0) {
    throw new BadRequestException('Aucune adresse IP résolue pour ce nom d\'hôte');
  }

  // Vérification exhaustive : si au moins UNE adresse est privée/réservée, on rejette tout
  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new BadRequestException(
        `L'adresse IP résolue (${record.address}) est privée ou réservée. Requête bloquée (Anti-SSRF).`,
      );
    }
  }

  // Épinglage sur la première IP validée
  const pinnedRecord = records[0];
  const validated = parsedUrl as ValidatedSafeUrl;
  validated.pinnedIp = pinnedRecord.address;
  validated.ipFamily = (pinnedRecord.family === 6 || pinnedRecord.address.includes(':')
    ? 6
    : 4) as 4 | 6;

  return validated;
}

export interface SafeFetchResult {
  url: string;
  statusCode: number;
  contentType: string;
  bodyText: string;
}

/**
 * Exécute une requête HTTP(S) sécurisée contre les attaques SSRF et DNS Rebinding.
 * 
 * Garanties de sécurité :
 * 1. Épinglage IP strict : le socket TCP se connecte UNIQUEMENT à l'adresse IP validée au préalable.
 * 2. Aucune seconde résolution DNS non contrôlée lors de la connexion socket (élimination du TOCTOU).
 * 3. Validation TLS préservée : le nom d'hôte validé est transmis en SNI et vérifié sur le certificat distant.
 * 4. Gestion sécurisée des redirections (max 3) avec réévaluation Anti-SSRF complète de chaque cible.
 * 5. Garde-fous réseau : timeout strict de 8s et limite de téléchargement stricte de 2 Mo.
 */
export async function safeFetch(
  targetUrl: string,
  redirectCount = 0,
  dnsLookupFn: DnsLookupFn = dns.promises.lookup,
): Promise<SafeFetchResult> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new BadRequestException('Nombre maximal de redirections dépassé');
  }

  const validatedUrl = await validateSafeUrl(targetUrl, dnsLookupFn);

  const isHttps = validatedUrl.protocol === 'https:';
  const client = isHttps ? https : http;
  const defaultPort = isHttps ? 443 : 80;
  const port = validatedUrl.port ? Number.parseInt(validatedUrl.port, 10) : defaultPort;

  return new Promise<SafeFetchResult>((resolve, reject) => {
    let timedOut = false;
    let isSettled = false;

    const safeReject = (err: Error) => {
      if (isSettled) return;
      isSettled = true;
      if (err instanceof BadRequestException) {
        reject(err);
      } else {
        reject(new BadRequestException(`Échec de la récupération sécurisée : ${err.message}`));
      }
    };

    const safeResolve = (result: SafeFetchResult) => {
      if (isSettled) return;
      isSettled = true;
      resolve(result);
    };

    const reqOptions: https.RequestOptions = {
      protocol: validatedUrl.protocol,
      hostname: validatedUrl.hostname,
      port,
      path: `${validatedUrl.pathname || '/'}${validatedUrl.search || ''}`,
      method: 'GET',
      headers: {
        'User-Agent':
          'PsyRekrute-JobAggregator/1.0 (+https://psyrekrute.ma; contact@psyrekrute.ma)',
        Accept:
          'text/html,application/xhtml+xml,application/xml,text/xml,application/rss+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7',
        Host: validatedUrl.host,
      },
      // SNI et vérification du certificat TLS avec le nom d'hôte validé
      servername: validatedUrl.hostname,
      // Épinglage IP strict : garantit que le socket TCP se connecte UNIQUEMENT à l'adresse IP validée
      lookup: (_hostname, options, callback) => {
        if (typeof options === 'function') {
          callback = options;
          options = {};
        }
        const address = validatedUrl.pinnedIp;
        const family = validatedUrl.ipFamily;
        if (options && options.all) {
          callback(null, [{ address, family }]);
        } else {
          callback(null, address, family);
        }
      },
    };

    const req = client.request(reqOptions, (res) => {
      // 1. Gestion des redirections (max 3) avec réévaluation Anti-SSRF complète
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0)) {
        req.destroy();
        const location = res.headers.location;
        if (!location) {
          safeReject(new BadRequestException('En-tête Location manquant lors de la redirection'));
          return;
        }
        const nextUrl = new URL(location, validatedUrl).toString();
        safeFetch(nextUrl, redirectCount + 1, dnsLookupFn)
          .then(safeResolve)
          .catch(safeReject);
        return;
      }

      // 2. Vérification du code HTTP
      if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
        req.destroy();
        safeReject(
          new BadRequestException(
            `La source externe a répondu avec le statut HTTP ${res.statusCode}`,
          ),
        );
        return;
      }

      // 3. Contrôle de la taille de contenu annoncée
      const contentLength = res.headers['content-length'];
      if (contentLength && Number.parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        req.destroy();
        safeReject(
          new BadRequestException('Taille de réponse externe supérieure à la limite de 2 Mo'),
        );
        return;
      }

      // 4. Lecture en continu avec garde-fou strict sur la taille
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      res.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_SIZE) {
          res.destroy();
          req.destroy();
          safeReject(
            new BadRequestException('Taille du contenu reçu supérieure à la limite de 2 Mo'),
          );
        } else {
          chunks.push(chunk);
        }
      });

      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        const bodyText = bodyBuffer.toString('utf-8');
        safeResolve({
          url: validatedUrl.toString(),
          statusCode: res.statusCode || 200,
          contentType: String(res.headers['content-type'] || ''),
          bodyText,
        });
      });

      res.on('error', (err) => {
        safeReject(err);
      });
    });

    // Timeout réseau de 8 secondes
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      timedOut = true;
      req.destroy(new Error(`Timeout de requête dépassé (${REQUEST_TIMEOUT_MS} ms)`));
    });

    req.on('error', (err) => {
      if (timedOut) {
        safeReject(
          new BadRequestException(`Timeout de requête dépassé (${REQUEST_TIMEOUT_MS} ms)`),
        );
      } else {
        safeReject(err);
      }
    });

    req.end();
  });
}
