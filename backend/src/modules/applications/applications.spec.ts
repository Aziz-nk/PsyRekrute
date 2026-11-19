import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ApplicationOrigin,
  ApplicationStatus,
  AvailabilityStatus,
  DegreeLevel,
  InterviewMode,
  LanguageProficiency,
  OfferType,
  OrganizationType,
  OrgMemberRole,
  PrismaClient,
  ProfileCategory,
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
import { ApplicationsModule } from './applications.module';

describe('Sprint 4 – ApplicationsModule : Candidatures, Invitations, Anonymisation, FSM & Audit', () => {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://psyrekrute_dev_user@127.0.0.1:5432/psyrekrute_db?schema=public';

  let app: INestApplication;
  let prisma: PrismaClient;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];
  const createdSpecialtyIds: string[] = [];

  const users: Record<string, { userId: string; token: string; email: string }> =
    {};

  let orgAId = '';
  let specId = '';
  let offerA1Id = '';
  let offerA2Id = '';

  let candDirectProfileId = '';
  let candInviteAcceptProfileId = '';
  let candInviteDeclineProfileId = '';
  let candNoConsentProfileId = '';

  const registerUser = async (
    key: string,
    globalRole: 'CANDIDATE' | 'ORGANIZATION_USER',
    registration: AuthRegistrationService,
    session: AuthSessionService,
  ) => {
    const email = `s4-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@psyrekrute.ma`;
    const reg = await registration.register(
      {
        email,
        password: 'phrase de passe sprint4 candidatures',
        globalRole,
        termsAccepted: true,
      },
      { ipAddress: '196.200.80.44', userAgent: 'Jest/Sprint4' },
    );
    createdUserIds.push(reg.userId);
    const token = await session.signAccessToken({
      sub: reg.userId,
      email: reg.email,
      globalRole: reg.globalRole,
      preferredLocale: 'fr',
    });
    users[key] = { userId: reg.userId, token, email: reg.email };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              DATABASE_URL: dbUrl,
              JWT_ACCESS_SECRET:
                'test_jwt_access_secret_minimum_32_characters_long_sprint4',
              JWT_ACCESS_EXPIRATION: '15m',
            }),
          ],
        }),
        PrismaModule,
        AuditModule,
        AuthModule,
        ConsentModule,
        StorageModule,
        OrganizationsModule,
        CandidatesModule,
        OffersModule,
        MatchingModule,
        ApplicationsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const registration = app.get(AuthRegistrationService);
    const session = app.get(AuthSessionService);

    await registerUser('ownerA', 'ORGANIZATION_USER', registration, session);
    await registerUser('viewerA', 'ORGANIZATION_USER', registration, session);
    await registerUser('ownerB', 'ORGANIZATION_USER', registration, session);
    await registerUser('candDirect', 'CANDIDATE', registration, session);
    await registerUser('candInviteAccept', 'CANDIDATE', registration, session);
    await registerUser('candInviteDecline', 'CANDIDATE', registration, session);
    await registerUser('candNoConsent', 'CANDIDATE', registration, session);

    const ts = Date.now();
    const spec = await prisma.refSpecialty.create({
      data: {
        code: `SPEC_S4_${ts}`,
        titleFr: 'Psychologie Clinique S4',
        titleAr: 'علم النفس السريري S4',
        titleEn: 'Clinical Psychology S4',
        isActive: true,
      },
    });
    specId = spec.id;
    createdSpecialtyIds.push(spec.id);

    // Créer Organisation A (VERIFIED) avec ownerA (OWNER) et viewerA (VIEWER)
    const orgA = await prisma.organization.create({
      data: {
        legalName: `Association Al-Amal S4 ${ts}`,
        tradeName: 'Centre Al-Amal S4',
        organizationType: OrganizationType.CMPP,
        identifierIce: String(300000000000000 + (ts % 600000000000000)),
        verificationStatus: VerificationStatus.VERIFIED,
        regionCode: 'MA-04',
        cityName: 'Rabat',
        addressLine: '10 Avenue Mohammed V, Rabat',
        phone: '+212537000011',
        email: 'org-a-s4@psyrekrute.ma',
        isActive: true,
        members: {
          create: [
            { userId: users.ownerA.userId, role: OrgMemberRole.OWNER },
            { userId: users.viewerA.userId, role: OrgMemberRole.VIEWER },
          ],
        },
      },
      include: { members: true },
    });
    orgAId = orgA.id;
    createdOrgIds.push(orgA.id);

    const ownerAMember = orgA.members.find(
      (m) => m.userId === users.ownerA.userId,
    )!;

    // Créer Organisation B (VERIFIED) pour tester l'isolation inter-organisations
    const orgB = await prisma.organization.create({
      data: {
        legalName: `Cabinet Horizon S4 ${ts}`,
        tradeName: 'Cabinet Horizon S4',
        organizationType: OrganizationType.CABINET_LIBERAL,
        identifierIce: String(400000000000000 + (ts % 500000000000000)),
        verificationStatus: VerificationStatus.VERIFIED,
        regionCode: 'MA-06',
        cityName: 'Casablanca',
        addressLine: '20 Bd Zerktouni, Casablanca',
        phone: '+212522000022',
        email: 'org-b-s4@psyrekrute.ma',
        isActive: true,
        members: {
          create: [{ userId: users.ownerB.userId, role: OrgMemberRole.OWNER }],
        },
      },
    });
    createdOrgIds.push(orgB.id);

    // Créer 2 offres publiées dans Organisation A
    const offerA1 = await prisma.jobOffer.create({
      data: {
        organizationId: orgAId,
        authorMemberId: ownerAMember.id,
        title: 'Stage PFE Psychologie Clinique Rabat S4-1',
        offerType: OfferType.STAGE_PFE,
        contractSubType: 'CONVENTION_STAGE',
        requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
        targetSpecialtyId: specId,
        regionCode: 'MA-04',
        cityName: 'Rabat',
        minExperienceMonths: 0,
        isExperienceMandatory: false,
        startDate: new Date('2026-04-01'),
        durationMonths: 6,
        description: 'Stage PFE au sein du CMPP Centre Al-Amal S4.',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    offerA1Id = offerA1.id;

    const offerA2 = await prisma.jobOffer.create({
      data: {
        organizationId: orgAId,
        authorMemberId: ownerAMember.id,
        title: 'Poste Psychologue Clinicien Rabat S4-2',
        offerType: OfferType.EMPLOI,
        contractSubType: 'CDI',
        requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
        targetSpecialtyId: specId,
        regionCode: 'MA-04',
        cityName: 'Rabat',
        minExperienceMonths: 0,
        isExperienceMandatory: false,
        startDate: new Date('2026-05-01'),
        description: 'Poste CDI Psychologue Clinicien S4.',
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    offerA2Id = offerA2.id;

    // Créer les 4 profils candidats
    const makeProfile = async (
      userKey: string,
      firstName: string,
      lastName: string,
      withConsent: boolean,
      cvPath?: string,
    ) => {
      if (withConsent) {
        await prisma.consent.create({
          data: {
            userId: users[userKey].userId,
            consentType: 'TALENT_POOL_MATCHING',
            version: '1.0',
            hasConsented: true,
            ipAddress: '196.200.80.44',
            userAgent: 'Jest/Sprint4',
          },
        });
      }

      const prof = await prisma.candidateProfile.create({
        data: {
          userId: users[userKey].userId,
          firstName,
          lastName,
          phone: '+212661998877',
          profileCategory: ProfileCategory.RECENT_GRADUATE,
          primarySpecialtyId: specId,
          regionCode: 'MA-04',
          cityName: 'Rabat',
          mobilityRadiusKm: 40,
          openToRelocation: true,
          availabilityStatus: AvailabilityStatus.IMMEDIATE,
          cvStoragePath: cvPath ?? null,
          education: {
            create: [
              {
                degreeLevel: DegreeLevel.BAC_5_MASTER,
                degreeTitle: 'Master Psychologie Clinique',
                institutionName: 'Université Mohammed V',
                specialtyId: specId,
                startYear: 2023,
                endYear: 2025,
                isCurrentlyEnrolled: false,
              },
            ],
          },
          languages: {
            create: [
              {
                languageCode: 'FR',
                proficiencyLevel: LanguageProficiency.COURANT_PROFESSIONNEL,
              },
            ],
          },
        },
      });
      return prof.id;
    };

    candDirectProfileId = await makeProfile(
      'candDirect',
      'Kenza',
      'Bennani',
      false,
      'candidates/direct/cv/sample.pdf',
    );
    candInviteAcceptProfileId = await makeProfile(
      'candInviteAccept',
      'Youssef',
      'Mansouri',
      true,
      'candidates/invite-accept/cv/sample.pdf',
    );
    candInviteDeclineProfileId = await makeProfile(
      'candInviteDecline',
      'Salma',
      'Tazi',
      true,
    );
    candNoConsentProfileId = await makeProfile(
      'candNoConsent',
      'Omar',
      'Idrissi',
      false,
    );
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: createdOrgIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } },
    });
    await prisma.refSpecialty.deleteMany({
      where: { id: { in: createdSpecialtyIds } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  describe('1. Candidature directe (DIRECT_APPLY -> SUBMITTED)', () => {
    it('crée une candidature directe avec score de matching initial et débloque le profil pour le recruteur', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${users.candDirect.token}`)
        .send({
          jobOfferId: offerA1Id,
          comment: 'Candidature directe motivée pour ce stage PFE.',
        })
        .expect(201);

      expect(res.body.data.origin).toBe(ApplicationOrigin.DIRECT_APPLY);
      expect(res.body.data.currentStatus).toBe(ApplicationStatus.SUBMITTED);
      expect(res.body.data.initialMatchScore).toBe(100);
      expect(res.body.data.history).toHaveLength(1);
      expect(res.body.data.history[0].toStatus).toBe(
        ApplicationStatus.SUBMITTED,
      );

      // Le recruteur de Org A voit immédiatement l'identité débloquée
      const listRes = await request(app.getHttpServer())
        .get(
          `/api/v1/organizations/${orgAId}/job-offers/${offerA1Id}/applications`,
        )
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .expect(200);

      const appItem = listRes.body.data.find(
        (a: { candidateId: string }) => a.candidateId === candDirectProfileId,
      );
      expect(appItem).toBeDefined();
      expect(appItem.isAnonymized).toBe(false);
      expect(appItem.candidate.firstName).toBe('Kenza');
      expect(appItem.candidate.lastName).toBe('Bennani');
      expect(appItem.candidate.email).toBe(users.candDirect.email);
      expect(appItem.candidate.hasCv).toBe(true);
    });

    it('interdit les candidatures en doublon sur la même offre (409 Conflict)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Authorization', `Bearer ${users.candDirect.token}`)
        .send({ jobOfferId: offerA1Id })
        .expect(409);
    });
  });

  describe('2. Invitations depuis le vivier (CENTER_INVITATION -> INVITED) et Anonymisation stricte', () => {
    it('refuse l invitation d un candidat sans consentement TALENT_POOL_MATCHING actif (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/applications/invite')
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          jobOfferId: offerA1Id,
          candidateId: candNoConsentProfileId,
          personalizedMessage: 'Invitation non autorisée sans consentement',
        })
        .expect(403);
    });

    it('refuse à un membre VIEWER d envoyer une invitation (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/applications/invite')
        .set('Authorization', `Bearer ${users.viewerA.token}`)
        .send({
          jobOfferId: offerA1Id,
          candidateId: candInviteAcceptProfileId,
        })
        .expect(403);
    });

    it('invite un candidat éligible du vivier et maintient l anonymisation tant que le statut est INVITED', async () => {
      const inviteRes = await request(app.getHttpServer())
        .post('/api/v1/applications/invite')
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          jobOfferId: offerA1Id,
          candidateId: candInviteAcceptProfileId,
          personalizedMessage:
            'Bonjour, votre profil anonymisé correspond à notre offre de stage PFE.',
        })
        .expect(201);

      expect(inviteRes.body.data.status).toBe(ApplicationStatus.INVITED);
      expect(inviteRes.body.data.expiresAt).toBeDefined();

      // Vérifier que le profil reste strictement anonymisé pour le recruteur tant que INVITED
      const orgListRes = await request(app.getHttpServer())
        .get(
          `/api/v1/organizations/${orgAId}/job-offers/${offerA1Id}/applications`,
        )
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .expect(200);

      const invitedItem = orgListRes.body.data.find(
        (a: { candidateId: string }) =>
          a.candidateId === candInviteAcceptProfileId,
      );
      expect(invitedItem).toBeDefined();
      expect(invitedItem.currentStatus).toBe(ApplicationStatus.INVITED);
      expect(invitedItem.isAnonymized).toBe(true);
      expect(invitedItem.candidate.displayName).toMatch(/^#CAND-[0-9A-F]{6}$/);
      expect(invitedItem.candidate.firstName).toBeNull();
      expect(invitedItem.candidate.lastName).toBeNull();
      expect(invitedItem.candidate.email).toBeNull();
      expect(invitedItem.candidate.phone).toBeNull();
      expect(invitedItem.candidate.hasCv).toBe(false);

      // Le recruteur ne peut PAS télécharger le CV tant que le candidat est INVITED (403)
      await request(app.getHttpServer())
        .post('/api/v1/candidate/cv/download-url')
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          candidateId: candInviteAcceptProfileId,
          jobOfferId: offerA1Id,
        })
        .expect(403);
    });
  });

  describe('3. Refus d invitation, Règle Anti-Spam (30 jours) et Expiration (14 jours)', () => {
    it('bloque la ré-invitation pendant 30 jours après un refus du candidat (INVITATION_DECLINED)', async () => {
      const inviteRes = await request(app.getHttpServer())
        .post('/api/v1/applications/invite')
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          jobOfferId: offerA1Id,
          candidateId: candInviteDeclineProfileId,
        })
        .expect(201);

      const appId = inviteRes.body.data.applicationId;

      // Le candidat refuse l'invitation
      const declineRes = await request(app.getHttpServer())
        .patch(`/api/v1/candidates/me/applications/${appId}/status`)
        .set('Authorization', `Bearer ${users.candInviteDecline.token}`)
        .send({
          targetStatus: ApplicationStatus.INVITATION_DECLINED,
          comment: 'Non disponible sur cette période',
        })
        .expect(200);

      expect(declineRes.body.data.currentStatus).toBe(
        ApplicationStatus.INVITATION_DECLINED,
      );

      // Tentative de ré-invitation immédiate -> bloquée par la règle anti-spam 30 jours (400)
      await request(app.getHttpServer())
        .post('/api/v1/applications/invite')
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          jobOfferId: offerA1Id,
          candidateId: candInviteDeclineProfileId,
        })
        .expect(400);
    });

    it('bascule automatiquement en INVITATION_EXPIRED si la date d expiration (14j) est dépassée', async () => {
      const inviteRes = await request(app.getHttpServer())
        .post('/api/v1/applications/invite')
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          jobOfferId: offerA2Id,
          candidateId: candInviteDeclineProfileId,
        })
        .expect(201);

      const appId = inviteRes.body.data.applicationId;

      // Forcer une date d'expiration passée en base
      await prisma.application.update({
        where: { id: appId },
        data: {
          invitationExpiresAt: new Date(Date.now() - 86_400_000),
        },
      });

      // Tentative d'acceptation par le candidat -> bloquée (400) et statut basculé en INVITATION_EXPIRED
      await request(app.getHttpServer())
        .patch(`/api/v1/candidates/me/applications/${appId}/status`)
        .set('Authorization', `Bearer ${users.candInviteDecline.token}`)
        .send({
          targetStatus: ApplicationStatus.SUBMITTED,
        })
        .expect(400);

      const dbRow = await prisma.application.findUniqueOrThrow({
        where: { id: appId },
      });
      expect(dbRow.currentStatus).toBe(ApplicationStatus.INVITATION_EXPIRED);
    });
  });

  describe('4. Acceptation d invitation, Dé-anonymisation, Accès CV et Parcours Complet FSM', () => {
    let workflowAppId = '';

    it('accepte l invitation (INVITED -> SUBMITTED), lève l anonymat et autorise le téléchargement du CV', async () => {
      const myAppsRes = await request(app.getHttpServer())
        .get('/api/v1/candidates/me/applications')
        .set('Authorization', `Bearer ${users.candInviteAccept.token}`)
        .expect(200);

      const invApp = myAppsRes.body.data.find(
        (a: { jobOfferId: string }) => a.jobOfferId === offerA1Id,
      );
      expect(invApp).toBeDefined();
      workflowAppId = invApp.id;

      // Acceptation par le candidat
      const acceptRes = await request(app.getHttpServer())
        .patch(`/api/v1/candidates/me/applications/${workflowAppId}/status`)
        .set('Authorization', `Bearer ${users.candInviteAccept.token}`)
        .send({
          targetStatus: ApplicationStatus.SUBMITTED,
          comment: 'J accepte avec plaisir cette invitation.',
        })
        .expect(200);

      expect(acceptRes.body.data.currentStatus).toBe(
        ApplicationStatus.SUBMITTED,
      );

      // Le recruteur voit désormais l'identité complète de Youssef Mansouri
      const orgListRes = await request(app.getHttpServer())
        .get(
          `/api/v1/organizations/${orgAId}/job-offers/${offerA1Id}/applications`,
        )
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .expect(200);

      const unmaskedItem = orgListRes.body.data.find(
        (a: { id: string }) => a.id === workflowAppId,
      );
      expect(unmaskedItem.isAnonymized).toBe(false);
      expect(unmaskedItem.candidate.firstName).toBe('Youssef');
      expect(unmaskedItem.candidate.lastName).toBe('Mansouri');
      expect(unmaskedItem.candidate.email).toBe(users.candInviteAccept.email);
      expect(unmaskedItem.candidate.hasCv).toBe(true);

      // Le recruteur peut désormais obtenir l'URL pré-signée de téléchargement du CV + log CV_DOWNLOAD
      const cvRes = await request(app.getHttpServer())
        .post('/api/v1/candidate/cv/download-url')
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          candidateId: candInviteAcceptProfileId,
          jobOfferId: offerA1Id,
        })
        .expect(200);

      expect(cvRes.body.data.presignedUrl).toBeDefined();
      expect(cvRes.body.data.expiresInSeconds).toBe(900);

      // Vérifier que PROFILE_UNMASK et CV_DOWNLOAD sont enregistrés dans AUDIT_LOGS
      const unmaskLogs = await prisma.auditLog.findMany({
        where: {
          entityId: candInviteAcceptProfileId,
          action: { in: ['PROFILE_UNMASK', 'CV_DOWNLOAD'] },
        },
      });
      expect(unmaskLogs.length).toBeGreaterThanOrEqual(2);
    });

    it('exécute le cycle complet FSM avec plafond de 2 reports d entretien jusqu à HIRED', async () => {
      // 1. SUBMITTED -> REVIEWING (Recruteur)
      const revRes = await request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/${orgAId}/applications/${workflowAppId}/status`,
        )
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          targetStatus: ApplicationStatus.REVIEWING,
          comment: 'Dossier en cours d analyse par l équipe clinique.',
        })
        .expect(200);
      expect(revRes.body.data.currentStatus).toBe(ApplicationStatus.REVIEWING);

      // 2. REVIEWING -> INTERVIEW_PROPOSED (Recruteur)
      const futureDate1 = new Date(Date.now() + 5 * 86_400_000).toISOString();
      const prop1Res = await request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/${orgAId}/applications/${workflowAppId}/status`,
        )
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          targetStatus: ApplicationStatus.INTERVIEW_PROPOSED,
          interviewDate: futureDate1,
          interviewMode: InterviewMode.IN_PERSON,
          interviewLocationOrLink: 'CMPP Al-Amal, Rabat',
          comment: 'Proposition de premier créneau d entretien.',
        })
        .expect(200);
      expect(prop1Res.body.data.currentStatus).toBe(
        ApplicationStatus.INTERVIEW_PROPOSED,
      );

      // 3. Report #1 (INTERVIEW_PROPOSED -> INTERVIEW_RESCHEDULE_REQUESTED)
      const resched1 = await request(app.getHttpServer())
        .patch(`/api/v1/candidates/me/applications/${workflowAppId}/status`)
        .set('Authorization', `Bearer ${users.candInviteAccept.token}`)
        .send({
          targetStatus: ApplicationStatus.INTERVIEW_RESCHEDULE_REQUESTED,
          comment: 'Examen universitaire à cette date.',
        })
        .expect(200);
      expect(resched1.body.data.currentStatus).toBe(
        ApplicationStatus.INTERVIEW_RESCHEDULE_REQUESTED,
      );
      expect(resched1.body.data.interviewRescheduleCount).toBe(1);

      // 4. Nouvelle proposition #2 (INTERVIEW_RESCHEDULE_REQUESTED -> INTERVIEW_PROPOSED)
      const futureDate2 = new Date(Date.now() + 7 * 86_400_000).toISOString();
      await request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/${orgAId}/applications/${workflowAppId}/status`,
        )
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          targetStatus: ApplicationStatus.INTERVIEW_PROPOSED,
          interviewDate: futureDate2,
          interviewMode: InterviewMode.VIDEO_CALL,
          interviewLocationOrLink: 'https://meet.psyrekrute.ma/entretien-s4',
        })
        .expect(200);

      // 5. Report #2 (atteint le plafond max = 2)
      const resched2 = await request(app.getHttpServer())
        .patch(`/api/v1/candidates/me/applications/${workflowAppId}/status`)
        .set('Authorization', `Bearer ${users.candInviteAccept.token}`)
        .send({
          targetStatus: ApplicationStatus.INTERVIEW_RESCHEDULE_REQUESTED,
          comment: 'Soutenance déplacée.',
        })
        .expect(200);
      expect(resched2.body.data.interviewRescheduleCount).toBe(2);

      // 6. Nouvelle proposition #3 par le recruteur
      const futureDate3 = new Date(Date.now() + 9 * 86_400_000).toISOString();
      await request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/${orgAId}/applications/${workflowAppId}/status`,
        )
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          targetStatus: ApplicationStatus.INTERVIEW_PROPOSED,
          interviewDate: futureDate3,
          interviewMode: InterviewMode.VIDEO_CALL,
          interviewLocationOrLink: 'https://meet.psyrekrute.ma/entretien-s4-final',
        })
        .expect(200);

      // 7. Tentative de Report #3 par le candidat -> bloquée (400 Bad Request, max 2 reports)
      await request(app.getHttpServer())
        .patch(`/api/v1/candidates/me/applications/${workflowAppId}/status`)
        .set('Authorization', `Bearer ${users.candInviteAccept.token}`)
        .send({
          targetStatus: ApplicationStatus.INTERVIEW_RESCHEDULE_REQUESTED,
          comment: 'Troisième report interdit.',
        })
        .expect(400);

      // 8. Confirmation de l'entretien par le candidat (INTERVIEW_PROPOSED -> INTERVIEW_CONFIRMED)
      const confirmRes = await request(app.getHttpServer())
        .patch(`/api/v1/candidates/me/applications/${workflowAppId}/status`)
        .set('Authorization', `Bearer ${users.candInviteAccept.token}`)
        .send({
          targetStatus: ApplicationStatus.INTERVIEW_CONFIRMED,
          comment: 'Créneau confirmé.',
        })
        .expect(200);
      expect(confirmRes.body.data.currentStatus).toBe(
        ApplicationStatus.INTERVIEW_CONFIRMED,
      );

      // 9. Proposition finale par le recruteur (INTERVIEW_CONFIRMED -> OFFER_EXTENDED)
      const offerExtRes = await request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/${orgAId}/applications/${workflowAppId}/status`,
        )
        .set('Authorization', `Bearer ${users.ownerA.token}`)
        .send({
          targetStatus: ApplicationStatus.OFFER_EXTENDED,
          hiringOfferDetails:
            'Convention de stage PFE de 6 mois avec gratification de 2500 MAD/mois.',
          comment: 'Excellent entretien clinique.',
        })
        .expect(200);
      expect(offerExtRes.body.data.currentStatus).toBe(
        ApplicationStatus.OFFER_EXTENDED,
      );
      expect(offerExtRes.body.data.hiringOfferDeadline).toBeDefined();

      // 10. Acceptation finale par le candidat (OFFER_EXTENDED -> HIRED)
      const hiredRes = await request(app.getHttpServer())
        .patch(`/api/v1/candidates/me/applications/${workflowAppId}/status`)
        .set('Authorization', `Bearer ${users.candInviteAccept.token}`)
        .send({
          targetStatus: ApplicationStatus.HIRED,
          comment: 'J accepte l offre de stage PFE.',
        })
        .expect(200);
      expect(hiredRes.body.data.currentStatus).toBe(ApplicationStatus.HIRED);

      // 11. Impossible de retirer sa candidature après HIRED (400)
      await request(app.getHttpServer())
        .patch(`/api/v1/candidates/me/applications/${workflowAppId}/status`)
        .set('Authorization', `Bearer ${users.candInviteAccept.token}`)
        .send({
          targetStatus: ApplicationStatus.WITHDRAWN,
        })
        .expect(400);

      // Vérifier l'historique immuable complet dans APPLICATION_HISTORY (11 transitions de INVITED à HIRED)
      expect(hiredRes.body.data.history.length).toBe(11);
    });
  });

  describe('5. Isolation inter-organisations et contrôle RBAC', () => {
    it('interdit à Organisation B de lister ou modifier les candidatures de Organisation A (403/404)', async () => {
      await request(app.getHttpServer())
        .get(
          `/api/v1/organizations/${orgAId}/job-offers/${offerA1Id}/applications`,
        )
        .set('Authorization', `Bearer ${users.ownerB.token}`)
        .expect(403);
    });

    it('autorise un VIEWER à consulter la liste des candidatures mais lui interdit toute transition (403)', async () => {
      const listRes = await request(app.getHttpServer())
        .get(
          `/api/v1/organizations/${orgAId}/job-offers/${offerA1Id}/applications`,
        )
        .set('Authorization', `Bearer ${users.viewerA.token}`)
        .expect(200);

      const directApp = listRes.body.data.find(
        (a: { candidateId: string }) => a.candidateId === candDirectProfileId,
      );
      expect(directApp).toBeDefined();

      await request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/${orgAId}/applications/${directApp.id}/status`,
        )
        .set('Authorization', `Bearer ${users.viewerA.token}`)
        .send({
          targetStatus: ApplicationStatus.REVIEWING,
        })
        .expect(403);
    });
  });
});
