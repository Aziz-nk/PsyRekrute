import {
  BadRequestException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { SessionRevocationReason, UserSession } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

const REFRESH_TOKEN_BYTES = 32; // 256 bits d'entropie cryptographique
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 jours (DCTF §8.1)
export const MIN_RETENTION_DAYS_AFTER_EXPIRY = 30; // Politique de conservation D1/M1.1 : 30j apres expires_at
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

export interface CreateSessionInput {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  ttlSeconds?: number;
}

export interface IssuedSession {
  /** Jeton brut destine UNIQUEMENT au cookie HttpOnly (jamais stocke en base). */
  rawRefreshToken: string;
  /** Enregistrement persiste en base (ne contient que tokenHash SHA-256). */
  session: UserSession;
}

export interface RotateSessionResult extends IssuedSession {
  previousSessionId: string;
}

type RotationTxOutcome =
  | { kind: 'NOT_FOUND' }
  | { kind: 'EXPIRED' }
  | { kind: 'REUSE_DETECTED'; revokedCount: number }
  | {
      kind: 'ROTATED';
      rawRefreshToken: string;
      session: UserSession;
      previousSessionId: string;
    };

/**
 * M1.1 – Gestionnaire de sessions utilisateur (USER_SESSIONS).
 * Garantit :
 * - Hachage SHA-256 systematique (aucun refresh token en clair en base).
 * - Rotation et detection de reutilisation atomiques (verrouillage SELECT ... FOR UPDATE).
 * - Respect des invariants de la chaine de rotation et de la politique de conservation.
 */
@Injectable()
export class UserSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  /** Genere un refresh token aleatoire d'au moins 256 bits (base64url). */
  generateRawRefreshToken(): string {
    return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  /** Calcule l'empreinte SHA-256 hexadecimale (64 car.) d'un refresh token brut. */
  hashRefreshToken(rawRefreshToken: string): string {
    const trimmed = rawRefreshToken?.trim() ?? '';
    if (trimmed.length < 16) {
      throw new UnauthorizedException('Invalid refresh token format');
    }
    return crypto.createHash('sha256').update(trimmed, 'utf8').digest('hex');
  }

  /** Verifie qu'une empreinte est bien un hash SHA-256 hexadecimal de 64 caracteres. */
  isValidTokenHash(candidateHash: string): boolean {
    return SHA256_HEX_REGEX.test(candidateHash);
  }

  /** Cree une nouvelle session en ne stockant que l'empreinte SHA-256 du refresh token. */
  async createSession(input: CreateSessionInput): Promise<IssuedSession> {
    const rawRefreshToken = this.generateRawRefreshToken();
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const session = await this.prisma.userSession.create({
      data: {
        userId: input.userId,
        tokenHash,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        expiresAt,
      },
    });

    return { rawRefreshToken, session };
  }

  /**
   * Rotation atomique d'un refresh token (RTR - DCTF §8.1 / D1) :
   * - Acquiert un verrou exclusif de ligne (SELECT ... FOR UPDATE) sur la session cible
   *   pour serialiser les requetes concurrentes portant sur le meme jeton.
   * - Si la session est deja revoquee ou remplacee : revoque atomiquement TOUTES les sessions
   *   actives de l'utilisateur (REUSE_DETECTED) et commite cette revocation avant de lever 401.
   * - Si la session est expiree : refuse le renouvellement (401).
   * - Sinon : cree le successeur (meme userId) et marque la session ROTATED.
   */
  async rotateSession(
    rawRefreshToken: string,
    meta: {
      ipAddress?: string | null;
      userAgent?: string | null;
      ttlSeconds?: number;
    } = {},
  ): Promise<RotateSessionResult> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    const outcome: RotationTxOutcome = await this.prisma.$transaction(
      async (tx) => {
        // Verrou exclusif FOR UPDATE sur la ligne cible : serialise toute tentative concurrente
        const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "user_sessions" WHERE "token_hash" = ${tokenHash} FOR UPDATE
        `;

        if (lockedRows.length === 0) {
          return { kind: 'NOT_FOUND' };
        }

        const existing = await tx.userSession.findUniqueOrThrow({
          where: { id: lockedRows[0].id },
        });

        const now = new Date();

        // Detection de reutilisation d'un refresh token deja rote ou revoque :
        // on commite la revocation globale dans la transaction avant de rejeter l'appel.
        if (existing.revokedAt !== null || existing.replacedBySessionId !== null) {
          const revoked = await tx.userSession.updateMany({
            where: { userId: existing.userId, revokedAt: null },
            data: {
              revokedAt: now,
              revocationReason: SessionRevocationReason.REUSE_DETECTED,
            },
          });
          await this.auditService?.recordInTx(tx, {
            userId: existing.userId,
            action: 'SESSION_REUSE_DETECTED',
            entityType: 'USER_SESSION',
            entityId: existing.id,
            ipAddress: meta.ipAddress,
            userAgent: meta.userAgent,
            details: { revokedCount: revoked.count },
          });
          return { kind: 'REUSE_DETECTED', revokedCount: revoked.count };
        }

        // Invariant 5 : une session expiree ne peut pas etre utilisee pour renouveler l'authentification
        if (existing.expiresAt.getTime() <= now.getTime()) {
          return { kind: 'EXPIRED' };
        }

        const newRawToken = this.generateRawRefreshToken();
        const newTokenHash = this.hashRefreshToken(newRawToken);
        const ttl = meta.ttlSeconds ?? DEFAULT_TTL_SECONDS;
        const expiresAt = new Date(now.getTime() + ttl * 1000);

        const created = await tx.userSession.create({
          data: {
            userId: existing.userId,
            tokenHash: newTokenHash,
            ipAddress: meta.ipAddress ?? existing.ipAddress,
            userAgent: meta.userAgent ?? existing.userAgent,
            expiresAt,
          },
        });

        await tx.userSession.update({
          where: { id: existing.id },
          data: {
            revokedAt: now,
            revocationReason: SessionRevocationReason.ROTATED,
            replacedBySessionId: created.id,
          },
        });

        return {
          kind: 'ROTATED',
          rawRefreshToken: newRawToken,
          session: created,
          previousSessionId: existing.id,
        };
      },
    );

    if (outcome.kind === 'NOT_FOUND') {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (outcome.kind === 'EXPIRED') {
      throw new UnauthorizedException('Refresh token expired');
    }
    if (outcome.kind === 'REUSE_DETECTED') {
      throw new UnauthorizedException(
        'Refresh token reuse detected: all active sessions have been revoked',
      );
    }

    return {
      rawRefreshToken: outcome.rawRefreshToken,
      session: outcome.session,
      previousSessionId: outcome.previousSessionId,
    };
  }

  /** Revoque une session par son refresh token brut (deconnexion unitaire). */
  async revokeByRawToken(
    rawRefreshToken: string,
    reason: SessionRevocationReason = SessionRevocationReason.USER_LOGOUT,
  ): Promise<boolean> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const res = await this.prisma.userSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: reason },
    });
    return res.count > 0;
  }

  /** Revoque toutes les sessions actives d'un utilisateur (logout-all ou alerte de securite). */
  async revokeAllUserSessions(
    userId: string,
    reason: SessionRevocationReason = SessionRevocationReason.LOGOUT_ALL,
  ): Promise<number> {
    const res = await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: reason },
    });
    return res.count;
  }

  /**
   * Politique de conservation (DCTF §8.1) :
   * Les sessions revoquees et expirees sont conservees au minimum 30 jours apres leur date
   * d'expiration (`expires_at`) afin de garantir la detection de reutilisation et la tracabilite.
   * Seules les sessions dont `expires_at <= now - retentionDaysAfterExpiry` sont eligibles a la purge.
   */
  async purgeExpiredSessionsBeyondRetention(
    retentionDaysAfterExpiry: number = MIN_RETENTION_DAYS_AFTER_EXPIRY,
  ): Promise<number> {
    if (retentionDaysAfterExpiry < MIN_RETENTION_DAYS_AFTER_EXPIRY) {
      throw new BadRequestException(
        `Retention period must be at least ${MIN_RETENTION_DAYS_AFTER_EXPIRY} days after expiration`,
      );
    }
    const cutoff = new Date(
      Date.now() - retentionDaysAfterExpiry * 24 * 60 * 60 * 1000,
    );
    const deleted = await this.prisma.userSession.deleteMany({
      where: { expiresAt: { lte: cutoff } },
    });
    return deleted.count;
  }
}
