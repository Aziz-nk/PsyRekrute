import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GlobalRole,
  OrganizationType,
  OrgMemberRole,
  PrismaClient,
  VerificationStatus,
} from '@prisma/client';
import * as request from 'supertest';
import { PrismaModule } from '../../database/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthRegistrationService } from '../auth/auth-registration.service';
import { AuthSessionService } from '../auth/auth-session.service';
import { OrganizationsModule } from './organizations.module';

describe('M5 – Organisations (Socle minimal, membres, rôles, vérification et isolation)', () => {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://psyrekrute_dev_user@127.0.0.1:5432/psyrekrute_db?schema=public';

  let app: INestApplication;
  let prisma: PrismaClient;
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  const users: Record<string, { userId: string; token: string }> = {};

  const registerUser = async (
    key: string,
    globalRole: 'CANDIDATE' | 'ORGANIZATION_USER',
    registration: AuthRegistrationService,
    session: AuthSessionService,
  ) => {
    const reg = await registration.register(
      {
        email: `m5-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@psyrekrute.ma`,
        password: 'phrase de passe m5 test org',
        globalRole,
        termsAccepted: true,
      },
      { ipAddress: '196.200.80.1', userAgent: 'Jest/M5' },
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

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule, AuditModule, OrganizationsModule],
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

    const registration = moduleFixture.get(AuthRegistrationService);
    const session = moduleFixture.get(AuthSessionService);

    // Utilisateurs de test
    await registerUser('orgUser1', 'ORGANIZATION_USER', registration, session);
    await registerUser('orgUser2', 'ORGANIZATION_USER', registration, session);
    await registerUser('orgUser3', 'ORGANIZATION_USER', registration, session);
    await registerUser('orgUser4', 'ORGANIZATION_USER', registration, session);
    await registerUser('candidate', 'CANDIDATE', registration, session);

    // Administrateur système
    const adminUser = await prisma.user.create({
      data: {
        email: `m5-admin-${Date.now()}@psyrekrute.ma`,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fakehash',
        globalRole: GlobalRole.SYSTEM_ADMIN,
        isActive: true,
      },
    });
    createdUserIds.push(adminUser.id);
    const adminToken = await session.signAccessToken({
      sub: adminUser.id,
      email: adminUser.email,
      globalRole: adminUser.globalRole,
      preferredLocale: 'fr',
    });
    users.admin = { userId: adminUser.id, token: adminToken };
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await app.close();
    await prisma.$disconnect();
  });

  describe('1. Création d organisation et rattachement OWNER', () => {
    it('crée une organisation pour ORGANIZATION_USER, rattache le créateur comme OWNER (PENDING) et log l audit', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .send({
          legalName: 'Cabinet Psychologique de Rabat SARL',
          tradeName: 'PsyRabat',
          organizationType: OrganizationType.CABINET_LIBERAL,
          identifierIce: '001234567890123',
          phone: '+212537000000',
          email: 'contact@psyrabat.ma',
          regionCode: 'MA-04',
          cityName: 'Rabat',
          addressLine: '12 Avenue Allal Ben Abdellah',
        })
        .expect(201);

      expect(res.body.statusCode).toBe(201);
      const orgId = res.body.data.id;
      createdOrgIds.push(orgId);

      expect(res.body.data.verificationStatus).toBe(VerificationStatus.PENDING);
      expect(res.body.data.isActive).toBe(true);

      // Vérification du rôle OWNER pour le créateur
      const member = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: users.orgUser1.userId,
          },
        },
      });
      expect(member).toBeDefined();
      expect(member?.role).toBe(OrgMemberRole.OWNER);

      // Vérification de l'événement d'audit
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityType: 'ORGANIZATION',
          entityId: orgId,
          action: 'ORGANIZATION_CREATED',
        },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.userId).toBe(users.orgUser1.userId);
    });

    it('interdit la création d organisation pour un CANDIDATE (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${users.candidate.token}`)
        .send({
          legalName: 'Tentative Candidat',
          tradeName: 'NonAutorise',
          organizationType: OrganizationType.CABINET_LIBERAL,
          phone: '+212537000001',
          email: 'cand@test.ma',
          regionCode: 'MA-04',
          cityName: 'Rabat',
          addressLine: 'Rue test',
        })
        .expect(403);
    });

    it('rejette une tentative de création avec un ICE en doublon (409 Conflict)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${users.orgUser2.token}`)
        .send({
          legalName: 'Cabinet Doublon ICE SARL',
          tradeName: 'Doublon ICE',
          organizationType: OrganizationType.CABINET_LIBERAL,
          identifierIce: '001234567890123', // Déjà utilisé par orgUser1
          phone: '+212537000002',
          email: 'doublon@test.ma',
          regionCode: 'MA-04',
          cityName: 'Rabat',
          addressLine: 'Rue doublon',
        })
        .expect(409);
    });
  });

  describe('2. Consultation et isolation inter-organisations', () => {
    let orgAId: string;
    let orgBId: string;

    beforeAll(async () => {
      // Création Org A par orgUser1
      const resA = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .send({
          legalName: 'Centre Casablanca A SARL',
          tradeName: 'Centre Casa A',
          organizationType: OrganizationType.CMPP,
          phone: '+212522111111',
          email: 'contact@centre-a.ma',
          regionCode: 'MA-06',
          cityName: 'Casablanca',
          addressLine: 'Bd Zerktouni',
        })
        .expect(201);
      orgAId = resA.body.data.id;
      createdOrgIds.push(orgAId);

      // Création Org B par orgUser2
      const resB = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${users.orgUser2.token}`)
        .send({
          legalName: 'Centre Fes B Association',
          tradeName: 'Centre Fes B',
          organizationType: OrganizationType.ASSOCIATION,
          phone: '+212535222222',
          email: 'contact@centre-b.ma',
          regionCode: 'MA-03',
          cityName: 'Fes',
          addressLine: 'Av Hassan II',
        })
        .expect(201);
      orgBId = resB.body.data.id;
      createdOrgIds.push(orgBId);
    });

    it('autorise le OWNER à consulter les détails et les membres de son organisation', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .expect(200);

      expect(res.body.data.id).toBe(orgAId);
      expect(res.body.data.tradeName).toBe('Centre Casa A');

      const membersRes = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/members`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .expect(200);

      expect(membersRes.body.data).toHaveLength(1);
      expect(membersRes.body.data[0].role).toBe(OrgMemberRole.OWNER);
    });

    it('interdit strictement au OWNER de Org A d accéder à Org B (403 Forbidden - Isolation)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgBId}`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgBId}/members`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .expect(403);
    });

    it('autorise SYSTEM_ADMIN à consulter les détails et membres de n importe quelle organisation', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgBId}/members`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .expect(200);
    });
  });

  describe('3. Gestion des membres et permissions des rôles', () => {
    let orgId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .send({
          legalName: 'Cabinet Tanger SARL',
          tradeName: 'Tanger Psy',
          organizationType: OrganizationType.CLINIQUE_SPECIALISEE,
          phone: '+212539000000',
          email: 'contact@tangerpsy.ma',
          regionCode: 'MA-01',
          cityName: 'Tanger',
          addressLine: 'Boulevard Pasteur',
        })
        .expect(201);
      orgId = res.body.data.id;
      createdOrgIds.push(orgId);
    });

    it('permet au OWNER d ajouter un ADMIN et un RECRUITER', async () => {
      // Ajout de orgUser3 comme ADMIN
      const addAdminRes = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .send({
          userId: users.orgUser3.userId,
          role: OrgMemberRole.ADMIN,
        })
        .expect(201);

      expect(addAdminRes.body.data.role).toBe(OrgMemberRole.ADMIN);

      // Ajout de orgUser4 comme RECRUITER
      const addRecruiterRes = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .send({
          userId: users.orgUser4.userId,
          role: OrgMemberRole.RECRUITER,
        })
        .expect(201);

      expect(addRecruiterRes.body.data.role).toBe(OrgMemberRole.RECRUITER);

      // Audit log ORG_MEMBER_ADDED vérifié
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityType: 'ORGANIZATION_MEMBER',
          action: 'ORG_MEMBER_ADDED',
          userId: users.orgUser1.userId,
        },
      });
      expect(auditLog).toBeDefined();
    });

    it('interdit d ajouter un CANDIDATE comme membre d organisation (400 Bad Request)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .send({
          userId: users.candidate.userId,
          role: OrgMemberRole.VIEWER,
        })
        .expect(400);
    });

    it('interdit à un ADMIN de nommer un autre ADMIN (403 Forbidden)', async () => {
      // orgUser3 est ADMIN, tente de nommer orgUser2 comme ADMIN
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${users.orgUser3.token}`)
        .send({
          userId: users.orgUser2.userId,
          role: OrgMemberRole.ADMIN,
        })
        .expect(403);
    });

    it('interdit à un RECRUITER d ajouter un membre (403 Forbidden)', async () => {
      // orgUser4 est RECRUITER
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${users.orgUser4.token}`)
        .send({
          userId: users.orgUser2.userId,
          role: OrgMemberRole.VIEWER,
        })
        .expect(403);
    });

    it('interdit de révoquer le OWNER (400 Bad Request - Protection OWNER)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/organizations/${orgId}/members/${users.orgUser1.userId}`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .expect(400);
    });

    it('interdit à un ADMIN de révoquer un autre ADMIN ou le OWNER (403 Forbidden)', async () => {
      // orgUser3 est ADMIN, tente de révoquer orgUser1 (OWNER)
      await request(app.getHttpServer())
        .delete(`/api/v1/organizations/${orgId}/members/${users.orgUser1.userId}`)
        .set('Authorization', `Bearer ${users.orgUser3.token}`)
        .expect(400); // Bloqué par la protection générale du OWNER

      // Crée un 2e admin par le OWNER
      await prisma.organizationMember.create({
        data: {
          organizationId: orgId,
          userId: users.orgUser2.userId,
          role: OrgMemberRole.ADMIN,
        },
      });

      // orgUser3 (ADMIN) tente de révoquer orgUser2 (ADMIN) -> 403 Forbidden
      await request(app.getHttpServer())
        .delete(`/api/v1/organizations/${orgId}/members/${users.orgUser2.userId}`)
        .set('Authorization', `Bearer ${users.orgUser3.token}`)
        .expect(403);
    });

    it('permet au OWNER de révoquer un membre et log l audit ORG_MEMBER_REMOVED', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/organizations/${orgId}/members/${users.orgUser4.userId}`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .expect(200);

      const member = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: users.orgUser4.userId,
          },
        },
      });
      expect(member).toBeNull();

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityType: 'ORGANIZATION_MEMBER',
          action: 'ORG_MEMBER_REMOVED',
          userId: users.orgUser1.userId,
        },
      });
      expect(auditLog).toBeDefined();
    });

    it('gère les cas limites d ajout et de révocation de membre', async () => {
      // Utilisateur cible inexistant -> 404
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .send({
          userId: '00000000-0000-0000-0000-000000000000',
          role: OrgMemberRole.VIEWER,
        })
        .expect(404);

      // Utilisateur cible déjà membre (orgUser2 est déjà ADMIN) -> 409
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .send({
          userId: users.orgUser2.userId,
          role: OrgMemberRole.VIEWER,
        })
        .expect(409);

      // Utilisateur cible est SYSTEM_ADMIN -> 400
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/members`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .send({
          userId: users.admin.userId,
          role: OrgMemberRole.VIEWER,
        })
        .expect(400);

      // Révocation d'un membre introuvable -> 404
      await request(app.getHttpServer())
        .delete(
          `/api/v1/organizations/${orgId}/members/00000000-0000-0000-0000-000000000000`,
        )
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .expect(404);
    });
  });

  describe('4. Vérification administrative (SYSTEM_ADMIN exclusif, DCTF §4.2)', () => {
    let orgId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .send({
          legalName: 'Centre Marrakech SARL',
          tradeName: 'Marrakech Psy',
          organizationType: OrganizationType.ECOLE_INCLUSIVE,
          phone: '+212524000000',
          email: 'contact@marrakechpsy.ma',
          regionCode: 'MA-07',
          cityName: 'Marrakech',
          addressLine: 'Gueliz',
        })
        .expect(201);
      orgId = res.body.data.id;
      createdOrgIds.push(orgId);
    });

    it('permet à SYSTEM_ADMIN de valider une organisation (VERIFIED) avec verifiedAt et audit log', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/organizations/${orgId}/verification`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({
          status: VerificationStatus.VERIFIED,
          reason: 'Registre de commerce et ICE conformes',
        })
        .expect(200);

      expect(res.body.data.verificationStatus).toBe(VerificationStatus.VERIFIED);
      expect(res.body.data.verifiedAt).not.toBeNull();

      const auditLog = await prisma.auditLog.findFirst({
        where: {
          entityType: 'ORGANIZATION',
          entityId: orgId,
          action: 'ORGANIZATION_VERIFIED',
          userId: users.admin.userId,
        },
      });
      expect(auditLog).toBeDefined();
    });

    it('interdit à un ORGANIZATION_USER ou CANDIDATE d effectuer la vérification (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/organizations/${orgId}/verification`)
        .set('Authorization', `Bearer ${users.orgUser1.token}`)
        .send({
          status: VerificationStatus.VERIFIED,
        })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/organizations/${orgId}/verification`)
        .set('Authorization', `Bearer ${users.candidate.token}`)
        .send({
          status: VerificationStatus.VERIFIED,
        })
        .expect(403);
    });

    it('renvoie 404 si l organisation est introuvable lors de la vérification administrative', async () => {
      await request(app.getHttpServer())
        .patch(
          '/api/v1/admin/organizations/00000000-0000-0000-0000-000000000000/verification',
        )
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({
          status: VerificationStatus.VERIFIED,
        })
        .expect(404);
    });
  });

  describe('5. Contrôle des erreurs d authentification', () => {
    it('renvoie 401 Unauthorized sans token JWT', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .send({})
        .expect(401);

      await request(app.getHttpServer())
        .get('/api/v1/organizations/550e8400-e29b-41d4-a716-446655440000')
        .expect(401);
    });
  });
});
