import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AvailabilityStatus,
  DegreeLevel,
  ExperienceType,
  GlobalRole,
  LanguageProficiency,
  OfferType,
  OrganizationType,
  OrgMemberRole,
  PrismaClient,
  ProfileCategory,
  SkillLevel,
  VerificationStatus,
} from '@prisma/client';
import * as request from 'supertest';
import { PrismaModule } from '../../database/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthRegistrationService } from '../auth/auth-registration.service';
import { AuthSessionService } from '../auth/auth-session.service';
import { ConsentModule } from '../consent/consent.module';
import { OffersModule } from '../offers/offers.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MatchingModule } from './matching.module';

describe('M3.3 – Exposition du Moteur de Matching, Vivier Anonymisé, Consentement et RBAC', () => {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://psyrekrute_dev_user@127.0.0.1:5432/psyrekrute_db?schema=public';

  let app: INestApplication;
  let prisma: PrismaClient;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];
  const createdSpecialtyIds: string[] = [];
  const createdSkillIds: string[] = [];

  const users: Record<string, { userId: string; token: string }> = {};

  let orgVerifiedId = '';
  let orgPendingId = '';
  let orgOtherId = '';

  let specEduId = '';
  let specNeuroId = '';
  let specPsychoEduParentId = '';
  let specPsychoEduId = '';
  let specEducSpecSisterId = '';

  let skillTsaNotionsId = '';
  let skillWiscVId = '';
  let skillPecsId = '';
  let skillTeacchId = '';
  let skillPpiId = '';
  let skillAbaId = '';

  let offerObsId = '';
  let offerPfeId = '';
  let offerEmploiId = '';
  let offerPendingOrgId = '';

  let candKenzaProfileId = '';
  let candYoussefProfileId = '';
  let candSalmaProfileId = '';
  let candNoConsentProfileId = '';

  const registerUser = async (
    key: string,
    globalRole: 'CANDIDATE' | 'ORGANIZATION_USER',
    registration: AuthRegistrationService,
    session: AuthSessionService,
  ) => {
    const reg = await registration.register(
      {
        email: `m33-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@psyrekrute.ma`,
        password: 'phrase de passe m33 test matching',
        globalRole,
        termsAccepted: true,
      },
      { ipAddress: '196.200.80.33', userAgent: 'Jest/M3.3' },
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
        ConsentModule,
        OrganizationsModule,
        OffersModule,
        MatchingModule,
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
    await registerUser('ownerPending', 'ORGANIZATION_USER', registration, session);
    await registerUser('ownerOther', 'ORGANIZATION_USER', registration, session);

    await registerUser('candKenza', 'CANDIDATE', registration, session);
    await registerUser('candYoussef', 'CANDIDATE', registration, session);
    await registerUser('candSalma', 'CANDIDATE', registration, session);
    await registerUser('candNoConsent', 'CANDIDATE', registration, session);

    const sysAdmin = await prisma.user.create({
      data: {
        email: `m33-sysadmin-${Date.now()}@psyrekrute.ma`,
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

    // Garantir la présence des pondérations officielles MATCHING_CONFIG (DCTF §5.1)
    const configs = [
      {
        offerType: OfferType.STAGE_OBSERVATION,
        weightFormation: 0.35,
        weightSkills: 0.15,
        weightExperience: 0.05,
        weightLocation: 0.25,
        weightLanguages: 0.1,
        weightAvailability: 0.1,
        algoVersion: 'v3.1-deterministic',
      },
      {
        offerType: OfferType.STAGE_PFE,
        weightFormation: 0.3,
        weightSkills: 0.25,
        weightExperience: 0.15,
        weightLocation: 0.15,
        weightLanguages: 0.1,
        weightAvailability: 0.05,
        algoVersion: 'v3.1-deterministic',
      },
      {
        offerType: OfferType.EMPLOI,
        weightFormation: 0.2,
        weightSkills: 0.3,
        weightExperience: 0.25,
        weightLocation: 0.1,
        weightLanguages: 0.1,
        weightAvailability: 0.05,
        algoVersion: 'v3.1-deterministic',
      },
    ];
    for (const c of configs) {
      await prisma.matchingConfig.upsert({
        where: { offerType: c.offerType },
        update: c,
        create: c,
      });
    }

    // Créer les spécialités de test (incluant deux spécialités sœurs partageant un même parent pour le Cas 3)
    const suffix = Date.now();
    const spEdu = await prisma.refSpecialty.create({
      data: {
        code: `M33_PSY_EDU_${suffix}`,
        titleFr: 'Psychologie de l Éducation',
        titleAr: 'علم النفس التربوي',
        titleEn: 'Educational Psychology',
        isActive: true,
      },
    });
    specEduId = spEdu.id;
    createdSpecialtyIds.push(spEdu.id);

    const spNeuro = await prisma.refSpecialty.create({
      data: {
        code: `M33_NEURO_${suffix}`,
        titleFr: 'Neuropsychologie Infantile',
        titleAr: 'علم النفس العصبي للطفل',
        titleEn: 'Child Neuropsychology',
        isActive: true,
      },
    });
    specNeuroId = spNeuro.id;
    createdSpecialtyIds.push(spNeuro.id);

    const spParent = await prisma.refSpecialty.create({
      data: {
        code: `M33_PARENT_INTERV_${suffix}`,
        titleFr: 'Intervention Médico-Sociale',
        titleAr: 'التدخل الطبي الاجتماعي',
        titleEn: 'Medico-Social Intervention',
        isActive: true,
      },
    });
    specPsychoEduParentId = spParent.id;

    const spPsychoEdu = await prisma.refSpecialty.create({
      data: {
        code: `M33_PSYCHO_EDU_${suffix}`,
        parentId: specPsychoEduParentId,
        titleFr: 'Psycho-éducation',
        titleAr: 'التربية النفسية',
        titleEn: 'Psycho-education',
        isActive: true,
      },
    });
    specPsychoEduId = spPsychoEdu.id;

    const spEducSpec = await prisma.refSpecialty.create({
      data: {
        code: `M33_EDUC_SPEC_${suffix}`,
        parentId: specPsychoEduParentId,
        titleFr: 'Éducation Spécialisée',
        titleAr: 'التربية الخاصة',
        titleEn: 'Special Education',
        isActive: true,
      },
    });
    specEducSpecSisterId = spEducSpec.id;
    createdSpecialtyIds.push(spPsychoEdu.id, spEducSpec.id, spParent.id);

    // Créer les compétences de référence pour les 3 cas chiffrés du DCTF §6
    const createTestSkill = async (codePrefix: string, titleFr: string) => {
      const sk = await prisma.refSkill.create({
        data: {
          code: `${codePrefix}_${suffix}`,
          category: 'CLINIQUE',
          titleFr,
          titleAr: titleFr,
          titleEn: titleFr,
        },
      });
      createdSkillIds.push(sk.id);
      return sk.id;
    };

    skillTsaNotionsId = await createTestSkill('M33_TSA_NOTIONS', 'Notions TSA');
    skillWiscVId = await createTestSkill('M33_WISC_V', 'WISC-V');
    skillPecsId = await createTestSkill('M33_PECS', 'PECS');
    skillTeacchId = await createTestSkill('M33_TEACCH', 'TEACCH');
    skillPpiId = await createTestSkill('M33_PPI', 'PPI');
    skillAbaId = await createTestSkill('M33_ABA', 'ABA');

    // Créer les organisations
    const resOrgA = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${users.ownerA.token}`)
      .send({
        legalName: 'Centre Psycho-Éducatif Al-Amal M33',
        tradeName: 'Centre Al-Amal M33',
        organizationType: OrganizationType.CMPP,
        identifierIce: `${Math.floor(100000000000000 + Math.random() * 899999999999999)}`,
        phone: '+212522112233',
        email: 'contact@alamal-m33.ma',
        regionCode: 'MA-06',
        cityName: 'Casablanca',
        addressLine: '10 Bd Zerktouni, Casablanca',
      })
      .expect(201);
    orgVerifiedId = resOrgA.body.data.id;
    createdOrgIds.push(orgVerifiedId);

    // Vérifier orgVerifiedId par SYSTEM_ADMIN
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/organizations/${orgVerifiedId}/verification`)
      .set('Authorization', `Bearer ${users.sysAdmin.token}`)
      .send({
        status: VerificationStatus.VERIFIED,
        reason: 'ICE validé M3.3',
      })
      .expect(200);

    // Ajouter adminA, recruiterA, viewerA
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgVerifiedId}/members`)
      .set('Authorization', `Bearer ${users.ownerA.token}`)
      .send({ userId: users.adminA.userId, role: OrgMemberRole.ADMIN })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgVerifiedId}/members`)
      .set('Authorization', `Bearer ${users.ownerA.token}`)
      .send({ userId: users.recruiterA.userId, role: OrgMemberRole.RECRUITER })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgVerifiedId}/members`)
      .set('Authorization', `Bearer ${users.ownerA.token}`)
      .send({ userId: users.viewerA.userId, role: OrgMemberRole.VIEWER })
      .expect(201);

    // Organisation non vérifiée (PENDING)
    const resOrgPending = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${users.ownerPending.token}`)
      .send({
        legalName: 'Structure Non Vérifiée M33',
        tradeName: 'Centre Pending M33',
        organizationType: OrganizationType.ASSOCIATION,
        identifierIce: `${Math.floor(100000000000000 + Math.random() * 899999999999999)}`,
        phone: '+212537112233',
        email: 'pending@m33.ma',
        regionCode: 'MA-04',
        cityName: 'Rabat',
        addressLine: 'Rabat Agdal',
      })
      .expect(201);
    orgPendingId = resOrgPending.body.data.id;
    createdOrgIds.push(orgPendingId);

    // Seconde organisation vérifiée (pour test d'isolation inter-org)
    const resOrgOther = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${users.ownerOther.token}`)
      .send({
        legalName: 'Autre Centre Vérifié M33',
        tradeName: 'Autre Centre M33',
        organizationType: OrganizationType.CABINET_LIBERAL,
        identifierIce: `${Math.floor(100000000000000 + Math.random() * 899999999999999)}`,
        phone: '+212539112233',
        email: 'other@m33.ma',
        regionCode: 'MA-01',
        cityName: 'Tanger',
        addressLine: 'Tanger Centre',
      })
      .expect(201);
    orgOtherId = resOrgOther.body.data.id;
    createdOrgIds.push(orgOtherId);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/organizations/${orgOtherId}/verification`)
      .set('Authorization', `Bearer ${users.sysAdmin.token}`)
      .send({ status: VerificationStatus.VERIFIED, reason: 'OK' })
      .expect(200);

    // Créer les 3 offres correspondant aux 3 Cas chiffrés du DCTF §6 dans orgVerifiedId
    // Offre Cas 1 : Stage d'observation (Casablanca, MA-06)
    const resOffer1 = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgVerifiedId}/job-offers`)
      .set('Authorization', `Bearer ${users.recruiterA.token}`)
      .send({
        title: 'Offre Cas 1 - Stage Observation Psychologie Éducation',
        offerType: OfferType.STAGE_OBSERVATION,
        contractSubType: 'CONVENTION_STAGE',
        requiredDegreeLevel: DegreeLevel.BAC_3,
        targetSpecialtyId: specEduId,
        regionCode: 'MA-06',
        cityName: 'Casablanca',
        minExperienceMonths: 0,
        isExperienceMandatory: false,
        startDate: '2026-04-01',
        durationMonths: 2,
        description:
          'Stage d observation pour étudiant L3 en psychologie de l éducation à Casablanca.',
        requiredSkills: [
          {
            skillId: skillTsaNotionsId,
            isMandatory: false,
            minRequiredLevel: SkillLevel.NOTIONS,
            weight: 1,
          },
        ],
        requiredLanguages: [
          {
            languageCode: 'AR_DARIJA',
            minProficiencyLevel: LanguageProficiency.LANGUE_MATERNELLE,
            isMandatory: true,
          },
          {
            languageCode: 'FR',
            minProficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
            isMandatory: true,
          },
        ],
      })
      .expect(201);
    offerObsId = resOffer1.body.data.id;

    // Offre Cas 2 : Stage PFE (Rabat, MA-04)
    const resOffer2 = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgVerifiedId}/job-offers`)
      .set('Authorization', `Bearer ${users.recruiterA.token}`)
      .send({
        title: 'Offre Cas 2 - Stage PFE Neuropsychologie Infantile',
        offerType: OfferType.STAGE_PFE,
        contractSubType: 'CONVENTION_STAGE',
        requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
        targetSpecialtyId: specNeuroId,
        regionCode: 'MA-04',
        cityName: 'Rabat',
        minExperienceMonths: 2,
        isExperienceMandatory: false,
        startDate: '2026-04-01',
        durationMonths: 6,
        description:
          'Stage PFE en neuropsychologie infantile avec passation supervisée du WISC-V.',
        requiredSkills: [
          {
            skillId: skillWiscVId,
            isMandatory: true,
            minRequiredLevel: SkillLevel.AUTONOME,
            weight: 2,
          },
          {
            skillId: skillPecsId,
            isMandatory: false,
            minRequiredLevel: SkillLevel.PRATIQUANT,
            weight: 1,
          },
        ],
        requiredLanguages: [
          {
            languageCode: 'AR_DARIJA',
            minProficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
            isMandatory: true,
          },
          {
            languageCode: 'FR',
            minProficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
            isMandatory: true,
          },
        ],
      })
      .expect(201);
    offerPfeId = resOffer2.body.data.id;

    // Offre Cas 3 : Emploi salarié (Tanger, MA-01)
    const resOffer3 = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgVerifiedId}/job-offers`)
      .set('Authorization', `Bearer ${users.recruiterA.token}`)
      .send({
        title: 'Offre Cas 3 - Emploi Psycho-Éducateur TSA',
        offerType: OfferType.EMPLOI,
        contractSubType: 'CDI',
        requiredDegreeLevel: DegreeLevel.DIPLOME_ETAT,
        targetSpecialtyId: specPsychoEduId,
        regionCode: 'MA-01',
        cityName: 'Tanger',
        minExperienceMonths: 24,
        isExperienceMandatory: true,
        startDate: '2026-04-01',
        description:
          'Poste CDI de psycho-éducateur expérimenté auprès d enfants TSA à Tanger.',
        requiredSkills: [
          {
            skillId: skillTeacchId,
            isMandatory: true,
            minRequiredLevel: SkillLevel.AUTONOME,
            weight: 2,
          },
          {
            skillId: skillPpiId,
            isMandatory: true,
            minRequiredLevel: SkillLevel.AUTONOME,
            weight: 1,
          },
          {
            skillId: skillAbaId,
            isMandatory: false,
            minRequiredLevel: SkillLevel.PRATIQUANT,
            weight: 1,
          },
        ],
        requiredLanguages: [
          {
            languageCode: 'AR_DARIJA',
            minProficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
            isMandatory: true,
          },
          {
            languageCode: 'FR',
            minProficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
            isMandatory: true,
          },
        ],
      })
      .expect(201);
    offerEmploiId = resOffer3.body.data.id;

    // Offre dans l'organisation PENDING
    const resOfferPending = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${orgPendingId}/job-offers`)
      .set('Authorization', `Bearer ${users.ownerPending.token}`)
      .send({
        title: 'Offre structure non vérifiée',
        offerType: OfferType.STAGE_OBSERVATION,
        contractSubType: 'CONVENTION_STAGE',
        requiredDegreeLevel: DegreeLevel.BAC_3,
        targetSpecialtyId: specEduId,
        regionCode: 'MA-04',
        cityName: 'Rabat',
        startDate: '2026-04-01',
        description: 'Offre brouillon d une structure non encore vérifiée.',
      })
      .expect(201);
    offerPendingOrgId = resOfferPending.body.data.id;

    // Créer les 4 profils candidats en base Prisma :
    // 1. Kenza (Cas 1 : L3 en cours à Casablanca, consentement TALENT_POOL_MATCHING = true)
    const kenza = await prisma.candidateProfile.create({
      data: {
        userId: users.candKenza.userId,
        firstName: 'KenzaSecretFirstName',
        lastName: 'ElFassiSecretLastName',
        phone: '+212661998877',
        cvStoragePath: 'candidates/secret-kenza/cv.pdf',
        profileCategory: ProfileCategory.STUDENT,
        primarySpecialtyId: specEduId,
        regionCode: 'MA-06',
        cityName: 'Casablanca',
        mobilityRadiusKm: 0,
        openToRelocation: false,
        availabilityStatus: AvailabilityStatus.IMMEDIATE,
        isAnonymizedInPool: true,
        education: {
          create: [
            {
              degreeLevel: DegreeLevel.BAC_3,
              degreeTitle: 'Licence Psychologie de l Éducation',
              institutionName: 'Université Hassan II',
              specialtyId: specEduId,
              startYear: 2024,
              isCurrentlyEnrolled: true,
            },
          ],
        },
        skills: {
          create: [
            {
              skillId: skillTsaNotionsId,
              level: SkillLevel.NOTIONS,
              isVerified: false,
            },
          ],
        },
        languages: {
          create: [
            {
              languageCode: 'AR_DARIJA',
              proficiencyLevel: LanguageProficiency.LANGUE_MATERNELLE,
            },
            {
              languageCode: 'FR',
              proficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
            },
          ],
        },
      },
    });
    candKenzaProfileId = kenza.id;

    // 2. Youssef (Cas 2 : Licence obtenue + Master 2 Neuro en cours, Kénitra MA-04, mobilité 45km, WISC-V vérifié)
    const youssef = await prisma.candidateProfile.create({
      data: {
        userId: users.candYoussef.userId,
        firstName: 'YoussefSecretFirstName',
        lastName: 'MansouriSecretLastName',
        phone: '+212662998877',
        cvStoragePath: 'candidates/secret-youssef/cv.pdf',
        profileCategory: ProfileCategory.STUDENT,
        primarySpecialtyId: specNeuroId,
        regionCode: 'MA-04',
        cityName: 'Kénitra',
        mobilityRadiusKm: 45,
        openToRelocation: false,
        availabilityStatus: AvailabilityStatus.IMMEDIATE,
        isAnonymizedInPool: true,
        education: {
          create: [
            {
              degreeLevel: DegreeLevel.BAC_3,
              degreeTitle: 'Licence Psychologie',
              institutionName: 'Université Ibn Tofail',
              specialtyId: specNeuroId,
              startYear: 2021,
              endYear: 2024,
              isCurrentlyEnrolled: false,
            },
            {
              degreeLevel: DegreeLevel.BAC_5_MASTER,
              degreeTitle: 'Master Neuropsychologie Infantile',
              institutionName: 'Université Mohammed V',
              specialtyId: specNeuroId,
              startYear: 2024,
              isCurrentlyEnrolled: true,
            },
          ],
        },
        experiences: {
          create: [
            {
              experienceType: ExperienceType.STAGE_CLINIQUE,
              organizationName: 'Centre Neuro Rabat',
              positionTitle: 'Stagiaire Neuropsychologue',
              startDate: new Date('2025-06-01'),
              endDate: new Date('2025-09-01'),
              totalMonths: 3,
            },
          ],
        },
        skills: {
          create: [
            {
              skillId: skillWiscVId,
              level: SkillLevel.AUTONOME,
              isVerified: true,
            },
          ],
        },
        languages: {
          create: [
            {
              languageCode: 'AR_DARIJA',
              proficiencyLevel: LanguageProficiency.LANGUE_MATERNELLE,
            },
            {
              languageCode: 'FR',
              proficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
            },
          ],
        },
      },
    });
    candYoussefProfileId = youssef.id;

    // 3. Salma (Cas 3 : Diplôme d'État obtenu en Éducation Spécialisée [spécialité sœur], 14 mois TSA, Fès MA-03 openToRelocation, préavis 30j)
    const salma = await prisma.candidateProfile.create({
      data: {
        userId: users.candSalma.userId,
        firstName: 'SalmaSecretFirstName',
        lastName: 'TaziSecretLastName',
        phone: '+212663998877',
        cvStoragePath: 'candidates/secret-salma/cv.pdf',
        profileCategory: ProfileCategory.EXPERIENCED_PROFESSIONAL,
        primarySpecialtyId: specEducSpecSisterId,
        regionCode: 'MA-03',
        cityName: 'Fès',
        mobilityRadiusKm: 0,
        openToRelocation: true,
        availabilityStatus: AvailabilityStatus.DATE,
        availableFrom: new Date('2026-05-01'), // Exactement 30 jours après 2026-04-01
        isAnonymizedInPool: true,
        education: {
          create: [
            {
              degreeLevel: DegreeLevel.DIPLOME_ETAT,
              degreeTitle: 'Diplôme d État Éducatrice Spécialisée',
              institutionName: 'INAS Tanger',
              specialtyId: specEducSpecSisterId,
              startYear: 2020,
              endYear: 2023,
              isCurrentlyEnrolled: false,
            },
          ],
        },
        experiences: {
          create: [
            {
              experienceType: ExperienceType.EMPLOI_SALARIE,
              organizationName: 'Association Autisme Fès',
              positionTitle: 'Éducatrice spécialisée',
              targetAudience: 'ENFANTS_TSA',
              startDate: new Date('2024-01-01'),
              endDate: new Date('2025-03-01'),
              totalMonths: 14,
            },
          ],
        },
        skills: {
          create: [
            {
              skillId: skillTeacchId,
              level: SkillLevel.EXPERT,
              isVerified: true,
            },
            {
              skillId: skillPpiId,
              level: SkillLevel.PRATIQUANT,
              isVerified: false,
            },
            {
              skillId: skillAbaId,
              level: SkillLevel.PRATIQUANT,
              isVerified: false,
            },
          ],
        },
        languages: {
          create: [
            {
              languageCode: 'AR_DARIJA',
              proficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
            },
            {
              languageCode: 'FR',
              proficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
            },
          ],
        },
      },
    });
    candSalmaProfileId = salma.id;

    // 4. Candidat profil parfait mais SANS consentement TALENT_POOL_MATCHING
    const noConsentCand = await prisma.candidateProfile.create({
      data: {
        userId: users.candNoConsent.userId,
        firstName: 'NonConsentiSecret',
        lastName: 'Invisible',
        profileCategory: ProfileCategory.STUDENT,
        primarySpecialtyId: specEduId,
        regionCode: 'MA-06',
        cityName: 'Casablanca',
        availabilityStatus: AvailabilityStatus.IMMEDIATE,
        education: {
          create: [
            {
              degreeLevel: DegreeLevel.BAC_3,
              degreeTitle: 'Licence Psychologie',
              institutionName: 'UH2C',
              specialtyId: specEduId,
              startYear: 2024,
              isCurrentlyEnrolled: true,
            },
          ],
        },
        languages: {
          create: [
            {
              languageCode: 'AR_DARIJA',
              proficiencyLevel: LanguageProficiency.LANGUE_MATERNELLE,
            },
            {
              languageCode: 'FR',
              proficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
            },
          ],
        },
      },
    });
    candNoConsentProfileId = noConsentCand.id;

    // Activer le consentement TALENT_POOL_MATCHING pour Kenza, Youssef et Salma via l'API M4
    for (const key of ['candKenza', 'candYoussef', 'candSalma']) {
      await request(app.getHttpServer())
        .put('/api/v1/me/consents')
        .set('Authorization', `Bearer ${users[key].token}`)
        .send({
          consentType: 'TALENT_POOL_MATCHING',
          hasConsented: true,
          version: '1.0',
        })
        .expect(200);
    }
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
    if (createdSkillIds.length > 0) {
      await prisma.refSkill.deleteMany({
        where: { id: { in: createdSkillIds } },
      });
    }
    if (createdSpecialtyIds.length > 0) {
      await prisma.refSpecialty.deleteMany({
        where: { id: { in: createdSpecialtyIds } },
      });
    }
    await app.close();
    await prisma.$disconnect();
  });

  describe('1. Sécurité RBAC, Isolation inter-organisations et Statut VERIFIED', () => {
    it('refuse l accès sans authentification (401)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerObsId}/recommended-candidates`)
        .expect(401);
    });

    it('refuse l accès à un utilisateur CANDIDATE (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerObsId}/recommended-candidates`)
        .set('Authorization', `Bearer ${users.candKenza.token}`)
        .expect(403);
    });

    it('refuse l accès à un membre VIEWER de l organisation (403 selon §9.4)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerObsId}/recommended-candidates`)
        .set('Authorization', `Bearer ${users.viewerA.token}`)
        .expect(403);
    });

    it('refuse l accès au OWNER d une autre organisation (isolation inter-organisations, 403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerObsId}/recommended-candidates`)
        .set('Authorization', `Bearer ${users.ownerOther.token}`)
        .expect(403);
    });

    it('refuse l accès au vivier pour une organisation non vérifiée PENDING (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerPendingOrgId}/recommended-candidates`)
        .set('Authorization', `Bearer ${users.ownerPending.token}`)
        .expect(403);
    });
  });

  describe('2. Scores de référence DCTF (§6) sur les 3 types d offres et Persistance MATCH_RESULTS', () => {
    it('Cas 1 (STAGE_OBSERVATION) : calcule et persiste exactement 100.00% pour Kenza', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerObsId}/recommended-candidates`)
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .expect(200);

      const kenzaMatch = res.body.data.find(
        (item: { candidateId: string }) =>
          item.candidateId === candKenzaProfileId,
      );
      expect(kenzaMatch).toBeDefined();
      expect(kenzaMatch.totalScore).toBe(100);
      expect(kenzaMatch.subScores).toEqual({
        formation: 100,
        skills: 100,
        experience: 100,
        location: 100,
        languages: 100,
        availability: 100,
      });

      // Vérifier la persistance réelle dans MATCH_RESULTS
      const persisted = await prisma.matchResult.findUnique({
        where: {
          jobOfferId_candidateId: {
            jobOfferId: offerObsId,
            candidateId: candKenzaProfileId,
          },
        },
      });
      expect(persisted).not.toBeNull();
      expect(Number(persisted?.totalScore)).toBe(100);
    });

    it('Cas 2 (STAGE_PFE) : calcule et persiste exactement 93.25% pour Youssef', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerPfeId}/recommended-candidates`)
        .set('Authorization', `Bearer ${users.adminA.token}`)
        .expect(200);

      const youssefMatch = res.body.data.find(
        (item: { candidateId: string }) =>
          item.candidateId === candYoussefProfileId,
      );
      expect(youssefMatch).toBeDefined();
      expect(youssefMatch.totalScore).toBe(93.25);
      expect(youssefMatch.subScores).toEqual({
        formation: 85,
        skills: 100,
        experience: 100,
        location: 85,
        languages: 100,
        availability: 100,
      });
    });

    it('Cas 3 (EMPLOI) : calcule et persiste exactement 82.33% pour Salma via la route d organisation', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/organizations/${orgVerifiedId}/job-offers/${offerEmploiId}/recommended-candidates`,
        )
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .expect(200);

      const salmaMatch = res.body.data.find(
        (item: { candidateId: string }) =>
          item.candidateId === candSalmaProfileId,
      );
      expect(salmaMatch).toBeDefined();
      expect(salmaMatch.totalScore).toBe(82.33);
      expect(salmaMatch.subScores).toEqual({
        formation: 75,
        skills: 100,
        experience: 68.33,
        location: 75,
        languages: 100,
        availability: 55,
      });
    });
  });

  describe('3. Anonymisation stricte, Tri décroissant et Seuil minScore', () => {
    it('n expose jamais de nom, prénom, email, téléphone ou chemin de CV dans les résultats', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerObsId}/recommended-candidates`)
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .expect(200);

      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('KenzaSecretFirstName');
      expect(serialized).not.toContain('ElFassiSecretLastName');
      expect(serialized).not.toContain('+212661998877');
      expect(serialized).not.toContain('secret-kenza');
      expect(serialized).not.toContain('cvStoragePath');

      for (const item of res.body.data) {
        expect(item.displayName).toMatch(/^#CAND-[A-F0-9]{6}$/);
        expect(item.isAnonymized).toBe(true);
        expect(item.firstName).toBeUndefined();
        expect(item.lastName).toBeUndefined();
        expect(item.email).toBeUndefined();
        expect(item.phone).toBeUndefined();
      }
    });

    it('trie les résultats par totalScore décroissant et respecte le filtre minScore', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerObsId}/recommended-candidates`)
        .query({ minScore: 95 })
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .expect(200);

      for (const item of res.body.data) {
        expect(item.totalScore).toBeGreaterThanOrEqual(95);
      }

      const resAll = await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerObsId}/recommended-candidates`)
        .query({ minScore: 0 })
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .expect(200);

      for (let i = 1; i < resAll.body.data.length; i++) {
        expect(resAll.body.data[i - 1].totalScore).toBeGreaterThanOrEqual(
          resAll.body.data[i].totalScore,
        );
      }
    });
  });

  describe('4. Consentement TALENT_POOL_MATCHING : exclusion et retrait immédiat', () => {
    it('exclut systématiquement un candidat n ayant jamais consenti au vivier', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerObsId}/recommended-candidates`)
        .query({ minScore: 0 })
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .expect(200);

      const ids = res.body.data.map(
        (item: { candidateId: string }) => item.candidateId,
      );
      expect(ids).not.toContain(candNoConsentProfileId);
    });

    it('exclut immédiatement un candidat qui retire son consentement et purge son résultat de MATCH_RESULTS', async () => {
      // Kenza retire son consentement TALENT_POOL_MATCHING
      await request(app.getHttpServer())
        .put('/api/v1/me/consents')
        .set('Authorization', `Bearer ${users.candKenza.token}`)
        .send({
          consentType: 'TALENT_POOL_MATCHING',
          hasConsented: false,
          version: '1.0',
        })
        .expect(200);

      const resAfterRevoke = await request(app.getHttpServer())
        .get(`/api/v1/job-offers/${offerObsId}/recommended-candidates`)
        .query({ minScore: 0 })
        .set('Authorization', `Bearer ${users.recruiterA.token}`)
        .expect(200);

      const ids = resAfterRevoke.body.data.map(
        (item: { candidateId: string }) => item.candidateId,
      );
      expect(ids).not.toContain(candKenzaProfileId);

      // Vérifier que la ligne MATCH_RESULTS de Kenza a bien été supprimée
      const persistedAfterRevoke = await prisma.matchResult.findUnique({
        where: {
          jobOfferId_candidateId: {
            jobOfferId: offerObsId,
            candidateId: candKenzaProfileId,
          },
        },
      });
      expect(persistedAfterRevoke).toBeNull();
    });
  });
});
