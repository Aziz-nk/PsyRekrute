import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AvailabilityStatus,
  DegreeLevel,
  ExperienceType,
  GlobalRole,
  PrismaClient,
  ProfileCategory,
  SkillLevel,
  LanguageProficiency,
} from '@prisma/client';
import * as request from 'supertest';
import { PrismaModule } from '../../database/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthRegistrationService } from '../auth/auth-registration.service';
import { AuthSessionService } from '../auth/auth-session.service';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';
import { CandidatesModule } from './candidates.module';
import { ReferenceModule } from '../reference/reference.module';

describe('M3.1 – Référentiels et Profil Candidat minimal', () => {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://psyrekrute_dev_user@127.0.0.1:5432/psyrekrute_db?schema=public';

  let app: INestApplication;
  let prisma: PrismaClient;
  let storageService: StorageService;
  const createdUserIds: string[] = [];

  const users: Record<string, { userId: string; token: string }> = {};

  const registerUser = async (
    key: string,
    globalRole: 'CANDIDATE' | 'ORGANIZATION_USER',
    registration: AuthRegistrationService,
    session: AuthSessionService,
  ) => {
    const reg = await registration.register(
      {
        email: `m31-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@psyrekrute.ma`,
        password: 'phrase de passe m31 test candidate',
        globalRole,
        termsAccepted: true,
      },
      { ipAddress: '196.200.90.1', userAgent: 'Jest/M31' },
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

  let specialtyId = '';
  let skillId = '';

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();

    // Ensure we have at least one specialty and one skill
    let spec = await prisma.refSpecialty.findFirst({ where: { isActive: true } });
    if (!spec) {
      spec = await prisma.refSpecialty.create({
        data: {
          code: 'TEST_SPEC_' + Date.now(),
          titleFr: 'Spécialité Test',
          titleAr: 'تخصص تجريبي',
          titleEn: 'Test Specialty',
          isActive: true,
        },
      });
    }
    specialtyId = spec.id;

    let sk = await prisma.refSkill.findFirst();
    if (!sk) {
      sk = await prisma.refSkill.create({
        data: {
          code: 'TEST_SKILL_' + Date.now(),
          category: 'CLINIQUE',
          titleFr: 'Compétence Test',
          titleAr: 'مهارة تجريبية',
          titleEn: 'Test Skill',
        },
      });
    }
    skillId = sk.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuditModule,
        StorageModule,
        AuthModule,
        ReferenceModule,
        CandidatesModule,
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

    storageService = moduleFixture.get(StorageService);

    const registration = moduleFixture.get(AuthRegistrationService);
    const session = moduleFixture.get(AuthSessionService);

    await registerUser('candA', 'CANDIDATE', registration, session);
    await registerUser('candB', 'CANDIDATE', registration, session);
    await registerUser('orgUser', 'ORGANIZATION_USER', registration, session);
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await prisma.$disconnect();
    await app.close();
  });

  describe('1. Référentiels publics (/api/v1/reference)', () => {
    it('GET /api/v1/reference/regions retourne les 12 régions marocaines', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reference/regions')
        .expect(200);

      expect(res.body.data).toHaveLength(12);
      expect(res.body.data[0]).toHaveProperty('code');
      expect(res.body.data[0]).toHaveProperty('nameFr');
      expect(res.body.data[0]).toHaveProperty('nameAr');
      expect(res.body.data[0]).toHaveProperty('nameEn');
    });

    it('GET /api/v1/reference/specialties retourne les spécialités actives', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reference/specialties')
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('GET /api/v1/reference/skills retourne le référentiel des compétences', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reference/skills')
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('2. Profil Candidat (/api/v1/candidates/me)', () => {
    it('refuse l accès sans token (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/candidates/me')
        .expect(401);
    });

    it('refuse l accès aux utilisateurs ORGANIZATION_USER (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/candidates/me')
        .set('Authorization', `Bearer ${users.orgUser.token}`)
        .expect(403);
    });

    it('retourne null si le profil n a pas encore été initialisé', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/candidates/me')
        .set('Authorization', `Bearer ${users.candA.token}`)
        .expect(200);

      expect(res.body.data).toBeNull();
    });

    it('refuse une région invalide lors de la création de profil (400)', async () => {
      await request(app.getHttpServer())
        .put('/api/v1/candidates/me')
        .set('Authorization', `Bearer ${users.candA.token}`)
        .send({
          firstName: 'Kenza',
          lastName: 'El Fassi',
          profileCategory: ProfileCategory.STUDENT,
          primarySpecialtyId: specialtyId,
          regionCode: 'MA-99-INVALIDE',
          cityName: 'Casablanca',
          availabilityStatus: AvailabilityStatus.IMMEDIATE,
        })
        .expect(400);
    });

    it('crée avec succès le profil candidat (PUT /api/v1/candidates/me)', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/candidates/me')
        .set('Authorization', `Bearer ${users.candA.token}`)
        .send({
          firstName: 'Kenza',
          lastName: 'El Fassi',
          phone: '+212661000001',
          profileCategory: ProfileCategory.STUDENT,
          primarySpecialtyId: specialtyId,
          regionCode: 'MA-06',
          cityName: 'Casablanca',
          mobilityRadiusKm: 30,
          openToRelocation: false,
          availabilityStatus: AvailabilityStatus.IMMEDIATE,
          targetContractTypes: ['STAGE_OBSERVATION', 'STAGE_PFE'],
          bio: 'Étudiante en psychologie cognitive.',
          isAnonymizedInPool: true,
        })
        .expect(200);

      expect(res.body.data.firstName).toBe('Kenza');
      expect(res.body.data.profileCompletionPercentage).toBe(40);
    });

    it('consulte son propre profil complet (GET /api/v1/candidates/me)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/candidates/me')
        .set('Authorization', `Bearer ${users.candA.token}`)
        .expect(200);

      expect(res.body.data).not.toBeNull();
      expect(res.body.data.cityName).toBe('Casablanca');
      expect(res.body.data.primarySpecialty.id).toBe(specialtyId);
    });
  });

  describe('3. Formations et Expériences', () => {
    let educationId = '';
    let experienceId = '';

    it('ajoute une formation (POST /api/v1/candidates/me/education)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/candidates/me/education')
        .set('Authorization', `Bearer ${users.candA.token}`)
        .send({
          degreeLevel: DegreeLevel.BAC_3,
          degreeTitle: 'Licence Psychologie',
          institutionName: 'Université Hassan II',
          specialtyId: specialtyId,
          startYear: 2022,
          endYear: 2025,
          isCurrentlyEnrolled: true,
        })
        .expect(201);

      educationId = res.body.data.id;
      expect(res.body.data.degreeTitle).toBe('Licence Psychologie');
    });

    it('ajoute une expérience (POST /api/v1/candidates/me/experiences)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/candidates/me/experiences')
        .set('Authorization', `Bearer ${users.candA.token}`)
        .send({
          experienceType: ExperienceType.STAGE_OBSERVATION,
          organizationName: 'Centre Psycho Al Amal',
          positionTitle: 'Stagiaire Psychologue',
          targetAudience: 'Enfants TSA',
          startDate: '2025-01-10',
          totalMonths: 3,
          isCurrent: false,
        })
        .expect(201);

      experienceId = res.body.data.id;
      expect(res.body.data.positionTitle).toBe('Stagiaire Psychologue');
    });

    it('interdit à candB de supprimer une formation de candA (404)', async () => {
      // Create profile for candB first
      await request(app.getHttpServer())
        .put('/api/v1/candidates/me')
        .set('Authorization', `Bearer ${users.candB.token}`)
        .send({
          firstName: 'Omar',
          lastName: 'Benali',
          profileCategory: ProfileCategory.RECENT_GRADUATE,
          primarySpecialtyId: specialtyId,
          regionCode: 'MA-04',
          cityName: 'Rabat',
          availabilityStatus: AvailabilityStatus.IMMEDIATE,
        })
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/api/v1/candidates/me/education/${educationId}`)
        .set('Authorization', `Bearer ${users.candB.token}`)
        .expect(404);
    });

    it('supprime une formation (DELETE /api/v1/candidates/me/education/:id)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/candidates/me/education/${educationId}`)
        .set('Authorization', `Bearer ${users.candA.token}`)
        .expect(200);
    });

    it('supprime une expérience (DELETE /api/v1/candidates/me/experiences/:id)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/candidates/me/experiences/${experienceId}`)
        .set('Authorization', `Bearer ${users.candA.token}`)
        .expect(200);
    });
  });

  describe('4. Compétences et Langues', () => {
    it('déclare ses compétences (PUT /api/v1/candidates/me/skills)', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/candidates/me/skills')
        .set('Authorization', `Bearer ${users.candA.token}`)
        .send({
          skills: [{ skillId, level: SkillLevel.AUTONOME }],
        })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].level).toBe(SkillLevel.AUTONOME);
    });

    it('déclare ses langues (PUT /api/v1/candidates/me/languages)', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/candidates/me/languages')
        .set('Authorization', `Bearer ${users.candA.token}`)
        .send({
          languages: [
            { languageCode: 'FR', proficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL },
            { languageCode: 'AR', proficiencyLevel: LanguageProficiency.LANGUE_MATERNELLE },
          ],
        })
        .expect(200);

      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('5. Gestion du CV (Upload & Download)', () => {
    let storageKey = '';

    it('génère une URL d upload pré-signée pour le CV', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/candidates/me/cv/upload-url')
        .set('Authorization', `Bearer ${users.candA.token}`)
        .expect(200);

      expect(res.body.data).toHaveProperty('uploadUrl');
      expect(res.body.data).toHaveProperty('storageKey');
      storageKey = res.body.data.storageKey;
    });

    it('confirme l attachement du CV après dépôt sur le stockage', async () => {
      // Simulate file written in storage
      const dummyPdf = Buffer.from('%PDF-1.4\nTest CV Document Content');
      await storageService.savePdf(storageKey, dummyPdf);

      const res = await request(app.getHttpServer())
        .post('/api/v1/candidates/me/cv/confirm')
        .set('Authorization', `Bearer ${users.candA.token}`)
        .send({ storageKey })
        .expect(200);

      expect(res.body.data.cvStoragePath).toBe(storageKey);
    });

    it('génère une URL de téléchargement pré-signée pour son propre CV', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/candidates/me/cv/download-url')
        .set('Authorization', `Bearer ${users.candA.token}`)
        .expect(200);

      expect(res.body.data).toHaveProperty('downloadUrl');
    });
  });
});
