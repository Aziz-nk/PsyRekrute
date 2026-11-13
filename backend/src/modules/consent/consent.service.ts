import { BadRequestException, Injectable } from '@nestjs/common';
import { Consent } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CONSENT_TYPES, ConsentType } from './dto/update-consent.dto';

export const OPTIONAL_CONSENT_TYPES: readonly ConsentType[] = [
  'TALENT_POOL_MATCHING',
];

export interface ConsentStateView {
  consentType: ConsentType;
  hasConsented: boolean;
  version: string | null;
  consentedAt: Date | null;
}

export interface ConsentChangeContext {
  ipAddress: string;
  userAgent: string;
}

export interface ConsentChangeResult extends ConsentStateView {
  changed: boolean;
}

/**
 * M4 – Gestion des consentements (DCTF §3.3 #21, §8.5, DEC-02/D4).
 * Historique append-only : chaque changement cree une nouvelle ligne CONSENTS,
 * jamais de modification ni de suppression. L'etat courant est la ligne la plus recente.
 */
@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Derniers etats connus de chaque type ; les types jamais accordes apparaissent a false. */
  async getCurrentConsents(userId: string): Promise<ConsentStateView[]> {
    const rows = await this.prisma.consent.findMany({
      where: { userId },
      orderBy: [{ consentedAt: 'desc' }],
    });

    return CONSENT_TYPES.map((consentType) => {
      const latest = rows.find((r) => r.consentType === consentType);
      return latest
        ? this.toView(latest)
        : { consentType, hasConsented: false, version: null, consentedAt: null };
    });
  }

  /** Enregistre un accord ou une revocation du consentement facultatif. */
  async updateConsent(
    userId: string,
    input: { consentType: ConsentType; hasConsented: boolean; version: string },
    context: ConsentChangeContext,
  ): Promise<ConsentChangeResult> {
    if (!OPTIONAL_CONSENT_TYPES.includes(input.consentType)) {
      throw new BadRequestException(
        `${input.consentType} is mandatory and cannot be modified through this endpoint`,
      );
    }

    const ipAddress = (context.ipAddress || '0.0.0.0').slice(0, 45);
    const userAgent = (context.userAgent || 'unknown').slice(0, 512);

    return this.prisma.$transaction(async (tx) => {
      // Serialise les changements concurrents d'un meme utilisateur
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId}::uuid FOR UPDATE`;

      const current = await tx.consent.findFirst({
        where: { userId, consentType: input.consentType },
        orderBy: [{ consentedAt: 'desc' }],
      });

      if (
        current &&
        current.hasConsented === input.hasConsented &&
        current.version === input.version
      ) {
        return { ...this.toView(current), changed: false };
      }

      // Horodatage strictement croissant pour garantir un ordre d'historique sans ambiguite
      const now = Date.now();
      const consentedAt = new Date(
        current ? Math.max(now, current.consentedAt.getTime() + 1) : now,
      );

      const created = await tx.consent.create({
        data: {
          userId,
          consentType: input.consentType,
          version: input.version,
          hasConsented: input.hasConsented,
          ipAddress,
          userAgent,
          consentedAt,
        },
      });

      await this.auditService.recordInTx(tx, {
        userId,
        action: input.hasConsented ? 'CONSENT_UPDATED' : 'CONSENT_REVOKED',
        entityType: 'CONSENT',
        entityId: created.id,
        ipAddress,
        userAgent,
        details: {
          consentType: input.consentType,
          version: input.version,
          previousState: current
            ? { hasConsented: current.hasConsented, version: current.version }
            : null,
        },
      });

      return { ...this.toView(created), changed: true };
    });
  }

  private toView(row: Consent): ConsentStateView {
    return {
      consentType: row.consentType as ConsentType,
      hasConsented: row.hasConsented,
      version: row.version,
      consentedAt: row.consentedAt,
    };
  }
}
