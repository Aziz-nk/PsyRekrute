import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { PrismaModule } from '../../database/prisma.module';
import { AuditService } from '../audit/audit.service';
import { AuthRegistrationService } from '../auth/auth-registration.service';
import { AuthSessionService } from '../auth/auth-session.service';
import { ConsentModule } from './consent.module';

describe('M4 – Consentements (GET/PUT /api/v1/me/consents)', () => {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://psyrekrute_dev_user@127.0.0.1:5432/psyrekrute_db?schema=public';
  let app: INestApplication;
  let prisma: PrismaClient;
  let auditService: AuditService;
  const createdUserIds: string[] = [];

  const users: Record<string, { userId: string; token: string }> = {};
  const URL = '/api/v1/me/consents';

  const register = async (
    key: string,
    globalRole: 'CANDIDATE' | 'ORGANIZATION_USER',
    registration: AuthRegistrationService,
    session: AuthSessionService,
  ) => {
    const reg = await registration.register(
      {
        email: `m4-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@psyrekrute.ma`,
        password: 'phrase de passe consentement m4',
        globalRole,
        termsAccepted: true,
      },
      { ipAddress: '196.200.70.1', userAgent: 'Jest/M4' },
    );
    createdUserIds.push(reg.userId);
    const token = await session.signAccessToken({
      sub: reg.userId,
      email: reg.email,
      globalRole: reg.globalRole,
      preferredLocale: 'fr',
    });
    users[key] = { userId: reg.userId, token };
  };

  const put = (key: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .put(URL)
      .set('Authorization', `Bearer ${users[key].token}`)
      .set('User-Agent', 'Jest/M4-PUT')
      .send(body);

  const talentRows = (userId: string) =>
    prisma.consent.findMany({
      where: { userId, consentType: 'TALENT_POOL_MATCHING' },
      orderBy: { consentedAt: 'asc' },
    });

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, ConsentModule],
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
    const registration = moduleFixture.get(AuthRegistrationService);
    const session = moduleFixture.get(AuthSessionService);
    await register('cand1', 'CANDIDATE', registration, session);
    await register('cand2', 'CANDIDATE', registration, session);
    await register('org', 'ORGANIZATION_USER', registration, session);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
    await prisma.$disconnect();
  });

  it('1. GET apres inscription : consentements obligatoires a true et TALENT_POOL_MATCHING a false', async () => {
    const res = await request(app.getHttpServer())
      .get(URL)
      .set('Authorization', `Bearer ${users.cand1.token}`)
      .expect(200);

    expect(res.body.statusCode).toBe(200);
    const byType = Object.fromEntries(
      res.body.data.map((c: { consentType: string }) => [c.consentType, c]),
    );
    expect(byType.TERMS_OF_SERVICE).toMatchObject({ hasConsented: true });
    expect(byType.PRIVACY_POLICY).toMatchObject({ hasConsented: true });
    expect(byType.TALENT_POOL_MATCHING).toEqual({
      consentType: 'TALENT_POOL_MATCHING',
      hasConsented: false,
      version: null,
      consentedAt: null,
    });

    // GET accessible aussi a ORGANIZATION_USER
    await request(app.getHttpServer())
      .get(URL)
      .set('Authorization', `Bearer ${users.org.token}`)
      .expect(200);
  });

  it('2-6. accord, revocation, historique, changement de version et requete sans changement', async () => {
    const { userId } = users.cand1;

    // 2. Accord explicite
    const granted = await put('cand1', {
      consentType: 'TALENT_POOL_MATCHING',
      hasConsented: true,
      version: '1.0',
    }).expect(200);
    expect(granted.body.data).toMatchObject({
      consentType: 'TALENT_POOL_MATCHING',
      hasConsented: true,
      version: '1.0',
      changed: true,
    });

    // 6. Requete identique : aucune nouvelle ligne
    const same = await put('cand1', {
      consentType: 'TALENT_POOL_MATCHING',
      hasConsented: true,
      version: '1.0',
    }).expect(200);
    expect(same.body.data.changed).toBe(false);
    expect(await talentRows(userId)).toHaveLength(1);

    // 5. Changement de version avec etat identique : enregistre
    await put('cand1', {
      consentType: 'TALENT_POOL_MATCHING',
      hasConsented: true,
      version: '1.1',
    }).expect(200);

    // 3. Revocation
    const revoked = await put('cand1', {
      consentType: 'TALENT_POOL_MATCHING',
      hasConsented: false,
      version: '1.1',
    }).expect(200);
    expect(revoked.body.data).toMatchObject({
      hasConsented: false,
      changed: true,
    });

    // 4. Historique conserve (append-only)
    const rows = await talentRows(userId);
    expect(rows.map((r) => [r.hasConsented, r.version])).toEqual([
      [true, '1.0'],
      [true, '1.1'],
      [false, '1.1'],
    ]);
    expect(rows.every((r) => r.userAgent === 'Jest/M4-PUT')).toBe(true);

    // Etat courant via GET
    const current = await request(app.getHttpServer())
      .get(URL)
      .set('Authorization', `Bearer ${users.cand1.token}`)
      .expect(200);
    expect(
      current.body.data.find(
        (c: { consentType: string }) => c.consentType === 'TALENT_POOL_MATCHING',
      ),
    ).toMatchObject({ hasConsented: false, version: '1.1' });

    // Audit : 2 CONSENT_UPDATED + 1 CONSENT_REVOKED, sans secret
    const logs = await prisma.auditLog.findMany({
      where: { userId, entityType: 'CONSENT' },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual([
      'CONSENT_UPDATED',
      'CONSENT_UPDATED',
      'CONSENT_REVOKED',
    ]);
    expect(logs[2].details).toMatchObject({
      consentType: 'TALENT_POOL_MATCHING',
      version: '1.1',
      previousState: { hasConsented: true, version: '1.1' },
    });
    expect(JSON.stringify(logs)).not.toMatch(/argon2|password|token/i);
  });

  it('7-8. refuse les consentements obligatoires, les champs inconnus et le userId injecte (400)', async () => {
    for (const consentType of ['TERMS_OF_SERVICE', 'PRIVACY_POLICY']) {
      await put('cand2', {
        consentType,
        hasConsented: false,
        version: '1.0',
      }).expect(400);
    }
    for (const body of [
      { consentType: 'TALENT_POOL_MATCHING', hasConsented: true, version: '1.0', userId: users.cand1.userId },
      { consentType: 'TALENT_POOL_MATCHING', hasConsented: true, version: '1.0', extra: 1 },
      { consentType: 'MARKETING', hasConsented: true, version: '1.0' },
      { consentType: 'TALENT_POOL_MATCHING', hasConsented: 'yes', version: '1.0' },
      { consentType: 'TALENT_POOL_MATCHING', hasConsented: true, version: 'abc' },
      { consentType: 'TALENT_POOL_MATCHING', hasConsented: true },
    ]) {
      await put('cand2', body).expect(400);
    }
    // Aucune ligne creee pour cand2 ni pour cand1 via l'injection
    expect(await talentRows(users.cand2.userId)).toHaveLength(0);
    const mandatory = await prisma.consent.count({
      where: {
        userId: users.cand2.userId,
        consentType: { in: ['TERMS_OF_SERVICE', 'PRIVACY_POLICY'] },
      },
    });
    expect(mandatory).toBe(2);
  });

  it('9-10. 401 sans token (GET et PUT) et 403 pour ORGANIZATION_USER en PUT', async () => {
    await request(app.getHttpServer()).get(URL).expect(401);
    await request(app.getHttpServer())
      .put(URL)
      .send({ consentType: 'TALENT_POOL_MATCHING', hasConsented: true, version: '1.0' })
      .expect(401);

    await put('org', {
      consentType: 'TALENT_POOL_MATCHING',
      hasConsented: true,
      version: '1.0',
    }).expect(403);
    expect(await talentRows(users.org.userId)).toHaveLength(0);
  });

  it('11. isolation : les changements d un utilisateur n affectent pas un autre', async () => {
    await put('cand2', {
      consentType: 'TALENT_POOL_MATCHING',
      hasConsented: true,
      version: '1.0',
    }).expect(200);

    const res1 = await request(app.getHttpServer())
      .get(URL)
      .set('Authorization', `Bearer ${users.cand1.token}`)
      .expect(200);
    const res2 = await request(app.getHttpServer())
      .get(URL)
      .set('Authorization', `Bearer ${users.cand2.token}`)
      .expect(200);

    const talent = (body: { data: Array<{ consentType: string; hasConsented: boolean }> }) =>
      body.data.find((c) => c.consentType === 'TALENT_POOL_MATCHING');
    expect(talent(res1.body)?.hasConsented).toBe(false);
    expect(talent(res2.body)?.hasConsented).toBe(true);
  });

  it('12. echec de l audit : rollback complet de l insertion du consentement', async () => {
    const before = await talentRows(users.cand2.userId);
    const spy = jest
      .spyOn(auditService, 'recordInTx')
      .mockRejectedValueOnce(new Error('Simulated audit failure'));

    try {
      await put('cand2', {
        consentType: 'TALENT_POOL_MATCHING',
        hasConsented: false,
        version: '1.0',
      }).expect(500);
    } finally {
      spy.mockRestore();
    }

    const after = await talentRows(users.cand2.userId);
    expect(after).toHaveLength(before.length);
    expect(after[after.length - 1].hasConsented).toBe(true);
  });
});
