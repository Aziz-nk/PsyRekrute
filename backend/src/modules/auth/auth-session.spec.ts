import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient, SessionRevocationReason } from '@prisma/client';
import * as request from 'supertest';
import { PrismaModule } from '../../database/prisma.module';
import { AuthModule } from './auth.module';
import { AuthRegistrationService } from './auth-registration.service';
import { configureTrustedProxies } from './ip-extractor.util';
import { ACCESS_TOKEN_TTL_SECONDS, getJwtAccessSecret } from './jwt-auth.guard';
import {
  buildRefreshCookieOptions,
  extractRefreshTokenFromRequest,
  REFRESH_TOKEN_COOKIE_NAME,
} from './refresh-cookie.util';
import { UserSessionsService } from './user-sessions.service';

describe('M1.3 – Login, JWT HS256 (15m), Cookie Refresh HttpOnly, Rotation, Logout, Logout-All et /auth/me', () => {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://psyrekrute_dev_user@127.0.0.1:5432/psyrekrute_db?schema=public';
  let app: INestApplication;
  let prisma: PrismaClient;
  let registrationService: AuthRegistrationService;
  let userSessionsService: UserSessionsService;
  let jwtService: JwtService;
  const createdEmails = new Set<string>();

  const uniqueEmail = (prefix = 'm13') => {
    const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@psyrekrute.ma`;
    createdEmails.add(email.toLowerCase());
    return email;
  };

  const extractCookieHeaderValue = (
    setCookieHeader: string | string[] | undefined,
  ): { rawCookiePair: string; tokenValue: string; fullDirective: string } => {
    const list = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : setCookieHeader
        ? [setCookieHeader]
        : [];
    const match = list.find((c) =>
      c.startsWith(`${REFRESH_TOKEN_COOKIE_NAME}=`),
    );
    if (!match) {
      return { rawCookiePair: '', tokenValue: '', fullDirective: '' };
    }
    const rawCookiePair = match.split(';')[0];
    const tokenValue = decodeURIComponent(
      rawCookiePair.slice(`${REFRESH_TOKEN_COOKIE_NAME}=`.length),
    );
    return { rawCookiePair, tokenValue, fullDirective: match };
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
    userSessionsService = moduleFixture.get(UserSessionsService);
    jwtService = moduleFixture.get(JwtService);
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

  describe('1. Login valide et invalide (POST /api/v1/auth/login)', () => {
    it('connecte un utilisateur valide, retourne un JWT HS256 de 15 min et depose le refresh token en cookie HttpOnly', async () => {
      const email = uniqueEmail('login-ok');
      const password = 'phrase secrète login m13 valide';

      const reg = await registrationService.register(
        {
          email,
          password,
          globalRole: 'CANDIDATE',
          preferredLocale: 'fr',
          termsAccepted: true,
        },
        { ipAddress: '196.200.50.1', userAgent: 'Jest/Setup' },
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '196.200.50.2')
        .set('User-Agent', 'Mozilla/5.0 LoginTest')
        .send({ email: `  ${email.toUpperCase()}  `, password })
        .expect(200);

      expect(res.body).toEqual({
        statusCode: 200,
        message: 'Login successful',
        data: {
          accessToken: expect.any(String),
          tokenType: 'Bearer',
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          user: {
            userId: reg.userId,
            email,
            globalRole: 'CANDIDATE',
            preferredLocale: 'fr',
            isEmailVerified: false,
          },
        },
      });

      // Verification de l'en-tete JWT (alg = HS256, duree = 900s)
      const tokenParts = (res.body.data.accessToken as string).split('.');
      expect(tokenParts).toHaveLength(3);
      const header = JSON.parse(
        Buffer.from(tokenParts[0], 'base64url').toString('utf8'),
      ) as { alg: string; typ: string };
      expect(header.alg).toBe('HS256');

      const decoded = await jwtService.verifyAsync<{
        sub: string;
        email: string;
        globalRole: string;
        iat: number;
        exp: number;
      }>(res.body.data.accessToken, {
        secret: getJwtAccessSecret(),
        algorithms: ['HS256'],
      });
      expect(decoded.sub).toBe(reg.userId);
      expect(decoded.exp - decoded.iat).toBe(900);

      // Verification du cookie HttpOnly (aucun refresh token dans le body JSON)
      expect(JSON.stringify(res.body)).not.toContain('refreshToken');
      const cookieInfo = extractCookieHeaderValue(res.headers['set-cookie']);
      expect(cookieInfo.tokenValue.length).toBeGreaterThanOrEqual(32);
      expect(cookieInfo.fullDirective).toContain('HttpOnly');
      expect(cookieInfo.fullDirective).toContain('Path=/api/v1/auth');
      expect(cookieInfo.fullDirective).toMatch(/SameSite=Lax/i);

      // Verification en base PostgreSQL : lastLoginAt mis a jour, session hachee SHA-256, AuditLog cree
      const dbUser = await prisma.user.findUniqueOrThrow({
        where: { id: reg.userId },
        include: { sessions: true, auditLogs: true },
      });
      expect(dbUser.lastLoginAt).not.toBeNull();
      expect(dbUser.sessions).toHaveLength(1);
      expect(dbUser.sessions[0].tokenHash).not.toBe(cookieInfo.tokenValue);
      expect(dbUser.sessions[0].tokenHash).toBe(
        userSessionsService.hashRefreshToken(cookieInfo.tokenValue),
      );
      expect(
        dbUser.auditLogs.some((a) => a.action === 'USER_LOGIN_SUCCESS'),
      ).toBe(true);
    });

    it('rejette un mauvais mot de passe (401), un email inexistant (401) et un compte inactif (403)', async () => {
      const email = uniqueEmail('login-fail');
      const password = 'mot de passe correct 12+';

      const reg = await registrationService.register(
        {
          email,
          password,
          globalRole: 'ORGANIZATION_USER',
          termsAccepted: true,
        },
        { ipAddress: '196.200.51.1', userAgent: 'Jest' },
      );

      // Mauvais mot de passe -> 401
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '196.200.51.2')
        .send({ email, password: 'mauvais mot de passe 12+' })
        .expect(401);

      // Email inexistant -> 401 (avec verification timing Argon2id factice)
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '196.200.51.3')
        .send({
          email: 'inexistant@psyrekrute.ma',
          password: 'mauvais mot de passe 12+',
        })
        .expect(401);

      // Compte desactive -> 403 Forbidden
      await prisma.user.update({
        where: { id: reg.userId },
        data: { isActive: false },
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '196.200.51.4')
        .send({ email, password })
        .expect(403);

      const sessionsCount = await prisma.userSession.count({
        where: { userId: reg.userId },
      });
      expect(sessionsCount).toBe(0);
    });

    it('configure les options du cookie Secure en production et extrait proprement les cookies', () => {
      expect(buildRefreshCookieOptions(true).secure).toBe(true);
      expect(buildRefreshCookieOptions(false).secure).toBe(false);
      expect(buildRefreshCookieOptions(true).httpOnly).toBe(true);
      expect(buildRefreshCookieOptions(true).sameSite).toBe('lax');

      expect(extractRefreshTokenFromRequest(undefined)).toBeNull();
      expect(
        extractRefreshTokenFromRequest({ headers: { cookie: 'other=123' } }),
      ).toBeNull();
      expect(
        extractRefreshTokenFromRequest({
          headers: { cookie: `${REFRESH_TOKEN_COOKIE_NAME}=` },
        }),
      ).toBeNull();
      expect(
        extractRefreshTokenFromRequest({
          headers: {
            cookie: `foo=bar; ${REFRESH_TOKEN_COOKIE_NAME}=abc%2B123`,
          },
        }),
      ).toBe('abc+123');
    });
  });

  describe('2. Recuperation du profil (/api/v1/auth/me) avec JWT valide et invalide', () => {
    it('retourne le profil avec un JWT valide (200) et refuse un JWT absent, invalide ou appartenant a un compte desactive (401)', async () => {
      const email = uniqueEmail('me-check');
      const password = 'phrase de passe me endpoint';

      const reg = await registrationService.register(
        {
          email,
          password,
          globalRole: 'CANDIDATE',
          preferredLocale: 'ar',
          termsAccepted: true,
        },
        { ipAddress: '196.200.52.1', userAgent: 'Jest' },
      );

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '196.200.52.1')
        .send({ email, password })
        .expect(200);

      const accessToken = loginRes.body.data.accessToken as string;

      // 1) Acces valide a /api/v1/auth/me
      const meRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(meRes.body).toEqual({
        statusCode: 200,
        data: {
          userId: reg.userId,
          email,
          globalRole: 'CANDIDATE',
          preferredLocale: 'ar',
          isEmailVerified: false,
          isActive: true,
          lastLoginAt: expect.any(String),
          createdAt: expect.any(String),
        },
      });
      expect(JSON.stringify(meRes.body)).not.toContain('passwordHash');

      // 2) Sans en-tete Authorization -> 401
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);

      // 3) En-tete non Bearer -> 401
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .expect(401);

      // 4) JWT altere / invalide -> 401
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}tampered`)
        .expect(401);

      // 5) JWT expire -> 401
      const expiredJwt = await jwtService.signAsync(
        {
          sub: reg.userId,
          email,
          globalRole: 'CANDIDATE',
          preferredLocale: 'ar',
        },
        {
          algorithm: 'HS256',
          secret: getJwtAccessSecret(),
          expiresIn: -10,
        },
      );
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredJwt}`)
        .expect(401);

      // 6) Compte desactive apres emission du JWT -> 401
      await prisma.user.update({
        where: { id: reg.userId },
        data: { isActive: false },
      });
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('3. Refresh token : rotation valide, detection de reutilisation et expiration (POST /api/v1/auth/refresh)', () => {
    it('effectue la rotation du refresh token, et revoque toutes les sessions en cas de reutilisation de l ancien token', async () => {
      const email = uniqueEmail('refresh-rotate');
      const password = 'phrase de passe rotation m13';

      const reg = await registrationService.register(
        {
          email,
          password,
          globalRole: 'CANDIDATE',
          termsAccepted: true,
        },
        { ipAddress: '196.200.53.1', userAgent: 'Jest' },
      );

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '196.200.53.1')
        .send({ email, password })
        .expect(200);

      const cookie1 = extractCookieHeaderValue(loginRes.headers['set-cookie']);
      expect(cookie1.rawCookiePair).toBeTruthy();

      // Rotation valide avec cookie1 -> 200 OK + nouveau cookie2 + nouveau accessToken
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('X-Forwarded-For', '196.200.53.1')
        .set('Cookie', cookie1.rawCookiePair)
        .expect(200);

      expect(refreshRes.body.data.accessToken).toEqual(expect.any(String));
      const cookie2 = extractCookieHeaderValue(
        refreshRes.headers['set-cookie'],
      );
      expect(cookie2.tokenValue).not.toBe(cookie1.tokenValue);

      // Reutilisation frauduleuse de l'ancien cookie1 -> 401 + revocation globale (REUSE_DETECTED)
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('X-Forwarded-For', '196.200.53.2')
        .set('Cookie', cookie1.rawCookiePair)
        .expect(401);

      // Meme le cookie2 (pourtant plus recent) est maintenant revoque -> 401
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('X-Forwarded-For', '196.200.53.1')
        .set('Cookie', cookie2.rawCookiePair)
        .expect(401);

      const activeSessions = await prisma.userSession.count({
        where: { userId: reg.userId, revokedAt: null },
      });
      expect(activeSessions).toBe(0);
    });

    it('refuse un refresh sans cookie (401) ou avec un refresh token expire (401)', async () => {
      // Sans cookie -> 401
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .expect(401);

      // Avec une session expiree en base -> 401
      const email = uniqueEmail('refresh-expired');
      const reg = await registrationService.register(
        {
          email,
          password: 'phrase de passe expiree m13',
          globalRole: 'CANDIDATE',
          termsAccepted: true,
        },
        { ipAddress: '196.200.54.1', userAgent: 'Jest' },
      );

      const expiredSession = await userSessionsService.createSession({
        userId: reg.userId,
        ipAddress: '196.200.54.1',
        userAgent: 'Jest',
        ttlSeconds: -60, // deja expiree
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set(
          'Cookie',
          `${REFRESH_TOKEN_COOKIE_NAME}=${encodeURIComponent(expiredSession.rawRefreshToken)}`,
        )
        .expect(401);
    });
  });

  describe('4. Logout unitaire (POST /api/v1/auth/logout) et Logout-All (POST /api/v1/auth/logout-all)', () => {
    it('revoque la session courante lors du logout et efface le cookie HttpOnly', async () => {
      const email = uniqueEmail('logout-one');
      const password = 'phrase de passe logout unitaire';

      const reg = await registrationService.register(
        {
          email,
          password,
          globalRole: 'CANDIDATE',
          termsAccepted: true,
        },
        { ipAddress: '196.200.55.1', userAgent: 'Jest' },
      );

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '196.200.55.1')
        .send({ email, password })
        .expect(200);

      const cookie = extractCookieHeaderValue(loginRes.headers['set-cookie']);

      const logoutRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie.rawCookiePair)
        .expect(200);

      expect(logoutRes.body).toEqual({
        statusCode: 200,
        message: 'Logged out successfully',
        data: { revoked: true },
      });

      const sessionInDb = await prisma.userSession.findFirstOrThrow({
        where: { userId: reg.userId },
      });
      expect(sessionInDb.revokedAt).not.toBeNull();
      expect(sessionInDb.revocationReason).toBe(
        SessionRevocationReason.USER_LOGOUT,
      );

      // Le refresh token revoque ne peut plus etre utilise -> 401
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie.rawCookiePair)
        .expect(401);

      // Logout sans cookie reste idempotent (revoked: false)
      const emptyLogout = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(200);
      expect(emptyLogout.body.data.revoked).toBe(false);
    });

    it('revoque toutes les sessions actives lors du logout-all (POST /api/v1/auth/logout-all)', async () => {
      const email = uniqueEmail('logout-all');
      const password = 'phrase de passe logout all m13';

      const reg = await registrationService.register(
        {
          email,
          password,
          globalRole: 'ORGANIZATION_USER',
          termsAccepted: true,
        },
        { ipAddress: '196.200.56.1', userAgent: 'Jest' },
      );

      // Session 1 (PC)
      const login1 = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '196.200.56.1')
        .set('User-Agent', 'Device-1')
        .send({ email, password })
        .expect(200);

      // Session 2 (Mobile)
      const login2 = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', '196.200.56.2')
        .set('User-Agent', 'Device-2')
        .send({ email, password })
        .expect(200);

      const cookie1 = extractCookieHeaderValue(login1.headers['set-cookie']);
      const cookie2 = extractCookieHeaderValue(login2.headers['set-cookie']);
      const accessToken1 = login1.body.data.accessToken as string;

      // Appel authentifie a /api/v1/auth/logout-all
      const logoutAllRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${accessToken1}`)
        .set('X-Forwarded-For', '196.200.56.1')
        .expect(200);

      expect(logoutAllRes.body).toEqual({
        statusCode: 200,
        message: 'All active sessions revoked',
        data: { revokedCount: 2 },
      });

      // Verification en base : les 2 sessions sont revoquees avec LOGOUT_ALL
      const sessions = await prisma.userSession.findMany({
        where: { userId: reg.userId },
      });
      expect(sessions).toHaveLength(2);
      expect(
        sessions.every(
          (s) =>
            s.revokedAt !== null &&
            s.revocationReason === SessionRevocationReason.LOGOUT_ALL,
        ),
      ).toBe(true);

      // Aucun des 2 cookies ne peut rafraichir la session -> 401
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie1.rawCookiePair)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie2.rawCookiePair)
        .expect(401);
    });
  });
});
