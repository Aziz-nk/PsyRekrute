import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_TOKEN_COOKIE_NAME = 'psyrekrute_refresh_token';
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth';
export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

/**
 * Construit les options du cookie HttpOnly de refresh token (D5 / DCTF §8.1) :
 * - `httpOnly: true` (inaccessible au JavaScript client)
 * - `secure: true` en production (`NODE_ENV === 'production'`)
 * - `sameSite: 'lax'`
 * - `path: '/api/v1/auth'`
 */
export function buildRefreshCookieOptions(
  isProduction: boolean = process.env.NODE_ENV === 'production',
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  };
}

/** Depose le refresh token brut dans le cookie HttpOnly de la reponse. */
export function setRefreshTokenCookie(
  res: Response,
  rawRefreshToken: string,
  isProduction: boolean = process.env.NODE_ENV === 'production',
): void {
  res.cookie(
    REFRESH_TOKEN_COOKIE_NAME,
    rawRefreshToken,
    buildRefreshCookieOptions(isProduction),
  );
}

/** Efface le cookie HttpOnly de refresh token de la reponse. */
export function clearRefreshTokenCookie(
  res: Response,
  isProduction: boolean = process.env.NODE_ENV === 'production',
): void {
  const options = buildRefreshCookieOptions(isProduction);
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
  });
}

/** Extrait le refresh token brut depuis l'en-tete `Cookie` de la requete HTTP. */
export function extractRefreshTokenFromRequest(
  req: Partial<Request> | undefined,
): string | null {
  const cookieHeader = req?.headers?.cookie;
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return null;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      continue;
    }
    const name = pair.slice(0, eqIdx).trim();
    if (name === REFRESH_TOKEN_COOKIE_NAME) {
      const rawValue = pair.slice(eqIdx + 1).trim();
      if (rawValue.length === 0) {
        return null;
      }
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }

  return null;
}
