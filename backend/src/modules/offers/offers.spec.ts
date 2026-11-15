import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DegreeLevel,
  GlobalRole,
  LanguageProficiency,
  OfferType,
  OrganizationType,
  OrgMemberRole,
  PrismaClient,
  SkillLevel,
  VerificationStatus,
} from '@prisma/client';
import * as request from 'supertest';
import { PrismaModule } from '../../database/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthRegistrationService } from '../auth/auth-registration.service';
import { AuthSessionService } from '../auth/auth-session.service';
import { OrganizationsModule } from '../organizations/organizations.module';
import { OffersModule } from './offers.module';

describe('M3.2 – Gestion des offres d emploi et de stage (Job Offers)', () => {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://psyrekrute_dev_user@127.0.0.1:5432/psyrekrute_db?schema=public';

  let app: INestApplication;
  let prisma: PrismaClient;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];
  let specialtyId = '';
  let secondSpecialtyId = '';
  let skillId1 = '';
  let skillId2 = '';

  const users: Record<string, { userId: string; token: string }> = {};

  let orgAId = '';
  let orgBId = '';
  let offerDraftId = '';
  let offerPublishedId = '';

  const registerUser = async (
    key: string,
    globalRole: 'CANDIDATE' | 'ORGANIZATION_USER',
    registration: AuthRegistrationService,
    session: AuthSessionService,
  ) => {
    const reg = await registration.register(
      {
        email: `m32-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@psyrekrute.ma`,
        password: 'phrase de passe m32 test offres',
        globalRole,
        termsAccepted: true,
      },
      { ipAddress: '196.200.80.10', userAgent: 'Jest/M3.2' },
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
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
        AuditModule,
        OrganizationsModule,
        OffersModule,
      ],
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

    await registerUser('ownerA', 'ORGANIZATION_USER', registration, session);
    await registerUser('adminA', 'ORGANIZATION_USER', registration, session);
    await registerUser('recruiterA', 'ORGANIZATION_USER', registration, session);
    await registerUser('viewerA', 'ORGANIZATION_USER', registration, session);
    await registerUser('ownerB', 'ORGANIZATION_USER', registration, session);
    await registerUser('candidate', 'CANDIDATE', registration, session);

    const sysAdmin = await prisma.user.create({
      data: {
        email: `m32-sysadmin-${Date.now()}@psyrekrute.ma`,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$fakehash',
        globalRole: GlobalRole.SYSTEM_ADMIN,
        isActive: true,
      },
    });
    createdUserIds.push(sysAdmin.id);
    const sysAdminToken = await session.signAccessToken({
      sub: sysAdmin.id,
      email: sysAdmin.email,
      globalRole: sysAdmin.globalRole,
      preferredLocale: 'fr',
    });
    users.sysAdmin = { userId: sysAdmin.id, token: sysAdminToken };

    // Récupérer ou créer 2 spécialités et 2 compétences
    const specialties = await prisma.refSpecialty.findMany({
      where: { isActive: true },
      take: 2,
    });
    if (specialties.length >= 2) {
      specialtyId = specialties[0].id;
      secondSpecialtyId = specialties[1].id;
    } else {
      const sp1 = await prisma.refSpecialty.create({
        data: {
          code: `SPEC_M32_1_${Date.now()}`,
          titleFr: 'Psychologie de l Éducation',
          titleAr: 'علم النفس التربوي',
          titleEn: 'Educational Psychology',
          isActive: true,
        },
      });
      const sp2 = await prisma.refSpecialty.create({
        data: {
          code: `SPEC_M32_2_${Date.now()}`,
          titleFr: 'Neuropsychologie Infantile',
          titleAr: 'علم النفس العصبي للطفل',
          titleEn: 'Child Neuropsychology',
          isActive: true,
        },
      });
      specialtyId = sp1.id;
      secondSpecialtyId = sp2.id;
    }

    const skills = await prisma.refSkill.findMany({ take: 2 });
    if (skills.length >= 2) {
      skillId1 = skills[0].id;
      skillId2 = skills[1].id;
    } else {
      const sk1 = await prisma.refSkill.create({
        data: {
          code: `SKILL_M32_1_${Date.now()}`,
          category: 'TEST_PSYCHOMETRIQUE',
          titleFr: 'WISC-V',
          titleAr: 'مقياس وكسلر',
          titleEn: 'WISC-V',
        },
      });
      const sk2 = await prisma.refSkill.create({
        data: {
          code: `SKILL_M32_2_${Date.now()}`,
          category: 'METHODE_EDUCATIVE',
          titleFr: 'TEACCH',
          titleAr: 'تيتش',
          titleEn: 'TEACCH',
        },
      });
      skillId1 = sk1.id;
      skillId2 = sk2.id;
    }

    // Créer Organisation A (statut initial PENDING) et ses membres
    const resOrgA = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${users.ownerA.token}`)
      .send({
        legalName: 'Centre Psycho-Éducatif Al-Inara SARL',
        tradeName: 'Centre Al-Inara',
        organizationType: OrganizationType.CMPP,
        identifierIce: `${Math.floor(100000000000000 + Math.random() * 899999999999999)}`,
        phone: '+212537000001',
        email: 'contact@alinara.ma',
        regionCode: 'MA-04',
        cityName: 'Rabat',
        addressLine: '14 Avenue Mohammed V, Rabat',
      })
      .expect(201);

    orgAId = resOrgA.body.data.id;
    createdOrgIds.push(orgAId);

    // Ajouter adminA, recruiterA et viewerA dans OrgA
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgAId}/members`)
      .set('Authorization', `Bearer ${users.ownerA.token}`)
      .send({ userId: users.adminA.userId, role: OrgMemberRole.ADMIN })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgAId}/members`)
      .set('Authorization', `Bearer ${users.ownerA.token}`)
      .send({ userId: users.recruiterA.userId, role: OrgMemberRole.RECRUITER })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgAId}/members`)
      .set('Authorization', `Bearer ${users.ownerA.token}`)
      .send({ userId: users.viewerA.userId, role: OrgMemberRole.VIEWER })
      .expect(201);

    // Créer Organisation B
    const resOrgB = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${users.ownerB.token}`)
      .send({
        legalName: 'Association Horizon Inclusif',
        tradeName: 'Horizon Inclusif',
        organizationType: OrganizationType.ASSOCIATION,
        identifierIce: `${Math.floor(100000000000000 + Math.random() * 899999999999999)}`,
        phone: '+212522000002',
        email: 'contact@horizon.ma',
        regionCode: 'MA-06',
        cityName: 'Casablanca',
        addressLine: '28 Bd d Anfa, Casablanca',
      })
      .expect(201);

    orgBId = resOrgB.body.data.id;
    createdOrgIds.push(orgBId);
  });

  afterAll(async () => {
    if (createdOrgIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
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

  describe('1. Contrôle des rôles et Création des offres', () => {
    const validOfferPayload = () => ({
      title: 'Stage PFE en Neuropsychologie Infantile',
      offerType: OfferType.STAGE_PFE,
      contractSubType: 'CONVENTION_STAGE',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      targetSpecialtyId: specialtyId,
      regionCode: 'MA-04',
      cityName: 'Rabat',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      startDate: '2026-04-01',
      durationMonths: 6,
      remunerationStipend: '2000 MAD / mois',
      description:
        'Stage de fin d études encadré au sein du pôle neuropsychologie infantile pour bilans et remédiation cognitive.',
      requiredSkills: [
        {
          skillId: skillId1,
          isMandatory: true,
          minRequiredLevel: SkillLevel.PRATIQUANT,
          weight: 2,
        },
        {
          skillId: skillId2,
          isMandatory: false,
          minRequiredLevel: SkillLevel.NOTIONS,
          weight: 1,
        },
      ],
      requiredLanguages: [
        {
          languageCode: 'FR',
          minProficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
          isMandatory: true,
        },
        {
          languageCode: 'AR_DARIJA',
          minProficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
          isMandatory: true,
        },
      ],
    });

    it('refuse la création sans authentification (401)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgAId}/job-offers`)
        .send(validOfferPayload())
        .expect(401);
    });

    it('refuse la création à un utilisateur CANDIDATE (403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgAId}/job-offers`)
        .set('Authorization', `Bearer ${users.candidate.token}`)
        .send(validOfferPayload())
        .expect(403);
    });

    it('refuse la création à un membre VIEWER de l organisation (403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgAId}/job-offers`)
        .set('Authorization', `Bearer ${users.viewerA.token}`)
        .send(validOfferPayload())
        .expect(403);
    });

    it('refuse une région marocaine invalide (400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgAId}/job-offers`)
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .send({
          ...validOfferPayload(),
          regionCode: 'MA-99',
        })
        .expect(400);
    });

    it('autorise un RECRUITER à créer une offre en statut DRAFT avec compétences et langues (201)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgAId}/job-offers`)
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .send(validOfferPayload())
        .expect(201);

      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.organizationId).toBe(orgAId);
      expect(res.body.data.requiredSkills).toHaveLength(2);
      expect(res.body.data.requiredLanguages).toHaveLength(2);

      offerPublishedId = res.body.data.id;
    });

    it('autorise un OWNER à créer une seconde offre en statut DRAFT (201)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgAId}/job-offers`)
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          ...validOfferPayload(),
          title: 'Psychologue Éducatif Junior CDI',
          offerType: OfferType.EMPLOI,
          contractSubType: 'CDI',
          targetSpecialtyId: secondSpecialtyId,
          regionCode: 'MA-06',
          cityName: 'Casablanca',
          minExperienceMonths: 12,
          isExperienceMandatory: true,
        })
        .expect(201);

      offerDraftId = res.body.data.id;
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('retourne la liste des organisations de l utilisateur via GET /api/v1/job-offers/my-organizations', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/job-offers/my-organizations')
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].role).toBe(OrgMemberRole.RECRUITER);
      expect(res.body.data[0].organization.id).toBe(orgAId);
    });
  });

  describe('2. Protection des organisations non vérifiées & Publication', () => {
    it('interdit à une organisation PENDING de publier une offre (403 Forbidden)', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgAId}/job-offers/${offerPublishedId}/publish`,
        )
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .expect(403);

      expect(res.body.message).toContain('verified');
    });

    it('interdit à une organisation REJECTED de publier une offre (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/organizations/${orgAId}/verification`)
        .set('Authorization', `Bearer ${users.sysAdmin.token}`)
        .send({
          status: VerificationStatus.REJECTED,
          reason: 'Numéro ICE incomplet',
        })
        .expect(200);

      await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgAId}/job-offers/${offerPublishedId}/publish`,
        )
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .expect(403);
    });

    it('autorise la publication dès que l organisation est VERIFIED et trace OFFER_PUBLISH dans AUDIT_LOGS', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/organizations/${orgAId}/verification`)
        .set('Authorization', `Bearer ${users.sysAdmin.token}`)
        .send({
          status: VerificationStatus.VERIFIED,
          reason: 'Vérification administrative conforme',
        })
        .expect(200);

      // Un VIEWER ne peut toujours pas publier (403)
      await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgAId}/job-offers/${offerPublishedId}/publish`,
        )
        .set('Authorization', `Bearer ${users.viewerA.token}`)
        .expect(403);

      // Le RECRUITER publie l'offre avec succès
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgAId}/job-offers/${offerPublishedId}/publish`,
        )
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .expect(200);

      expect(res.body.data.status).toBe('PUBLISHED');
      expect(res.body.data.publishedAt).toBeDefined();

      // Vérifier l'entrée AUDIT_LOGS OFFER_PUBLISH
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'OFFER_PUBLISH',
          entityType: 'JOB_OFFER',
          entityId: offerPublishedId,
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.userId).toBe(users.recruiterA.userId);
    });
  });

  describe('3. Isolation inter-organisations et consultation interne', () => {
    it('autorise un VIEWER de OrgA à lister et consulter les offres de OrgA (y compris DRAFT)', async () => {
      const listRes = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/job-offers`)
        .set('Authorization', `Bearer ${users.viewerA.token}`)
        .expect(200);

      expect(listRes.body.data.length).toBeGreaterThanOrEqual(2);

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/job-offers/${offerDraftId}`)
        .set('Authorization', `Bearer ${users.viewerA.token}`)
        .expect(200);

      expect(detailRes.body.data.id).toBe(offerDraftId);
      expect(detailRes.body.data.status).toBe('DRAFT');
    });

    it('interdit au OWNER de OrgB d accéder aux offres de OrgA (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/job-offers`)
        .set('Authorization', `Bearer ${users.ownerB.token}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgAId}/job-offers/${offerDraftId}`)
        .set('Authorization', `Bearer ${users.ownerB.token}`)
        .expect(403);

      await request(app.getHttpServer())
        .put(`/api/v1/organizations/${orgAId}/job-offers/${offerDraftId}`)
        .set('Authorization', `Bearer ${users.ownerB.token}`)
        .send({ title: 'Tentative piratage inter-org' })
        .expect(403);
    });

    it('empêche de manipuler une offre de OrgA via la route de OrgB (404 Not Found)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgBId}/job-offers/${offerPublishedId}`)
        .set('Authorization', `Bearer ${users.ownerB.token}`)
        .expect(404);
    });
  });

  describe('4. Recherche et consultation publique (/api/v1/job-offers)', () => {
    it('retourne uniquement les offres PUBLISHED d organisations VERIFIED avec pagination et filtres', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/job-offers')
        .query({
          offerType: OfferType.STAGE_PFE,
          regionCode: 'MA-04',
          specialtyId,
          search: 'Neuropsychologie',
        })
        .expect(200);

      expect(res.body.meta).toBeDefined();
      const ids = res.body.data.map((o: { id: string }) => o.id);
      expect(ids).toContain(offerPublishedId);
      expect(ids).not.toContain(offerDraftId);
    });

    it('permet de consulter publiquement le détail d une offre PUBLISHED (200)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerPublishedId}`)
        .expect(200);

      expect(res.body.data.id).toBe(offerPublishedId);
      expect(res.body.data.organization.tradeName).toBe('Centre Al-Inara');
      expect(res.body.data.requiredSkills).toHaveLength(2);
      expect(res.body.data.requiredLanguages).toHaveLength(2);
    });

    it('masque publiquement une offre au statut DRAFT (404 Not Found)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerDraftId}`)
        .expect(404);
    });
  });

  describe('5. Modification, Fermeture et Archivage des offres', () => {
    it('permet à un ADMIN ou RECRUITER de modifier une offre et ses compétences', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/organizations/${orgAId}/job-offers/${offerPublishedId}`)
        .set('Authorization', `Bearer ${users.adminA.token}`)
        .send({
          title: 'Stage PFE Neuropsychologie Infantile (Mis à jour)',
          remunerationStipend: '2500 MAD / mois',
          requiredSkills: [
            {
              skillId: skillId1,
              isMandatory: true,
              minRequiredLevel: SkillLevel.AUTONOME,
              weight: 3,
            },
          ],
        })
        .expect(200);

      expect(res.body.data.title).toBe(
        'Stage PFE Neuropsychologie Infantile (Mis à jour)',
      );
      expect(res.body.data.remunerationStipend).toBe('2500 MAD / mois');
      expect(res.body.data.requiredSkills).toHaveLength(1);
      expect(res.body.data.requiredSkills[0].minRequiredLevel).toBe(
        SkillLevel.AUTONOME,
      );
    });

    it('permet à un RECRUITER de clôturer une offre publiée (PUBLISHED -> CLOSED)', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgAId}/job-offers/${offerPublishedId}/close`,
        )
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .expect(200);

      expect(res.body.data.status).toBe('CLOSED');
      expect(res.body.data.closedAt).toBeDefined();

      // Une offre clôturée n'est plus accessible sur le détail public
      await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerPublishedId}`)
        .expect(404);
    });

    it('interdit à un RECRUITER d archiver/supprimer une offre (403 selon matrice DCTF §4.2)', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgAId}/job-offers/${offerPublishedId}/archive`,
        )
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .expect(403);
    });

    it('autorise un ADMIN ou OWNER à archiver une offre et bloque toute modification ultérieure', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/organizations/${orgAId}/job-offers/${offerPublishedId}/archive`,
        )
        .set('Authorization', `Bearer ${users.adminA.token}`)
        .expect(200);

      expect(res.body.data.status).toBe('ARCHIVED');

      // Impossible de modifier une offre archivée
      await request(app.getHttpServer())
        .put(`/api/v1/organizations/${orgAId}/job-offers/${offerPublishedId}`)
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({ title: 'Modification interdite après archivage' })
        .expect(400);
    });
  });
});
