import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** Evenements d'audit pris en charge (DCTF §3.3 #22, §8.4 et Sprint 2). */
export const AUDIT_ACTIONS = [
  // Authentification et securite
  'USER_REGISTERED',
  'USER_LOGIN_SUCCESS',
  'USER_LOGIN_FAILED',
  'USER_LOGOUT_ALL',
  'SESSION_REUSE_DETECTED',
  'CONSENT_UPDATED',
  'CONSENT_REVOKED',
  // Evenements metier (utilises par les modules suivants)
  'CV_DOWNLOAD',
  'PROFILE_UNMASK',
  'ORG_VERIFICATION_VIEW',
  'ORGANIZATION_CREATED',
  'ORGANIZATION_VERIFIED',
  'ORG_MEMBER_ADDED',
  'ORG_MEMBER_REMOVED',
  'OFFER_PUBLISH',
  'INVITATION_SENT',
  'APPLICATION_STATUS_UPDATE',
  'EXTERNAL_JOB_IMPORT_URL',
  'EXTERNAL_JOB_PUBLISH',
  'EXTERNAL_JOB_REJECT',
  'EXTERNAL_JOB_EXPIRE',
  'EXTERNAL_JOB_RSS_COLLECT',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEventInput {
  action: AuditAction;
  userId?: string | null;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}

export interface AuditLogQuery {
  page: number;
  limit: number;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
}

export interface PaginatedAuditLogs {
  data: AuditLog[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Client Prisma minimal accepte par recordInTx (transaction interactive ou client racine). */
export type AuditTxClient = Pick<Prisma.TransactionClient, 'auditLog'>;

const SENSITIVE_KEY_REGEX =
  /pass(word)?|hash|token|secret|cookie|authorization|jwt|credential|api[-_]?key/i;
const JWT_VALUE_REGEX = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
const REDACTED = '[REDACTED]';
const MAX_DEPTH = 5;

/**
 * Assainit recursivement le contexte d'audit : supprime la valeur de toute cle sensible
 * (mot de passe, hash, jeton, cookie, secret...) et masque toute valeur ressemblant
 * a un hash Argon2 ou a un JWT.
 */
export function sanitizeAuditDetails(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return REDACTED;
  }
  if (typeof value === 'string') {
    if (value.startsWith('$argon2') || JWT_VALUE_REGEX.test(value)) {
      return REDACTED;
    }
    return value.slice(0, 1000);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditDetails(item, depth + 1));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_REGEX.test(key)
        ? REDACTED
        : sanitizeAuditDetails(val, depth + 1);
    }
    return out;
  }
  return value;
}

function normalizeAuditIp(rawIp: string | null | undefined): string {
  const trimmed = (rawIp ?? '').trim();
  if (trimmed.length === 0) {
    return '0.0.0.0';
  }
  const ip = trimmed.toLowerCase().startsWith('::ffff:')
    ? trimmed.slice(7)
    : trimmed;
  return ip.slice(0, 45);
}

/**
 * M3 – Service d'audit centralise (`AUDIT_LOGS`).
 * Immuable cote application : expose uniquement creation et lecture
 * (aucune methode de modification ou de suppression).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Enregistre un evenement d'audit hors transaction. */
  async record(event: AuditEventInput): Promise<AuditLog> {
    return this.recordInTx(this.prisma, event);
  }

  /** Enregistre un evenement d'audit dans une transaction Prisma existante. */
  async recordInTx(tx: AuditTxClient, event: AuditEventInput): Promise<AuditLog> {
    return tx.auditLog.create({ data: this.buildData(event) });
  }

  /** Lecture paginee et filtree, triee par createdAt DESC. */
  async findMany(query: AuditLogQuery): Promise<PaginatedAuditLogs> {
    const where: Prisma.AuditLogWhereInput = {
      userId: query.userId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
    };
    if (query.from || query.to) {
      where.createdAt = { gte: query.from, lte: query.to };
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private buildData(event: AuditEventInput): Prisma.AuditLogUncheckedCreateInput {
    const sanitized = sanitizeAuditDetails(event.details ?? {}) as Record<
      string,
      unknown
    >;
    const userAgent = (event.userAgent ?? '').trim().slice(0, 512);
    const details = userAgent ? { ...sanitized, userAgent } : sanitized;

    return {
      userId: event.userId ?? null,
      action: event.action,
      entityType: event.entityType.slice(0, 50),
      entityId: event.entityId,
      ipAddress: normalizeAuditIp(event.ipAddress),
      details: details as Prisma.InputJsonObject,
      createdAt: new Date(),
    };
  }
}
