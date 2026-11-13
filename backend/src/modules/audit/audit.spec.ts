import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { GlobalRole, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as request from 'supertest';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { getJwtAccessSecret } from '../auth/jwt-auth.guard';
import { UserSessionsService } from '../auth/user-sessions.service';
import { AuditModule } from './audit.module';
import { AuditService, sanitizeAuditDetails } from './audit.service';

describe('M3 – AuditService et GET /api/v1/admin/audit-logs', () => {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://psyrekrute_dev_user@127.0.0.1:5432/psyrekrute_db?schema=public';
  let app: INestApplication;
  let prisma: PrismaClient;
  let auditService: AuditService;
  let userSessionsService: UserSessionsService;
  let jwtService: JwtService;
  const createdUserIds: string[] = [];
  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};

  const createUser = async (role: GlobalRole, key: string) => {
    const user = await prisma.user.create({
      data: {
        email: `m3-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@psyrekrute.ma`,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder',
        globalRole: role,
      },
    });
    createdUserIds.push(user.id);
    userIds[key] = user.id;
    tokens[key] = await jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        globalRole: role,
        preferredLocale: 'fr',
      },
      { secret: getJwtAccessSecret(), algorithm: 'HS256', expiresIn: 900 },
    );
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, AuditModule, AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    auditService = moduleFixture.get(AuditService);
    userSessionsService = moduleFixture.get(UserSessionsService);
    jwtService = moduleFixture.get(JwtService);

    await createUser(GlobalRole.SYSTEM_ADMIN, 'admin');
    await createUser(GlobalRole.CANDIDATE, 'candidate');
    await createUser(GlobalRole.ORGANIZATION_USER, 'orguser');
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  describe('1. AuditService : creation, transaction, assainissement et immuabilite', () => {
    it('cree un evenement (UTC, IP normalisee, userAgent dans details) et accepte userId null', async () => {
      const entityId = randomUUID();
      const before = Date.now();
      const log = await auditService.record({
        action: 'CV_DOWNLOAD',
        userId: userIds.admin,
        entityType: 'CANDIDATE_PROFILE',
        entityId,
        ipAddress: '::ffff:41.140.10.25',
        userAgent: 'Jest/M3',
        details: { fileName: 'cv.pdf' },
      });

      expect(log.action).toBe('CV_DOWNLOAD');
      expect(log.ipAddress).toBe('41.140.10.25');
      expect(log.details).toEqual({ fileName: 'cv.pdf', userAgent: 'Jest/M3' });
      expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);

      const anonymous = await auditService.record({
        action: 'ORG_VERIFICATION_VIEW',
        entityType: 'ORGANIZATION',
        entityId,
        ipAddress: 'x'.repeat(80),
      });
      expect(anonymous.userId).toBeNull();
      expect(anonymous.ipAddress).toHaveLength(45);
      await prisma.auditLog.deleteMany({ where: { entityId } });
    });

    it('enregistre dans une transaction existante et annule l audit en cas de rollback', async () => {
      const entityId = randomUUID();
      await expect(
        prisma.$transaction(async (tx) => {
          await auditService.recordInTx(tx, {
            action: 'ORGANIZATION_CREATED',
            userId: userIds.orguser,
            entityType: 'ORGANIZATION',
            entityId,
            ipAddress: '127.0.0.1',
          });
          throw new Error('rollback volontaire');
        }),
      ).rejects.toThrow('rollback volontaire');
      expect(await prisma.auditLog.count({ where: { entityId } })).toBe(0);

      await prisma.$transaction(async (tx) => {
        await auditService.recordInTx(tx, {
          action: 'ORGANIZATION_CREATED',
          userId: userIds.orguser,
          entityType: 'ORGANIZATION',
          entityId,
          ipAddress: '127.0.0.1',
        });
      });
      expect(await prisma.auditLog.count({ where: { entityId } })).toBe(1);
    });

    it('n enregistre jamais de mot de passe, hash, jeton, cookie ou secret', async () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcDEF123_-signature';
      const log = await auditService.record({
        action: 'USER_LOGIN_FAILED',
        userId: userIds.candidate,
        entityType: 'USER',
        entityId: userIds.candidate,
        ipAddress: '127.0.0.1',
        details: {
          password: 'motdepasse-en-clair',
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$xyz',
          refreshToken: 'raw-refresh-token-value',
          cookie: 'psyrekrute_refresh_token=abc',
          nested: { apiKey: 'k', clientSecret: 's', note: jwt },
          leakedHash: '$argon2id$v=19$abc',
          reason: 'INVALID_PASSWORD',
        },
      });

      const raw = JSON.stringify(log.details);
      for (const secret of [
        'motdepasse-en-clair',
        '$argon2id$',
        'raw-refresh-token-value',
        'psyrekrute_refresh_token=abc',
        jwt,
      ]) {
        expect(raw).not.toContain(secret);
      }
      expect(log.details).toMatchObject({
        password: '[REDACTED]',
        nested: { apiKey: '[REDACTED]', clientSecret: '[REDACTED]', note: '[REDACTED]' },
        reason: 'INVALID_PASSWORD',
      });
      expect(sanitizeAuditDetails([new Date(0)])).toEqual([
        '1970-01-01T00:00:00.000Z',
      ]);
    });

    it('n expose aucune methode de modification ou de suppression', () => {
      const proto = Object.getOwnPropertyNames(AuditService.prototype);
      expect(proto.sort()).toEqual(
        ['constructor', 'record', 'recordInTx', 'findMany', 'buildData'].sort(),
      );
      expect(proto.some((m) => /update|delete|remove|upsert/i.test(m))).toBe(
        false,
      );
    });

    it('journalise SESSION_REUSE_DETECTED atomiquement lors de la reutilisation d un refresh token', async () => {
      const issued = await userSessionsService.createSession({
        userId: userIds.candidate,
      });
      await userSessionsService.rotateSession(issued.rawRefreshToken);
      await expect(
        userSessionsService.rotateSession(issued.rawRefreshToken, {
          ipAddress: '196.200.60.1',
          userAgent: 'Attacker/1.0',
        }),
      ).rejects.toThrow(/reuse detected/);

      const reuseLog = await prisma.auditLog.findFirstOrThrow({
        where: {
          action: 'SESSION_REUSE_DETECTED',
          entityId: issued.session.id,
        },
      });
      expect(reuseLog.userId).toBe(userIds.candidate);
      expect(reuseLog.ipAddress).toBe('196.200.60.1');
      expect(reuseLog.details).toMatchObject({ userAgent: 'Attacker/1.0' });
      await prisma.userSession.deleteMany({
        where: { userId: userIds.candidate },
      });
    });
  });

  describe('2. GET /api/v1/admin/audit-logs : RBAC, pagination, filtres et tri', () => {
    it('retourne 401 sans authentification et 403 pour CANDIDATE et ORGANIZATION_USER', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/audit-logs')
        .expect(401);
      for (const key of ['candidate', 'orguser']) {
        await request(app.getHttpServer())
          .get('/api/v1/admin/audit-logs')
          .set('Authorization', `Bearer ${tokens[key]}`)
          .expect(403);
      }
    });

    it('pagine, filtre et trie par createdAt DESC pour SYSTEM_ADMIN', async () => {
      const entityId = randomUUID();
      const actions = ['OFFER_PUBLISH', 'INVITATION_SENT', 'APPLICATION_STATUS_UPDATE'] as const;
      for (const action of actions) {
        await auditService.record({
          action,
          userId: userIds.orguser,
          entityType: 'JOB_OFFER',
          entityId,
          ipAddress: '127.0.0.1',
        });
        await new Promise((r) => setTimeout(r, 15));
      }

      const page1 = await request(app.getHttpServer())
        .get(`/api/v1/admin/audit-logs?entityId=${entityId}&limit=2&page=1`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);

      expect(page1.body.statusCode).toBe(200);
      expect(page1.body.meta).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      expect(page1.body.data.map((l: { action: string }) => l.action)).toEqual([
        'APPLICATION_STATUS_UPDATE',
        'INVITATION_SENT',
      ]);

      const page2 = await request(app.getHttpServer())
        .get(`/api/v1/admin/audit-logs?entityId=${entityId}&limit=2&page=2`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.data[0].action).toBe('OFFER_PUBLISH');

      const filtered = await request(app.getHttpServer())
        .get(
          `/api/v1/admin/audit-logs?entityId=${entityId}&action=INVITATION_SENT&entityType=JOB_OFFER&userId=${userIds.orguser}&from=2000-01-01T00:00:00Z&to=2999-01-01T00:00:00Z`,
        )
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
      expect(filtered.body.meta.total).toBe(1);
      expect(filtered.body.data[0].action).toBe('INVITATION_SENT');

      const defaults = await request(app.getHttpServer())
        .get(`/api/v1/admin/audit-logs?entityId=${randomUUID()}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
      expect(defaults.body).toEqual({
        statusCode: 200,
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    });

    it('rejette les parametres invalides (400)', async () => {
      for (const qs of [
        'limit=101',
        'page=0',
        'userId=not-a-uuid',
        'entityId=123',
        'from=hier',
        'from=2026-12-01T00:00:00Z&to=2026-01-01T00:00:00Z',
        'unknown=1',
      ]) {
        await request(app.getHttpServer())
          .get(`/api/v1/admin/audit-logs?${qs}`)
          .set('Authorization', `Bearer ${tokens.admin}`)
          .expect(400);
      }
    });
  });
});
