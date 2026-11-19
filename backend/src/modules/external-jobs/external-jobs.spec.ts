import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { ExternalJobStatus, GlobalRole } from '@prisma/client';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../database/prisma.service';
import { isPrivateOrReservedIp, validateSafeUrl } from './ssrf-guard.util';
import {
  computeContentHash,
  detectMoroccanCity,
  isRelevantSpecialty,
  stripHtmlToText,
} from './semantic-filter.util';

describe('ExternalJobsModule (Agrégateur d\'offres externes & Sécurité)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let adminToken: string;
  let candidateToken: string;
  let testAdminId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    // Création d'un utilisateur SYSTEM_ADMIN
    const adminUser = await prisma.user.upsert({
      where: { email: 'spec-admin-external@test.psyrekrute.ma' },
      update: { globalRole: GlobalRole.SYSTEM_ADMIN, isActive: true },
      create: {
        email: 'spec-admin-external@test.psyrekrute.ma',
        passwordHash: '$2a$10$dummyHashNotActuallyUsedBecauseWeMockJwtSecret',
        globalRole: GlobalRole.SYSTEM_ADMIN,
        isActive: true,
      },
    });
    testAdminId = adminUser.id;

    // Création d'un utilisateur CANDIDATE
    const candidateUser = await prisma.user.upsert({
      where: { email: 'spec-candidate-external@test.psyrekrute.ma' },
      update: { globalRole: GlobalRole.CANDIDATE, isActive: true },
      create: {
        email: 'spec-candidate-external@test.psyrekrute.ma',
        passwordHash: '$2a$10$dummyHashNotActuallyUsedBecauseWeMockJwtSecret',
        globalRole: GlobalRole.CANDIDATE,
        isActive: true,
      },
    });

    const jwtService = moduleFixture.get(JwtService);
    adminToken = jwtService.sign(
      {
        sub: testAdminId,
        email: 'spec-admin-external@test.psyrekrute.ma',
        role: GlobalRole.SYSTEM_ADMIN,
      },
      { secret: process.env.JWT_ACCESS_SECRET || 'local_jwt_access_secret_key_minimum_256_bits_for_testing' },
    );

    candidateToken = jwtService.sign(
      {
        sub: candidateUser.id,
        email: 'spec-candidate-external@test.psyrekrute.ma',
        role: GlobalRole.CANDIDATE,
      },
      { secret: process.env.JWT_ACCESS_SECRET || 'local_jwt_access_secret_key_minimum_256_bits_for_testing' },
    );
  });

  afterAll(async () => {
    // Nettoyage des annonces de test
    await prisma.externalJobListing.deleteMany({
      where: { sourceUrl: { contains: 'spec-test' } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'spec-admin-external' } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: 'spec-candidate-external' } },
    });
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. Protection Anti-SSRF
  // ---------------------------------------------------------------------------
  describe('1. Protection Anti-SSRF (ssrf-guard.util)', () => {
    it('détecte et bloque correctement les adresses IP privées et réservées', () => {
      expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true);
      expect(isPrivateOrReservedIp('172.16.0.10')).toBe(true);
      expect(isPrivateOrReservedIp('172.31.255.254')).toBe(true);
      expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
      expect(isPrivateOrReservedIp('169.254.169.254')).toBe(true); // AWS Metadata
      expect(isPrivateOrReservedIp('::1')).toBe(true);
      expect(isPrivateOrReservedIp('fe80::1')).toBe(true);
      expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true);

      // IPs publiques valides
      expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
      expect(isPrivateOrReservedIp('1.1.1.1')).toBe(false);
      expect(isPrivateOrReservedIp('216.58.214.206')).toBe(false);
    });

    it('bloque les URL pointant vers localhost, loopback ou conteneurs internes', async () => {
      await expect(validateSafeUrl('http://localhost:4000/api/v1/health')).rejects.toThrow();
      await expect(validateSafeUrl('http://127.0.0.1:5432/')).rejects.toThrow();
      await expect(validateSafeUrl('http://postgres:5432/')).rejects.toThrow();
      await expect(validateSafeUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow();
      await expect(validateSafeUrl('ftp://example.com/file')).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Filtrage sémantique et Dédoublonnage
  // ---------------------------------------------------------------------------
  describe('2. Filtrage Sémantique & Dédoublonnage', () => {
    it('identifie les mots-clés pertinents en FR, AR, EN', () => {
      expect(isRelevantSpecialty('Recrutement d\'un Psychologue Scolaire à Rabat')).toBe(true);
      expect(isRelevantSpecialty('مطلوب أخصائي نفسي لتأهيل أطفال التوحد')).toBe(true);
      expect(isRelevantSpecialty('Hiring Educational Neuropsychologist')).toBe(true);
      expect(isRelevantSpecialty('Recherche d\'un Orthophoniste pour centre médico-éducatif')).toBe(true);
      expect(isRelevantSpecialty('Offre de stage PFA en éducation spécialisée')).toBe(true);

      // Non pertinent
      expect(isRelevantSpecialty('Développeur Fullstack React Node.js')).toBe(false);
      expect(isRelevantSpecialty('Comptable confirmé Casablanca')).toBe(false);
    });

    it('détecte correctement les villes marocaines', () => {
      expect(detectMoroccanCity('Poste basé à Rabat Agdal')?.cityName).toBe('Rabat');
      expect(detectMoroccanCity('Clinique à Casablanca')?.cityName).toBe('Casablanca');
      expect(detectMoroccanCity('مؤسسة تعليمية في فاس')?.cityName).toBe('Fès');
      expect(detectMoroccanCity('Centre à Marrakech Guéliz')?.cityName).toBe('Marrakech');
      expect(detectMoroccanCity('Cabinet à Salé Tabriquet')?.cityName).toBe('Salé');
    });

    it('génère un contentHash stable et résistant aux variations de casse/espaces', () => {
      const h1 = computeContentHash('Psychologue Scolaire', 'Groupe EDC', 'Rabat');
      const h2 = computeContentHash('  psychologue scolaire  ', 'groupe edc', 'rabat');
      expect(h1).toBe(h2);

      const h3 = computeContentHash('Psychologue Scolaire', 'Autre Organisme', 'Rabat');
      expect(h1).not.toBe(h3);
    });

    it('nettoie le HTML en texte brut', () => {
      const dirty = '<p>Recherche <strong>psychologue</strong> clinicien.<script>alert(1)</script></p>';
      expect(stripHtmlToText(dirty)).toBe('Recherche psychologue clinicien.');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Contrôle d'accès & Workflow de validation administrative
  // ---------------------------------------------------------------------------
  describe('3. Contrôle d\'accès & Workflow de Validation (RBAC)', () => {
    let createdListingId: string;

    it('refuse l\'accès aux routes admin aux utilisateurs non authentifiés (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/external-jobs')
        .expect(401);
    });

    it('refuse l\'accès aux routes admin aux utilisateurs CANDIDATE (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/external-jobs')
        .set('Authorization', `Bearer ${candidateToken}`)
        .expect(403);
    });

    it('autorise SYSTEM_ADMIN à créer une annonce via simulation et la liste au statut PENDING_REVIEW', async () => {
      // Insertion directe d'une annonce de test
      const contentHash = computeContentHash(
        'Psychologue Scolaire Test',
        'École Pilote Test',
        'Rabat',
      );
      const listing = await prisma.externalJobListing.create({
        data: {
          title: 'Psychologue Scolaire Test',
          organizationName: 'École Pilote Test',
          descriptionSummary: 'Missions d\'accompagnement des élèves et bilans cognitifs.',
          cityName: 'Rabat',
          regionCode: 'MA-04',
          contractType: 'CDI',
          category: 'Psychologie scolaire',
          sourceName: 'Dreamjob.ma',
          sourceUrl: 'https://spec-test.example.com/job-1',
          originalApplicationUrl: 'https://spec-test.example.com/job-1',
          status: ExternalJobStatus.PENDING_REVIEW,
          contentHash,
        },
      });
      createdListingId = listing.id;

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/external-jobs?status=PENDING_REVIEW')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      const found = res.body.data.find((item: { id: string; status: ExternalJobStatus }) => item.id === createdListingId);
      expect(found).toBeDefined();
      expect(found.status).toBe(ExternalJobStatus.PENDING_REVIEW);
    });

    it('bloque la consultation publique d\'une annonce PENDING_REVIEW', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/external-jobs/${createdListingId}`)
        .expect(404);
    });

    it('permet à SYSTEM_ADMIN de publier une annonce (PUBLISH) et trace l\'audit log', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/external-jobs/${createdListingId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'PUBLISH',
          cityName: 'Rabat',
        })
        .expect(200);

      expect(res.body.data.status).toBe(ExternalJobStatus.PUBLISHED);

      // Vérification dans AUDIT_LOGS
      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          entityType: 'EXTERNAL_JOB',
          entityId: createdListingId,
          action: 'EXTERNAL_JOB_PUBLISH',
        },
      });
      expect(auditEntry).toBeDefined();
    });

    it('autorise la consultation publique dès que l\'annonce est PUBLISHED', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/external-jobs/${createdListingId}`)
        .expect(200);

      expect(res.body.data.id).toBe(createdListingId);
      expect(res.body.data.status).toBe(ExternalJobStatus.PUBLISHED);
      expect(res.body.data.sourceUrl).toBe('https://spec-test.example.com/job-1');
    });

    it('permet à SYSTEM_ADMIN de marquer une annonce comme expirée (EXPIRE)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/admin/external-jobs/${createdListingId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          action: 'EXPIRE',
        })
        .expect(200);

      expect(res.body.data.status).toBe(ExternalJobStatus.EXPIRED);

      // Masquée immédiatement du catalogue public
      await request(app.getHttpServer())
        .get(`/api/v1/external-jobs/${createdListingId}`)
        .expect(404);
    });
  });
});
