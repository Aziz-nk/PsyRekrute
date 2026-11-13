import {
  BadRequestException,
  ConflictException,
  INestApplication,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import { PrismaModule } from '../../database/prisma.module';
import { PrismaService } from '../../database/prisma.service';
import { AuthModule } from './auth.module';
import { AuthRegistrationService } from './auth-registration.service';
import { RegisterUserDto } from './dto/register-user.dto';
import {
  configureTrustedProxies,
  createExpressTrustProxyValidator,
  extractClientIp,
  extractUserAgent,
  normalizeIpAddress,
} from './ip-extractor.util';
import { PasswordHashService } from './password-hash.service';

describe('M1.2 – Inscription, validation stricte, Argon2id, atomicite et rate-limiting', () => {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://psyrekrute_dev_user@127.0.0.1:5432/psyrekrute_db?schema=public';
  let app: INestApplication;
  let prisma: PrismaClient;
  let registrationService: AuthRegistrationService;
  let passwordHashService: PasswordHashService;
  const createdEmails = new Set<string>();

  const uniqueEmail = (prefix = 'm12') => {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@psyrekrute.ma`;
    createdEmails.add(email.toLowerCase());
    return email;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = dbUrl;
    process.env.TRUSTED_PROXIES = 'loopback';
    process.env.TRUSTED_PROXY_HOPS = '1';

    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTrustedProxies(app);
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    registrationService = moduleFixture.get(AuthRegistrationService);
    passwordHashService = moduleFixture.get(PasswordHashService);
  });

  afterEach(async () => {
    if (createdEmails.size > 0) {
      const emails = Array.from(createdEmails);
      await prisma.user.deleteMany({
        where: { email: { in: emails } },
      });
      createdEmails.clear();
    }
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('1. PasswordHashService – Argon2id (64 MiB, t=3, p=4) et phrases de passe (D7)', () => {
    it('hache en Argon2id avec les parametres valides (m=65536,t=3,p=4) et verifie sans trim', async () => {
      // Phrase de passe de 16 caracteres avec espaces aux extremites et Unicode, sans chiffre ni symbole
      const passphrase = '  salam maroc   ';
      const hash = await passwordHashService.hash(passphrase);

      expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
      expect(hash).not.toContain(passphrase.trim());

      expect(await passwordHashService.verify(hash, passphrase)).toBe(true);
      // Prouve qu'aucun trim() n'a ete applique au mot de passe
      expect(await passwordHashService.verify(hash, passphrase.trim())).toBe(
        false,
      );
      expect(await passwordHashService.verify('invalid-hash', passphrase)).toBe(
        false,
      );
      expect(await passwordHashService.verify(hash, '')).toBe(false);
    });

    it('accepte exactement 12 et 128 caracteres, et refuse < 12, > 128 ou non-string', async () => {
      const min12 = 'a'.repeat(12);
      const max128 = 'b'.repeat(128);

      const h12 = await passwordHashService.hash(min12);
      const h128 = await passwordHashService.hash(max128);
      expect(await passwordHashService.verify(h12, min12)).toBe(true);
      expect(await passwordHashService.verify(h128, max128)).toBe(true);

      await expect(passwordHashService.hash('a'.repeat(11))).rejects.toThrow(
        BadRequestException,
      );
      await expect(passwordHashService.hash('a'.repeat(129))).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        passwordHashService.hash(null as unknown as string),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Inscription nominale, absence de token/session/hash et absence de fuite dans les logs', () => {
    it('inscrit un CANDIDATE et un ORGANIZATION_USER (201 Created), stocke USER + 2 CONSENTS + AUDIT_LOG, sans session ni JWT ni fuite dans les logs', async () => {
      const logMessages: string[] = [];
      const spyLog = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation((msg: unknown) => {
          logMessages.push(String(msg));
        });
      const spyError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation((msg: unknown) => {
          logMessages.push(String(msg));
        });

      try {
        const emailCand = uniqueEmail('cand');
        const secretPass = 'phrase secrète candidat psyrekrute';

        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .set('X-Forwarded-For', '196.200.10.1')
          .set('User-Agent', 'PsyRekruteTest/1.0')
          .send({
            email: emailCand,
            password: secretPass,
            globalRole: 'CANDIDATE',
            preferredLocale: 'ar',
            termsAccepted: true,
          })
          .expect(201);

        expect(res.body).toEqual({
          statusCode: 201,
          message: 'User registered successfully',
          data: {
            userId: expect.any(String),
            email: emailCand,
            globalRole: 'CANDIDATE',
            preferredLocale: 'ar',
          },
        });

        // Verification de l'absence de hash et de token dans la reponse et les cookies
        const rawBody = JSON.stringify(res.body);
        expect(rawBody).not.toContain('password');
        expect(rawBody).not.toContain('passwordHash');
        expect(rawBody).not.toContain('$argon2id$');
        expect(rawBody).not.toContain('accessToken');
        expect(rawBody).not.toContain('refreshToken');
        expect(res.headers['set-cookie']).toBeUndefined();

        // Verification en base PostgreSQL reelle
        const dbUser = await prisma.user.findUniqueOrThrow({
          where: { id: res.body.data.userId },
          include: { consents: true, auditLogs: true, sessions: true },
        });

        expect(dbUser.isEmailVerified).toBe(false); // D8 : pas de faux email
        expect(dbUser.isActive).toBe(true);
        expect(dbUser.passwordHash).toMatch(
          /^\$argon2id\$v=19\$m=65536,t=3,p=4\$/,
        );
        expect(dbUser.sessions).toHaveLength(0); // M1.2 : aucune session ouverte

        // Exactement les 2 consentements obligatoires, AUCUN TALENT_POOL_MATCHING
        expect(dbUser.consents).toHaveLength(2);
        const consentTypes = dbUser.consents.map((c) => c.consentType).sort();
        expect(consentTypes).toEqual(['PRIVACY_POLICY', 'TERMS_OF_SERVICE']);
        expect(dbUser.consents.every((c) => c.hasConsented === true)).toBe(
          true,
        );
        expect(
          dbUser.consents.every((c) => c.ipAddress === '196.200.10.1'),
        ).toBe(true);

        // AuditLog cree avec IP et sans mot de passe ni hash
        expect(dbUser.auditLogs).toHaveLength(1);
        expect(dbUser.auditLogs[0].action).toBe('USER_REGISTERED');
        expect(dbUser.auditLogs[0].ipAddress).toBe('196.200.10.1');
        expect(JSON.stringify(dbUser.auditLogs[0])).not.toContain(secretPass);
        expect(JSON.stringify(dbUser.auditLogs[0])).not.toContain('$argon2id$');

        // Verification de l'absence de mot de passe et de hash dans les logs applicatifs
        const combinedLogs = logMessages.join(' ');
        expect(combinedLogs).not.toContain(secretPass);
        expect(combinedLogs).not.toContain('$argon2id$');

        // Inscription d'un ORGANIZATION_USER avec locale par defaut ('fr')
        const emailOrg = uniqueEmail('org');
        const resOrg = await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .set('X-Forwarded-For', '196.200.10.2')
          .send({
            email: emailOrg,
            password: 'une autre phrase de passe valide',
            globalRole: 'ORGANIZATION_USER',
            termsAccepted: true,
          })
          .expect(201);

        expect(resOrg.body.data.globalRole).toBe('ORGANIZATION_USER');
        expect(resOrg.body.data.preferredLocale).toBe('fr');
      } finally {
        spyLog.mockRestore();
        spyError.mockRestore();
      }
    });
  });

  describe('3. Restriction des roles (D2), validation DTO et injection de champs non declares', () => {
    it('rejette SYSTEM_ADMIN (400 Bad Request) via HTTP et via appel direct au service', async () => {
      const emailAdmin = uniqueEmail('sysadmin');

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', '196.200.20.1')
        .send({
          email: emailAdmin,
          password: 'tentative creation admin illegitime',
          globalRole: 'SYSTEM_ADMIN',
          termsAccepted: true,
        })
        .expect(400);

      await expect(
        registrationService.register(
          {
            email: emailAdmin,
            password: 'tentative creation admin illegitime',
            globalRole: 'SYSTEM_ADMIN' as unknown as 'CANDIDATE',
            termsAccepted: true,
          },
          { ipAddress: '127.0.0.1', userAgent: 'Jest' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      const countInDb = await prisma.user.count({
        where: { email: emailAdmin },
      });
      expect(countInDb).toBe(0);
    });

    it('rejette termsAccepted=false, mot de passe hors bornes (11 ou 129 car.) et champs injectes non declares (HTTP 400)', async () => {
      const email = uniqueEmail('invalid');

      // termsAccepted = false
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', '196.200.20.2')
        .send({
          email,
          password: 'phrase de passe valide 12+',
          globalRole: 'CANDIDATE',
          termsAccepted: false,
        })
        .expect(400);

      // Mot de passe de 11 caracteres
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', '196.200.20.3')
        .send({
          email,
          password: '12345678901',
          globalRole: 'CANDIDATE',
          termsAccepted: true,
        })
        .expect(400);

      // Mot de passe de 129 caracteres
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', '196.200.20.4')
        .send({
          email,
          password: 'x'.repeat(129),
          globalRole: 'CANDIDATE',
          termsAccepted: true,
        })
        .expect(400);

      // Injection de champs supplementaires non declares (isEmailVerified, isActive, isAdmin)
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', '196.200.20.5')
        .send({
          email,
          password: 'phrase de passe valide 12+',
          globalRole: 'CANDIDATE',
          termsAccepted: true,
          isEmailVerified: true,
          isAdmin: true,
        })
        .expect(400);

      expect(await prisma.user.count({ where: { email } })).toBe(0);
    });

    it('valide les gardes defensives directes du service (email invalide, termsAccepted != true)', async () => {
      await expect(
        registrationService.register(
          {
            email: '   ',
            password: 'phrase de passe valide',
            globalRole: 'CANDIDATE',
            termsAccepted: true,
          } as RegisterUserDto,
          { ipAddress: '127.0.0.1', userAgent: 'Jest' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        registrationService.register(
          {
            email: 'not-an-email',
            password: 'phrase de passe valide',
            globalRole: 'CANDIDATE',
            termsAccepted: true,
          } as RegisterUserDto,
          { ipAddress: '127.0.0.1', userAgent: 'Jest' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        registrationService.register(
          {
            email: 'valid@example.ma',
            password: 'phrase de passe valide',
            globalRole: 'CANDIDATE',
            termsAccepted: false,
          } as RegisterUserDto,
          { ipAddress: '127.0.0.1', userAgent: 'Jest' },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('4. Normalisation d e-mail (casses differentes) et inscriptions CONCURRENTES (PostgreSQL)', () => {
    it('deux inscriptions avec des casses et espaces differents : un seul utilisateur en base (409 Conflict sur la 2e)', async () => {
      const baseEmail = uniqueEmail('CaseCheck');
      const mixedCaseWithSpaces = `  ${baseEmail.toUpperCase()}  `;

      const first = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', '196.200.30.1')
        .send({
          email: mixedCaseWithSpaces,
          password: 'phrase de passe valide 12+',
          globalRole: 'CANDIDATE',
          termsAccepted: true,
        })
        .expect(201);

      expect(first.body.data.email).toBe(baseEmail.toLowerCase());

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', '196.200.30.2')
        .send({
          email: baseEmail.toLowerCase(),
          password: 'autre phrase de passe valide',
          globalRole: 'CANDIDATE',
          termsAccepted: true,
        })
        .expect(409);

      const usersInDb = await prisma.user.findMany({
        where: { email: baseEmail.toLowerCase() },
      });
      expect(usersInDb).toHaveLength(1);
    });

    it('deux inscriptions CONCURRENTES avec le meme e-mail : un seul utilisateur cree et un ConflictException', async () => {
      const raceEmail = uniqueEmail('race');
      const dto: RegisterUserDto = {
        email: raceEmail,
        password: 'phrase de passe concurrente 12+',
        globalRole: 'CANDIDATE',
        preferredLocale: 'fr',
        termsAccepted: true,
      };

      const outcomes = await Promise.allSettled([
        registrationService.register(dto, {
          ipAddress: '196.200.31.1',
          userAgent: 'Race/1',
        }),
        registrationService.register(dto, {
          ipAddress: '196.200.31.2',
          userAgent: 'Race/2',
        }),
      ]);

      const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
      const failed = outcomes.filter(
        (o): o is PromiseRejectedResult => o.status === 'rejected',
      );

      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0].reason).toBeInstanceOf(ConflictException);

      const users = await prisma.user.findMany({
        where: { email: raceEmail },
        include: { consents: true, auditLogs: true },
      });
      expect(users).toHaveLength(1);
      expect(users[0].consents).toHaveLength(2);
      expect(users[0].auditLogs).toHaveLength(1);
    });

    it('transforme uniquement un conflit P2002 sur email en 409 Conflict et propage tel quel un conflit P2002 non lie a email', async () => {
      const prismaService = app.get(PrismaService);

      // Cas 1 : P2002 ciblant explicitement email (ou users_email_lower_key) -> ConflictException (409)
      const txSpyEmail = jest
        .spyOn(prismaService, '$transaction')
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed on the fields: (`email`)',
            {
              code: 'P2002',
              clientVersion: '5.14.0',
              meta: { target: ['email'] },
            },
          ),
        )
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed on the constraint: `users_email_lower_key`',
            {
              code: 'P2002',
              clientVersion: '5.14.0',
              meta: { target: 'users_email_lower_key' },
            },
          ),
        );

      try {
        await expect(
          registrationService.register(
            {
              email: uniqueEmail('p2002-email-arr'),
              password: 'phrase de passe p2002 email',
              globalRole: 'CANDIDATE',
              termsAccepted: true,
            },
            { ipAddress: '127.0.0.1', userAgent: 'Jest' },
          ),
        ).rejects.toBeInstanceOf(ConflictException);

        await expect(
          registrationService.register(
            {
              email: uniqueEmail('p2002-email-str'),
              password: 'phrase de passe p2002 email',
              globalRole: 'CANDIDATE',
              termsAccepted: true,
            },
            { ipAddress: '127.0.0.1', userAgent: 'Jest' },
          ),
        ).rejects.toBeInstanceOf(ConflictException);
      } finally {
        txSpyEmail.mockRestore();
      }

      // Cas 2 : P2002 sur un autre champ (ex: id / users_pkey) ou autre code Prisma -> propage sans devenir ConflictException
      const nonEmailUniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`id`)',
        {
          code: 'P2002',
          clientVersion: '5.14.0',
          meta: { target: ['id'] },
        },
      );
      const nonEmailStringTargetError =
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the constraint: `users_pkey`',
          {
            code: 'P2002',
            clientVersion: '5.14.0',
            meta: { target: 'users_pkey' },
          },
        );
      const otherPrismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        {
          code: 'P2003',
          clientVersion: '5.14.0',
        },
      );

      const txSpyOther = jest
        .spyOn(prismaService, '$transaction')
        .mockRejectedValueOnce(nonEmailUniqueError)
        .mockRejectedValueOnce(nonEmailStringTargetError)
        .mockRejectedValueOnce(otherPrismaError);

      try {
        await expect(
          registrationService.register(
            {
              email: uniqueEmail('p2002-id'),
              password: 'phrase de passe p2002 id',
              globalRole: 'CANDIDATE',
              termsAccepted: true,
            },
            { ipAddress: '127.0.0.1', userAgent: 'Jest' },
          ),
        ).rejects.toBe(nonEmailUniqueError);

        await expect(
          registrationService.register(
            {
              email: uniqueEmail('p2002-pkey'),
              password: 'phrase de passe p2002 pkey',
              globalRole: 'CANDIDATE',
              termsAccepted: true,
            },
            { ipAddress: '127.0.0.1', userAgent: 'Jest' },
          ),
        ).rejects.toBe(nonEmailStringTargetError);

        await expect(
          registrationService.register(
            {
              email: uniqueEmail('p2003-fk'),
              password: 'phrase de passe p2003 fk',
              globalRole: 'CANDIDATE',
              termsAccepted: true,
            },
            { ipAddress: '127.0.0.1', userAgent: 'Jest' },
          ),
        ).rejects.toBe(otherPrismaError);
      } finally {
        txSpyOther.mockRestore();
      }
    });
  });

  describe('5. Atomicite transactionnelle : rollback complet sur echec de Consent ou d AuditLog (PostgreSQL reel)', () => {
    it('echec de creation d un consentement : rollback complet dans PostgreSQL (0 User, 0 Consent, 0 AuditLog)', async () => {
      const rollbackEmail = uniqueEmail('rollback-consent');

      // On intercepte prisma.$transaction pour injecter un echec sur la 2e creation de consentement
      // tout en executant une VRAIE transaction PostgreSQL contre `prisma`
      const prismaService = app.get(PrismaService);
      const origTx = prismaService.$transaction.bind(prismaService);
      const txSpy = jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation((async (fn: (tx: PrismaClient) => Promise<unknown>) => {
          return origTx(async (realTx) => {
            let consentCallCount = 0;
            const origConsentCreate = realTx.consent.create.bind(realTx.consent);
            const proxiedTx = Object.create(realTx) as PrismaClient;
            Object.defineProperty(proxiedTx, 'consent', {
              value: {
                ...realTx.consent,
                create: async (args: Parameters<typeof origConsentCreate>[0]) => {
                  consentCallCount += 1;
                  if (consentCallCount === 2) {
                    throw new Error('Simulated database failure on second consent');
                  }
                  return origConsentCreate(args);
                },
              },
            });
            return fn(proxiedTx);
          });
        }) as unknown as typeof prismaService.$transaction);

      try {
        await expect(
          registrationService.register(
            {
              email: rollbackEmail,
              password: 'phrase de passe rollback consent',
              globalRole: 'CANDIDATE',
              preferredLocale: 'fr',
              termsAccepted: true,
            },
            { ipAddress: '196.200.40.1', userAgent: 'RollbackTest/Consent' },
          ),
        ).rejects.toThrow(/Simulated database failure on second consent/);

        // Verification dans PostgreSQL reel : ni l'utilisateur ni le 1er consentement n'existent
        const userAfterRollback = await prisma.user.findUnique({
          where: { email: rollbackEmail },
        });
        const consentsAfterRollback = await prisma.consent.count({
          where: { ipAddress: '196.200.40.1' },
        });
        expect(userAfterRollback).toBeNull();
        expect(consentsAfterRollback).toBe(0);
      } finally {
        txSpy.mockRestore();
      }
    });

    it('echec de creation d audit : rollback complet dans PostgreSQL (0 User, 0 Consent, 0 AuditLog)', async () => {
      const rollbackEmail = uniqueEmail('rollback-audit');

      const prismaService = app.get(PrismaService);
      const origTx = prismaService.$transaction.bind(prismaService);
      const txSpy = jest
        .spyOn(prismaService, '$transaction')
        .mockImplementation((async (fn: (tx: PrismaClient) => Promise<unknown>) => {
          return origTx(async (realTx) => {
            const proxiedTx = Object.create(realTx) as PrismaClient;
            Object.defineProperty(proxiedTx, 'auditLog', {
              value: {
                ...realTx.auditLog,
                create: async () => {
                  throw new Error('Simulated database failure on audit log');
                },
              },
            });
            return fn(proxiedTx);
          });
        }) as unknown as typeof prismaService.$transaction);

      try {
        await expect(
          registrationService.register(
            {
              email: rollbackEmail,
              password: 'phrase de passe rollback audit',
              globalRole: 'ORGANIZATION_USER',
              preferredLocale: 'en',
              termsAccepted: true,
            },
            { ipAddress: '196.200.40.2', userAgent: 'RollbackTest/Audit' },
          ),
        ).rejects.toThrow(/Simulated database failure on audit log/);

        // Verification dans PostgreSQL reel : l'utilisateur et les 2 consentements ont ete annules
        const userAfterRollback = await prisma.user.findUnique({
          where: { email: rollbackEmail },
        });
        const consentsAfterRollback = await prisma.consent.count({
          where: { ipAddress: '196.200.40.2' },
        });
        expect(userAfterRollback).toBeNull();
        expect(consentsAfterRollback).toBe(0);
      } finally {
        txSpy.mockRestore();
      }
    });
  });

  describe('6. Securite Proxy, Anti-Spoofing X-Forwarded-For et Rate-Limiting (5 requetes / minute / IP)', () => {
    it('valide createExpressTrustProxyValidator, normalizeIpAddress et extractClientIp (sans jamais lire X-Forwarded-For directement)', () => {
      // extractClientIp utilise exclusivement req.ip (resolu par Express) ou req.socket.remoteAddress
      const fakeReq = {
        headers: {
          'x-forwarded-for': '198.51.100.99, 41.140.10.25',
          'user-agent': 'Mozilla/5.0',
        },
        ip: '::ffff:41.140.10.25',
      };

      expect(extractClientIp(fakeReq)).toBe('41.140.10.25');
      expect(
        extractClientIp({
          socket: { remoteAddress: '::ffff:127.0.0.1' },
        } as unknown as Parameters<typeof extractClientIp>[0]),
      ).toBe('127.0.0.1');
      expect(extractClientIp(undefined)).toBe('0.0.0.0');
      expect(normalizeIpAddress('')).toBe('0.0.0.0');
      expect(normalizeIpAddress(undefined)).toBe('0.0.0.0');
      expect(extractUserAgent(fakeReq)).toBe('Mozilla/5.0');
      expect(extractUserAgent(undefined)).toBe('unknown');

      // Refus strict des configurations aveugles ('true', '*', 'all') ou vides
      expect(createExpressTrustProxyValidator(undefined)).toBe(false);
      expect(createExpressTrustProxyValidator('')).toBe(false);
      expect(createExpressTrustProxyValidator('false')).toBe(false);
      expect(createExpressTrustProxyValidator('true')).toBe(false);
      expect(createExpressTrustProxyValidator('*')).toBe(false);
      expect(createExpressTrustProxyValidator('all')).toBe(false);
      expect(createExpressTrustProxyValidator('invalid-token')).toBe(false);

      // Validateur explicite multi-regles (loopback, uniquelocal, linklocal, CIDR IPv4/IPv6, IP directe)
      const validator = createExpressTrustProxyValidator(
        'loopback, uniquelocal, linklocal, 203.0.113.0/24, 2001:db8::/32, 198.51.100.10, ::1',
        1,
      );
      expect(typeof validator).toBe('function');
      if (typeof validator === 'function') {
        expect(validator('::ffff:127.0.0.1', 0)).toBe(true);
        expect(validator('10.0.0.5', 0)).toBe(true);
        expect(validator('169.254.1.1', 0)).toBe(true);
        expect(validator('203.0.113.42', 0)).toBe(true);
        expect(validator('2001:db8::1', 0)).toBe(true);
        expect(validator('198.51.100.10', 0)).toBe(true);
        expect(validator('41.140.10.25', 0)).toBe(false);
        expect(validator('not-an-ip', 0)).toBe(false);
        // Au-dela de maxHops = 1 (hopIndex >= 1), meme une IP loopback est refusee
        expect(validator('127.0.0.1', 1)).toBe(false);
      }
    });

    it('bloque la 6e tentative depuis la meme IP cliente derriere un reverse proxy de confiance (429 Too Many Requests) sans bloquer une autre IP', async () => {
      const throttledIp = '41.140.99.99';
      const otherClientIp = '41.140.99.100';

      for (let i = 1; i <= 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .set('X-Forwarded-For', throttledIp)
          .send({
            email: uniqueEmail(`rl-${i}`),
            password: 'phrase de passe rate limit test',
            globalRole: 'CANDIDATE',
            termsAccepted: true,
          })
          .expect(201);
      }

      // 6e requete depuis la meme IP dans la fenetre d'1 minute -> 429 Too Many Requests
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', throttledIp)
        .send({
          email: uniqueEmail('rl-6'),
          password: 'phrase de passe rate limit test',
          globalRole: 'CANDIDATE',
          termsAccepted: true,
        })
        .expect(429);

      // Une autre IP cliente derriere le meme proxy n'est pas affectee -> 201 Created
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set('X-Forwarded-For', otherClientIp)
        .send({
          email: uniqueEmail('rl-other-ip'),
          password: 'phrase de passe rate limit test',
          globalRole: 'CANDIDATE',
          termsAccepted: true,
        })
        .expect(201);
    });

    it('ANTI-SPOOFING X-Forwarded-For : un client envoyant des IPs falsifiees a gauche ne peut ni contourner le rate-limiting ni falsifier CONSENTS et AUDIT_LOGS', async () => {
      // Le reverse proxy de confiance (loopback) ajoute la vraie IP du client A DROITE :
      // X-Forwarded-For: <ip-forgee-par-le-client>, <vraie-ip-du-client>
      const realAttackerIp = '41.140.88.77';

      for (let i = 1; i <= 5; i++) {
        const spoofedLeftIp = `198.51.100.${i}`;
        const email = uniqueEmail(`antispoof-${i}`);

        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .set('X-Forwarded-For', `${spoofedLeftIp}, ${realAttackerIp}`)
          .send({
            email,
            password: 'phrase de passe anti spoofing test',
            globalRole: 'CANDIDATE',
            termsAccepted: true,
          })
          .expect(201);

        // Verification en base PostgreSQL : CONSENTS et AUDIT_LOGS enregistrent la vraie IP resolue (droite)
        // et jamais l'IP falsifiee par le client (gauche)
        const dbUser = await prisma.user.findUniqueOrThrow({
          where: { id: res.body.data.userId },
          include: { consents: true, auditLogs: true },
        });

        expect(
          dbUser.consents.every((c) => c.ipAddress === realAttackerIp),
        ).toBe(true);
        expect(
          dbUser.consents.some((c) => c.ipAddress === spoofedLeftIp),
        ).toBe(false);
        expect(dbUser.auditLogs[0].ipAddress).toBe(realAttackerIp);
      }

      // 6e tentative avec une nouvelle IP falsifiee ET meme une IP de proxy injectee dans la chaine :
      // X-Forwarded-For: 203.0.113.250, 127.0.0.1, 41.140.88.77 -> BLOQUEE en 429 Too Many Requests
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .set(
          'X-Forwarded-For',
          `203.0.113.250, 127.0.0.1, ${realAttackerIp}`,
        )
        .send({
          email: uniqueEmail('antispoof-6'),
          password: 'phrase de passe anti spoofing test',
          globalRole: 'CANDIDATE',
          termsAccepted: true,
        })
        .expect(429);
    });

    it('sans proxy de confiance configure (TRUSTED_PROXIES desactive), ignore tout X-Forwarded-For et utilise l IP directe de la connexion', async () => {
      configureTrustedProxies(app, 'false');
      try {
        const email = uniqueEmail('no-proxy-direct');
        const spoofedHeader = '203.0.113.199';

        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .set('X-Forwarded-For', spoofedHeader)
          .send({
            email,
            password: 'phrase de passe connexion directe',
            globalRole: 'CANDIDATE',
            termsAccepted: true,
          })
          .expect(201);

        const dbUser = await prisma.user.findUniqueOrThrow({
          where: { id: res.body.data.userId },
          include: { consents: true, auditLogs: true },
        });

        // L'IP enregistree est l'adresse directe loopback de la socket (127.0.0.1 ou ::1), jamais 203.0.113.199
        expect(dbUser.auditLogs[0].ipAddress).not.toBe(spoofedHeader);
        expect(['127.0.0.1', '::1']).toContain(dbUser.auditLogs[0].ipAddress);
        expect(
          dbUser.consents.every(
            (c) => c.ipAddress === dbUser.auditLogs[0].ipAddress,
          ),
        ).toBe(true);
      } finally {
        configureTrustedProxies(app, 'loopback', 1);
      }
    });
  });
});
