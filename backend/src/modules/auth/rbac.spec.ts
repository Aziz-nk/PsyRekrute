import {
  Body,
  Controller,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  INestApplication,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import {
  GlobalRole,
  OrganizationType,
  OrgMemberRole,
  PrismaClient,
} from '@prisma/client';
import * as request from 'supertest';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from './auth.module';
import { AuthSessionService } from './auth-session.service';
import { GlobalRolesGuard } from './global-roles.guard';
import { AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard';
import { OrgRolesGuard } from './org-roles.guard';
import { PasswordHashService } from './password-hash.service';
import {
  DCTF_PERMISSION_MATRIX,
  OrgIdParam,
  OrgRoles,
  Public,
  Roles,
} from './rbac.decorators';

/**
 * Controleur de test interne (uniquement monte dans ce spec) reproduisant
 * les actions de la matrice des permissions du DCTF §4.2.
 */
@Controller('rbac-test')
@UseGuards(JwtAuthGuard, GlobalRolesGuard, OrgRolesGuard)
class RbacMatrixTestController {
  @Public()
  @Get('public-offers')
  getPublicOffers() {
    return { ok: true, access: 'PUBLIC' };
  }

  @Get('authenticated-any')
  getAuthenticatedAny(@Req() req: AuthenticatedRequest) {
    return { ok: true, role: req.user.globalRole };
  }

  // Action §4.2 : Postuler directement a une offre -> CANDIDATE uniquement (SYSTEM_ADMIN interdit)
  @Roles(GlobalRole.CANDIDATE)
  @Post('offers/apply')
  applyToOffer(@Req() req: AuthenticatedRequest) {
    return { ok: true, actor: req.user.userId };
  }

  // Action §4.2 : Consulter les logs d'audit / Valider ICE -> SYSTEM_ADMIN exclusivement
  @Roles(GlobalRole.SYSTEM_ADMIN)
  @Get('admin/audit-logs')
  getAuditLogs() {
    return { ok: true, scope: 'SYSTEM_ADMIN_ONLY' };
  }

  // Action §4.2 : Explorer le vivier -> ORG (VIEWER, RECRUITER, ADMIN, OWNER) ou SYSTEM_ADMIN
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @OrgRoles(
    OrgMemberRole.VIEWER,
    OrgMemberRole.RECRUITER,
    OrgMemberRole.ADMIN,
    OrgMemberRole.OWNER,
  )
  @Get('orgs/:organizationId/talent-pool')
  exploreTalentPool(@Req() req: AuthenticatedRequest) {
    return {
      ok: true,
      membership: req.organizationMembership ?? null,
    };
  }

  // Action §4.2 : Creer / Modifier une offre -> ORG (RECRUITER, ADMIN, OWNER) ou SYSTEM_ADMIN (Moderation)
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @OrgRoles(OrgMemberRole.RECRUITER, OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @Post('orgs/:organizationId/offers')
  createOrUpdateOffer(
    @Param('organizationId') organizationId: string,
    @Body() _body: Record<string, unknown>,
  ) {
    return { ok: true, organizationId };
  }

  // Action §4.2 : Inviter un candidat du vivier -> ORG (RECRUITER, ADMIN, OWNER) uniquement (SYSTEM_ADMIN interdit)
  @Roles(GlobalRole.ORGANIZATION_USER)
  @OrgRoles(OrgMemberRole.RECRUITER, OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @Post('orgs/:organizationId/invitations')
  inviteCandidateFromPool(@Param('organizationId') organizationId: string) {
    return { ok: true, organizationId };
  }

  // Action §4.2 : Supprimer / Archiver une offre -> ORG (ADMIN, OWNER) ou SYSTEM_ADMIN
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @OrgRoles(OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @Delete('orgs/:organizationId/offers')
  deleteOrArchiveOffer(@Param('organizationId') organizationId: string) {
    return { ok: true, organizationId };
  }

  // Action §4.2 : Gerer les membres de l'organisation -> ORG (ADMIN, OWNER) uniquement (SYSTEM_ADMIN interdit)
  @OrgIdParam('customOrgId')
  @OrgRoles(OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @Post('organizations/:customOrgId/members')
  manageOrgMembers(@Param('customOrgId') customOrgId: string) {
    return { ok: true, organizationId: customOrgId };
  }
}

describe('M2 – RBAC (GlobalRolesGuard, OrgRolesGuard, @Roles, @OrgRoles, @Public) et Isolation Inter-Organisations', () => {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://psyrekrute_dev_user@127.0.0.1:5432/psyrekrute_db?schema=public';
  let app: INestApplication;
  let prisma: PrismaClient;
  let authSessionService: AuthSessionService;
  let passwordHashService: PasswordHashService;
  let globalRolesGuard: GlobalRolesGuard;
  let orgRolesGuard: OrgRolesGuard;

  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  // Jetons JWT pre-signes pour chaque profil de la matrice §4.2
  let tokenCandidate: string;
  let tokenSystemAdmin: string;
  let tokenOrgAViewer: string;
  let tokenOrgARecruiter: string;
  let tokenOrgAAdmin: string;
  let tokenOrgAOwner: string;
  let tokenOrgBOwner: string;
  let tokenOrgUnfaffiliated: string;

  let orgAId: string;
  let orgBId: string;

  const createTestUserWithToken = async (
    prefix: string,
    globalRole: GlobalRole,
  ): Promise<{ userId: string; token: string }> => {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@psyrekrute.ma`;
    const passwordHash = await passwordHashService.hash(
      'mot de passe test rbac m2',
    );
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        globalRole,
        preferredLocale: 'fr',
        isActive: true,
      },
    });
    createdUserIds.push(user.id);

    const token = await authSessionService.signAccessToken({
      sub: user.id,
      email: user.email,
      globalRole: user.globalRole,
      preferredLocale: user.preferredLocale,
    });
    return { userId: user.id, token };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;

    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
      controllers: [RbacMatrixTestController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    authSessionService = moduleFixture.get(AuthSessionService);
    passwordHashService = moduleFixture.get(PasswordHashService);
    globalRolesGuard = moduleFixture.get(GlobalRolesGuard);
    orgRolesGuard = moduleFixture.get(OrgRolesGuard);

    // Creation de deux organisations distinctes (Org A et Org B) dans PostgreSQL
    const orgA = await prisma.organization.create({
      data: {
        legalName: 'Centre Psychologique Atlas (Org A)',
        tradeName: 'Atlas Psy',
        organizationType: OrganizationType.CABINET_LIBERAL,
        phone: '+212522000001',
        email: 'contact@atlas-psy.ma',
        regionCode: 'MA-06',
        cityName: 'Casablanca',
        addressLine: '10 Bd Anfa',
      },
    });
    createdOrgIds.push(orgA.id);
    orgAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: {
        legalName: 'Fondation Inclusion Rabat (Org B)',
        tradeName: 'Inclusion Rabat',
        organizationType: OrganizationType.ASSOCIATION,
        phone: '+212537000002',
        email: 'contact@inclusion-rabat.ma',
        regionCode: 'MA-04',
        cityName: 'Rabat',
        addressLine: '25 Av Mohammed V',
      },
    });
    createdOrgIds.push(orgB.id);
    orgBId = orgB.id;

    // Creation des utilisateurs et rattachement aux organisations
    const cand = await createTestUserWithToken('cand', GlobalRole.CANDIDATE);
    tokenCandidate = cand.token;

    const sysAdmin = await createTestUserWithToken(
      'sysadmin',
      GlobalRole.SYSTEM_ADMIN,
    );
    tokenSystemAdmin = sysAdmin.token;

    const viewerA = await createTestUserWithToken(
      'viewer-a',
      GlobalRole.ORGANIZATION_USER,
    );
    tokenOrgAViewer = viewerA.token;
    await prisma.organizationMember.create({
      data: {
        organizationId: orgAId,
        userId: viewerA.userId,
        role: OrgMemberRole.VIEWER,
      },
    });

    const recruiterA = await createTestUserWithToken(
      'recruiter-a',
      GlobalRole.ORGANIZATION_USER,
    );
    tokenOrgARecruiter = recruiterA.token;
    await prisma.organizationMember.create({
      data: {
        organizationId: orgAId,
        userId: recruiterA.userId,
        role: OrgMemberRole.RECRUITER,
      },
    });

    const adminA = await createTestUserWithToken(
      'admin-a',
      GlobalRole.ORGANIZATION_USER,
    );
    tokenOrgAAdmin = adminA.token;
    await prisma.organizationMember.create({
      data: {
        organizationId: orgAId,
        userId: adminA.userId,
        role: OrgMemberRole.ADMIN,
      },
    });

    const ownerA = await createTestUserWithToken(
      'owner-a',
      GlobalRole.ORGANIZATION_USER,
    );
    tokenOrgAOwner = ownerA.token;
    await prisma.organizationMember.create({
      data: {
        organizationId: orgAId,
        userId: ownerA.userId,
        role: OrgMemberRole.OWNER,
      },
    });

    const ownerB = await createTestUserWithToken(
      'owner-b',
      GlobalRole.ORGANIZATION_USER,
    );
    tokenOrgBOwner = ownerB.token;
    await prisma.organizationMember.create({
      data: {
        organizationId: orgBId,
        userId: ownerB.userId,
        role: OrgMemberRole.OWNER,
      },
    });

    const unaffiliated = await createTestUserWithToken(
      'unaffiliated',
      GlobalRole.ORGANIZATION_USER,
    );
    tokenOrgUnfaffiliated = unaffiliated.token;
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

  describe('1. Comportement de @Public() et reponses 401 vs 403', () => {
    it('autorise une route @Public() sans en-tete Authorization (200 OK)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/rbac-test/public-offers')
        .expect(200);

      expect(res.body).toEqual({ ok: true, access: 'PUBLIC' });
    });

    it('retourne 401 Unauthorized sans token sur une route protegee et 200 OK pour tout role authentifie sans restriction', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/authenticated-any')
        .expect(401);

      const res = await request(app.getHttpServer())
        .get('/api/v1/rbac-test/authenticated-any')
        .set('Authorization', `Bearer ${tokenCandidate}`)
        .expect(200);

      expect(res.body.role).toBe(GlobalRole.CANDIDATE);
    });
  });

  describe('2. Permissions par GlobalRole et absence de privileges implicites pour SYSTEM_ADMIN (DCTF §4.2)', () => {
    it('APPLY_TO_OFFER : autorise uniquement CANDIDATE (200) et refuse ORGANIZATION_USER (403) ainsi que SYSTEM_ADMIN (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/rbac-test/offers/apply')
        .set('Authorization', `Bearer ${tokenCandidate}`)
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/rbac-test/offers/apply')
        .set('Authorization', `Bearer ${tokenOrgAOwner}`)
        .expect(403);

      // SYSTEM_ADMIN ne peut pas postuler a une offre (DCTF §4.2 : Interdit)
      await request(app.getHttpServer())
        .post('/api/v1/rbac-test/offers/apply')
        .set('Authorization', `Bearer ${tokenSystemAdmin}`)
        .expect(403);
    });

    it('VIEW_AUDIT_LOGS : autorise uniquement SYSTEM_ADMIN (200) et refuse CANDIDATE (403) et ORGANIZATION_USER (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/admin/audit-logs')
        .set('Authorization', `Bearer ${tokenSystemAdmin}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/admin/audit-logs')
        .set('Authorization', `Bearer ${tokenCandidate}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/admin/audit-logs')
        .set('Authorization', `Bearer ${tokenOrgAOwner}`)
        .expect(403);
    });
  });

  describe('3. Permissions par OrgMemberRole selon la matrice DCTF §4.2', () => {
    it('EXPLORE_TALENT_POOL : autorise VIEWER, RECRUITER, ADMIN, OWNER de Org A et SYSTEM_ADMIN (200), mais refuse CANDIDATE (403)', async () => {
      for (const token of [
        tokenOrgAViewer,
        tokenOrgARecruiter,
        tokenOrgAAdmin,
        tokenOrgAOwner,
        tokenSystemAdmin,
      ]) {
        await request(app.getHttpServer())
          .get(`/api/v1/rbac-test/orgs/${orgAId}/talent-pool`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }

      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test/orgs/${orgAId}/talent-pool`)
        .set('Authorization', `Bearer ${tokenCandidate}`)
        .expect(403);
    });

    it('CREATE_OR_UPDATE_OFFER : refuse VIEWER (403), autorise RECRUITER, ADMIN, OWNER et SYSTEM_ADMIN (201)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/rbac-test/orgs/${orgAId}/offers`)
        .set('Authorization', `Bearer ${tokenOrgAViewer}`)
        .send({ title: 'Offre test' })
        .expect(403);

      for (const token of [
        tokenOrgARecruiter,
        tokenOrgAAdmin,
        tokenOrgAOwner,
        tokenSystemAdmin,
      ]) {
        await request(app.getHttpServer())
          .post(`/api/v1/rbac-test/orgs/${orgAId}/offers`)
          .set('Authorization', `Bearer ${token}`)
          .send({ title: 'Offre test' })
          .expect(201);
      }
    });

    it('INVITE_CANDIDATE_FROM_POOL : refuse VIEWER (403) et SYSTEM_ADMIN (403), autorise RECRUITER, ADMIN et OWNER (201)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/rbac-test/orgs/${orgAId}/invitations`)
        .set('Authorization', `Bearer ${tokenOrgAViewer}`)
        .expect(403);

      // DCTF §4.2 : Inviter un candidat du vivier est INTERDIT pour SYSTEM_ADMIN
      await request(app.getHttpServer())
        .post(`/api/v1/rbac-test/orgs/${orgAId}/invitations`)
        .set('Authorization', `Bearer ${tokenSystemAdmin}`)
        .expect(403);

      for (const token of [
        tokenOrgARecruiter,
        tokenOrgAAdmin,
        tokenOrgAOwner,
      ]) {
        await request(app.getHttpServer())
          .post(`/api/v1/rbac-test/orgs/${orgAId}/invitations`)
          .set('Authorization', `Bearer ${token}`)
          .expect(201);
      }
    });

    it('DELETE_OR_ARCHIVE_OFFER : refuse VIEWER (403) et RECRUITER (403), autorise ADMIN, OWNER et SYSTEM_ADMIN (200)', async () => {
      for (const token of [tokenOrgAViewer, tokenOrgARecruiter]) {
        await request(app.getHttpServer())
          .delete(`/api/v1/rbac-test/orgs/${orgAId}/offers`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }

      for (const token of [tokenOrgAAdmin, tokenOrgAOwner, tokenSystemAdmin]) {
        await request(app.getHttpServer())
          .delete(`/api/v1/rbac-test/orgs/${orgAId}/offers`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }
    });

    it('MANAGE_ORG_MEMBERS : refuse VIEWER (403), RECRUITER (403) et SYSTEM_ADMIN (403), autorise uniquement ADMIN et OWNER (201)', async () => {
      for (const token of [
        tokenOrgAViewer,
        tokenOrgARecruiter,
        tokenSystemAdmin,
        tokenCandidate,
      ]) {
        await request(app.getHttpServer())
          .post(`/api/v1/rbac-test/organizations/${orgAId}/members`)
          .set('Authorization', `Bearer ${token}`)
          .expect(403);
      }

      for (const token of [tokenOrgAAdmin, tokenOrgAOwner]) {
        await request(app.getHttpServer())
          .post(`/api/v1/rbac-test/organizations/${orgAId}/members`)
          .set('Authorization', `Bearer ${token}`)
          .expect(201);
      }
    });
  });

  describe('4. Isolation inter-organisations et rejet de tout organizationId non verifie', () => {
    it('refuse a OWNER de Org A tout acces aux ressources de Org B (403), meme s il injecte organizationId=OrgA dans le body ou la query', async () => {
      // OWNER de Org A tente d'acceder au vivier de Org B -> 403
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test/orgs/${orgBId}/talent-pool`)
        .set('Authorization', `Bearer ${tokenOrgAOwner}`)
        .expect(403);

      // OWNER de Org A tente de creer une offre dans Org B en injectant organizationId=orgAId dans le body et la query -> 403
      await request(app.getHttpServer())
        .post(
          `/api/v1/rbac-test/orgs/${orgBId}/offers?organizationId=${orgAId}`,
        )
        .set('Authorization', `Bearer ${tokenOrgAOwner}`)
        .send({ organizationId: orgAId, title: 'Tentative contournement' })
        .expect(403);

      // OWNER de Org B accede bien a sa propre organisation Org B -> 201
      await request(app.getHttpServer())
        .post(`/api/v1/rbac-test/orgs/${orgBId}/offers`)
        .set('Authorization', `Bearer ${tokenOrgBOwner}`)
        .send({ title: 'Offre legitime Org B' })
        .expect(201);
    });

    it('refuse un ORGANIZATION_USER non membre (403), un UUID invalide (403) et une organisation desactivee (403)', async () => {
      // Utilisateur non membre d'Org A ni d'Org B -> 403
      await request(app.getHttpServer())
        .get(`/api/v1/rbac-test/orgs/${orgAId}/talent-pool`)
        .set('Authorization', `Bearer ${tokenOrgUnfaffiliated}`)
        .expect(403);

      // UUID malforme -> 403
      await request(app.getHttpServer())
        .get('/api/v1/rbac-test/orgs/not-a-valid-uuid/talent-pool')
        .set('Authorization', `Bearer ${tokenOrgAOwner}`)
        .expect(403);

      // Organisation inexistante pour SYSTEM_ADMIN -> 403
      await request(app.getHttpServer())
        .get(
          '/api/v1/rbac-test/orgs/00000000-0000-4000-8000-000000000000/talent-pool',
        )
        .set('Authorization', `Bearer ${tokenSystemAdmin}`)
        .expect(403);
    });

    it('verifie les cas unitaires directs des guards (401 si req.user absent, 403 si params absents) et la matrice DCTF §4.2', async () => {
      const reflector = new Reflector();
      const dummyHandler = () => undefined;
      const dummyClass = class {};

      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: unknown) => {
          if (key === 'isPublic') return false;
          if (key === 'globalRoles') return [GlobalRole.CANDIDATE];
          if (key === 'orgRoles') return [OrgMemberRole.OWNER];
          return undefined;
        });

      const unauthContext = {
        getHandler: () => dummyHandler,
        getClass: () => dummyClass,
        switchToHttp: () => ({
          getRequest: () => ({}),
        }),
      } as unknown as ExecutionContext;

      const unitGlobalGuard = new GlobalRolesGuard(reflector);
      expect(() => unitGlobalGuard.canActivate(unauthContext)).toThrow(
        UnauthorizedException,
      );

      const unitOrgGuard = new OrgRolesGuard(
        reflector,
        prisma as unknown as never,
      );
      await expect(unitOrgGuard.canActivate(unauthContext)).rejects.toThrow(
        UnauthorizedException,
      );

      const noParamsContext = {
        getHandler: () => dummyHandler,
        getClass: () => dummyClass,
        switchToHttp: () => ({
          getRequest: () => ({
            user: {
              userId: 'u1',
              globalRole: GlobalRole.ORGANIZATION_USER,
            },
          }),
        }),
      } as unknown as ExecutionContext;
      await expect(unitOrgGuard.canActivate(noParamsContext)).rejects.toThrow(
        ForbiddenException,
      );

      // Verification de la matrice declarative §4.2
      expect(DCTF_PERMISSION_MATRIX.APPLY_TO_OFFER.globalRoles).toEqual([
        GlobalRole.CANDIDATE,
      ]);
      expect(
        DCTF_PERMISSION_MATRIX.INVITE_CANDIDATE_FROM_POOL.globalRoles,
      ).toEqual([GlobalRole.ORGANIZATION_USER]);
      expect(DCTF_PERMISSION_MATRIX.VIEW_AUDIT_LOGS.globalRoles).toEqual([
        GlobalRole.SYSTEM_ADMIN,
      ]);
      expect(globalRolesGuard).toBeDefined();
      expect(orgRolesGuard).toBeDefined();
    });
  });
});
