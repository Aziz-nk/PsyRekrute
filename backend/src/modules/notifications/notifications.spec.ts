import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DegreeLevel,
  OfferType,
  OrganizationType,
  OrgMemberRole,
  PrismaClient,
  ProfileCategory,
  AvailabilityStatus,
  VerificationStatus,
} from '@prisma/client';
import * as request from 'supertest';
import { PrismaModule } from '../../database/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthRegistrationService } from '../auth/auth-registration.service';
import { AuthSessionService } from '../auth/auth-session.service';
import { CandidatesModule } from '../candidates/candidates.module';
import { ConsentModule } from '../consent/consent.module';
import { MatchingModule } from '../matching/matching.module';
import { OffersModule } from '../offers/offers.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { StorageModule } from '../storage/storage.module';
import { ApplicationsModule } from '../applications/applications.module';
import { NotificationsModule } from './notifications.module';

describe('Sprint 5 – NotificationsModule & Intégration FSM Recrutement', () => {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://psyrekrute_dev_user@127.0.0.1:5432/psyrekrute_db?schema=public';

  let app: INestApplication;
  let prisma: PrismaClient;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];
  const createdSpecialtyIds: string[] = [];

  const users: Record<
    string,
    { userId: string; token: string; email: string }
  > = {};

  let orgId = '';
  let specId = '';
  let offerId = '';
  let candidateProfileId = '';

  const registerUser = async (
    key: string,
    globalRole: 'CANDIDATE' | 'ORGANIZATION_USER',
    registration: AuthRegistrationService,
    sessions: AuthSessionService,
  ) => {
    const email = `notif.${key}.${Date.now()}@psyrekrute.ma`;
    const regRes = await registration.register(
      {
        email,
        password: 'Password123!Secure',
        globalRole,
        termsAccepted: true,
      },
      { ipAddress: '127.0.0.1', userAgent: 'Jest/Notifications' },
    );
    createdUserIds.push(regRes.userId);

    const token = await sessions.signAccessToken({
      sub: regRes.userId,
      email: regRes.email,
      globalRole: regRes.globalRole,
      preferredLocale: 'fr',
    });

    users[key] = {
      userId: regRes.userId,
      token,
      email,
    };
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
        PrismaModule,
        AuditModule,
        AuthModule,
        ConsentModule,
        StorageModule,
        MatchingModule,
        OrganizationsModule,
        CandidatesModule,
        OffersModule,
        ApplicationsModule,
        NotificationsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    const registration = app.get(AuthRegistrationService);
    const sessions = app.get(AuthSessionService);

    await registerUser('recruiter', 'ORGANIZATION_USER', registration, sessions);
    await registerUser('candidate', 'CANDIDATE', registration, sessions);
    await registerUser('otherUser', 'CANDIDATE', registration, sessions);

    // Créer une organisation et valider
    const org = await prisma.organization.create({
      data: {
        legalName: 'CMPP Notification Test',
        tradeName: 'CMPP Notif',
        organizationType: OrganizationType.CMPP,
        phone: '+212522000000',
        email: users.recruiter.email,
        regionCode: 'MA-04',
        cityName: 'Rabat',
        addressLine: 'Avenue de France',
        verificationStatus: VerificationStatus.VERIFIED,
        isActive: true,
      },
    });
    orgId = org.id;
    createdOrgIds.push(orgId);

    const member = await prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        userId: users.recruiter.userId,
        role: OrgMemberRole.OWNER,
      },
    });

    // Spécialité
    const spec = await prisma.refSpecialty.create({
      data: {
        code: `SPEC-NOTIF-${Date.now()}`,
        titleFr: 'Psychologie Clinique',
        titleAr: 'علم النفس الإكلينيكي',
        titleEn: 'Clinical Psychology',
      },
    });
    specId = spec.id;
    createdSpecialtyIds.push(specId);

    // Profil candidat avec consentement vivier
    const cand = await prisma.candidateProfile.create({
      data: {
        userId: users.candidate.userId,
        firstName: 'Imane',
        lastName: 'El Mansouri',
        profileCategory: ProfileCategory.STUDENT,
        primarySpecialtyId: specId,
        regionCode: 'MA-04',
        cityName: 'Rabat',
        availabilityStatus: AvailabilityStatus.IMMEDIATE,
        targetContractTypes: ['STAGE_PFE'],
      },
    });
    candidateProfileId = cand.id;

    await prisma.consent.create({
      data: {
        userId: users.candidate.userId,
        consentType: 'TALENT_POOL_MATCHING',
        version: 'v3.1.2',
        hasConsented: true,
        ipAddress: '127.0.0.1',
        userAgent: 'jest-test',
      },
    });

    // Offre publiée
    const offer = await prisma.jobOffer.create({
      data: {
        organizationId: orgId,
        authorMemberId: member.id,
        title: 'Stage PFE Psychologie Scolaire',
        offerType: OfferType.STAGE_PFE,
        contractSubType: 'CONVENTION_STAGE',
        requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
        targetSpecialtyId: specId,
        regionCode: 'MA-04',
        cityName: 'Rabat',
        startDate: new Date('2026-04-01'),
        description: 'Missions d observation et d intervention supervisée.',
        status: 'PUBLISHED',
      },
    });
    offerId = offer.id;
  }, 30000);

  afterAll(async () => {
    if (prisma) {
      if (offerId) {
        await prisma.notification.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.applicationHistory.deleteMany({
          where: { application: { jobOfferId: offerId } },
        });
        await prisma.application.deleteMany({
          where: { jobOfferId: offerId },
        });
        await prisma.jobOffer.deleteMany({ where: { id: offerId } });
      }
      if (candidateProfileId) {
        await prisma.candidateProfile.deleteMany({
          where: { id: candidateProfileId },
        });
      }
      if (createdSpecialtyIds.length > 0) {
        await prisma.refSpecialty.deleteMany({
          where: { id: { in: createdSpecialtyIds } },
        });
      }
      if (createdOrgIds.length > 0) {
        await prisma.organizationMember.deleteMany({
          where: { organizationId: { in: createdOrgIds } },
        });
        await prisma.organization.deleteMany({
          where: { id: { in: createdOrgIds } },
        });
      }
      if (createdUserIds.length > 0) {
        await prisma.consent.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.userSession.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.auditLog.deleteMany({
          where: { userId: { in: createdUserIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: createdUserIds } },
        });
      }
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('1. CRUD Notifications In-App & Isolation RBAC', () => {
    let createdNotifId = '';

    it('génère et consulte les notifications in-app avec unreadCount', async () => {
      // Créer une notification directement
      const notif = await prisma.notification.create({
        data: {
          userId: users.candidate.userId,
          type: 'TEST_ALERT',
          title: 'Alerte test',
          message: 'Message test de notification in-app',
          linkUrl: '/candidate/applications',
          isRead: false,
        },
      });
      createdNotifId = notif.id;

      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${users.candidate.token}`)
        .expect(200);

      expect(res.body.statusCode).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((n: { id: string }) => n.id === createdNotifId)).toBe(true);
      expect(res.body.unreadCount).toBeGreaterThanOrEqual(1);
    });

    it('interdit à un utilisateur tiers de marquer comme lue une notification qui ne lui appartient pas (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${createdNotifId}/read`)
        .set('Authorization', `Bearer ${users.otherUser.token}`)
        .expect(403);
    });

    it('marque une notification comme lue (isRead = true)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${createdNotifId}/read`)
        .set('Authorization', `Bearer ${users.candidate.token}`)
        .expect(200);

      expect(res.body.data.isRead).toBe(true);

      const check = await prisma.notification.findUnique({
        where: { id: createdNotifId },
      });
      expect(check?.isRead).toBe(true);
    });

    it('marque toutes les notifications de l utilisateur comme lues (POST /read-all)', async () => {
      // Créer 2 notifications non lues
      await prisma.notification.createMany({
        data: [
          {
            userId: users.candidate.userId,
            type: 'TEST_1',
            title: 'Notif 1',
            message: 'Msg 1',
            isRead: false,
          },
          {
            userId: users.candidate.userId,
            type: 'TEST_2',
            title: 'Notif 2',
            message: 'Msg 2',
            isRead: false,
          },
        ],
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${users.candidate.token}`)
        .expect(200);

      expect(res.body.data.count).toBeGreaterThanOrEqual(2);

      const unread = await prisma.notification.count({
        where: { userId: users.candidate.userId, isRead: false },
      });
      expect(unread).toBe(0);
    });
  });

  describe('2. Intégration FSM ApplicationsService -> Notifications In-App', () => {
    let appId = '';

    it('déclenche une notification NEW_INVITATION pour le candidat lors d une invitation du vivier', async () => {
      const inviteRes = await request(app.getHttpServer())
        .post('/api/v1/applications/invite')
        .set('Authorization', `Bearer ${users.recruiter.token}`)
        .send({
          jobOfferId: offerId,
          candidateId: candidateProfileId,
          personalizedMessage: 'Bonjour Imane, votre profil nous intéresse.',
        })
        .expect(201);

      appId = inviteRes.body.data.applicationId;

      const notifs = await prisma.notification.findMany({
        where: {
          userId: users.candidate.userId,
          type: 'NEW_INVITATION',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(notifs.length).toBeGreaterThanOrEqual(1);
      expect(notifs[0].title).toContain('invitation');
      expect(notifs[0].isRead).toBe(false);
    });

    it('déclenche une notification STATUS_CHANGED pour le recruteur lors de l acceptation par le candidat', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/candidates/me/applications/${appId}/status`)
        .set('Authorization', `Bearer ${users.candidate.token}`)
        .send({
          targetStatus: 'SUBMITTED',
          comment: 'J accepte avec grand plaisir !',
        })
        .expect(200);

      const notifs = await prisma.notification.findMany({
        where: {
          userId: users.recruiter.userId,
          type: 'STATUS_CHANGED',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(notifs.length).toBeGreaterThanOrEqual(1);
      expect(notifs[0].title).toContain('Invitation acceptée');
    });

    it('déclenche une notification INTERVIEW_PROPOSED pour le candidat lors de la proposition d entretien', async () => {
      // Passer en REVIEWING d abord
      await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${orgId}/applications/${appId}/status`)
        .set('Authorization', `Bearer ${users.recruiter.token}`)
        .send({ targetStatus: 'REVIEWING' })
        .expect(200);

      // Proposer entretien
      const interviewDate = new Date(Date.now() + 5 * 86_400_000).toISOString();
      await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${orgId}/applications/${appId}/status`)
        .set('Authorization', `Bearer ${users.recruiter.token}`)
        .send({
          targetStatus: 'INTERVIEW_PROPOSED',
          interviewDate,
          interviewMode: 'IN_PERSON',
          interviewLocationOrLink: 'CMPP Rabat Centre',
        })
        .expect(200);

      const notifs = await prisma.notification.findMany({
        where: {
          userId: users.candidate.userId,
          type: 'INTERVIEW_PROPOSED',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(notifs.length).toBeGreaterThanOrEqual(1);
      expect(notifs[0].title).toContain('entretien');
    });

    it('déclenche une notification INTERVIEW_CONFIRMED pour le recruteur lors de la confirmation par le candidat', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/candidates/me/applications/${appId}/status`)
        .set('Authorization', `Bearer ${users.candidate.token}`)
        .send({
          targetStatus: 'INTERVIEW_CONFIRMED',
          comment: 'Créneau confirmé pour moi.',
        })
        .expect(200);

      const notifs = await prisma.notification.findMany({
        where: {
          userId: users.recruiter.userId,
          type: 'INTERVIEW_CONFIRMED',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(notifs.length).toBeGreaterThanOrEqual(1);
      expect(notifs[0].title).toContain('Entretien confirmé');
    });
  });
});
