import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import {
  GlobalRole,
  PrismaClient,
  SessionRevocationReason,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UserSessionsService } from './user-sessions.service';

describe('UserSessionsService & invariants USER_SESSIONS (M1.1 / D1)', () => {
  const dbUrl =
    process.env.DATABASE_URL ??
    'postgresql://psyrekrute_dev_user@127.0.0.1:5432/psyrekrute_db?schema=public';
  let prisma: PrismaClient;
  let service: UserSessionsService;
  let testUserId: string;
  let secondUserId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    await prisma.$connect();
    service = new UserSessionsService(prisma as unknown as PrismaService);
  });

  beforeEach(async () => {
    const u1 = await prisma.user.create({
      data: {
        email: `session-u1-${Date.now()}-${Math.random().toString(36).slice(2)}@psyrekrute.ma`,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder',
        globalRole: GlobalRole.CANDIDATE,
      },
    });
    const u2 = await prisma.user.create({
      data: {
        email: `session-u2-${Date.now()}-${Math.random().toString(36).slice(2)}@psyrekrute.ma`,
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$placeholder',
        globalRole: GlobalRole.CANDIDATE,
      },
    });
    testUserId = u1.id;
    secondUserId = u2.id;
  });

  afterEach(async () => {
    const ids = [testUserId, secondUserId].filter(Boolean);
    if (ids.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('1. Hachage SHA-256 et interdiction du stockage en clair (D1)', () => {
    it('genere un refresh token brut d au moins 256 bits et ne stocke que son hash SHA-256 en base', async () => {
      const { rawRefreshToken, session } = await service.createSession({
        userId: testUserId,
        ipAddress: '127.0.0.1',
        userAgent: 'Jest/M1.1',
      });

      expect(rawRefreshToken.length).toBeGreaterThanOrEqual(43);
      expect(session.tokenHash).not.toBe(rawRefreshToken);
      expect(service.isValidTokenHash(session.tokenHash)).toBe(true);
      expect(session.tokenHash).toBe(service.hashRefreshToken(rawRefreshToken));

      const dbRow = await prisma.userSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(dbRow.tokenHash).toBe(session.tokenHash);
      expect(JSON.stringify(dbRow)).not.toContain(rawRefreshToken);
    });

    it('rejette un refresh token brut trop court ou vide avant hachage', () => {
      expect(() => service.hashRefreshToken('')).toThrow(UnauthorizedException);
      expect(() => service.hashRefreshToken('short-token')).toThrow(
        UnauthorizedException,
      );
    });

    it('PostgreSQL (contrainte CHECK) bloque physiquement toute insertion d un refresh token en clair', async () => {
      const plainToken = 'plain_refresh_token_not_sha256_hex_at_all';
      await expect(
        prisma.userSession.create({
          data: {
            userId: testUserId,
            tokenHash: plainToken,
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
      ).rejects.toThrow(/user_sessions_token_hash_sha256_chk/);
    });

    it('PostgreSQL (contrainte UNIQUE) refuse deux sessions avec le meme token_hash', async () => {
      const { session } = await service.createSession({ userId: testUserId });
      await expect(
        prisma.userSession.create({
          data: {
            userId: testUserId,
            tokenHash: session.tokenHash,
            expiresAt: new Date(Date.now() + 60_000),
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('2. Relations Prisma avec USER et suppression en cascade', () => {
    it('relie User <-> UserSession et supprime automatiquement les sessions a la suppression du User (ON DELETE CASCADE)', async () => {
      const s1 = await service.createSession({ userId: testUserId });
      const s2 = await service.createSession({ userId: testUserId });

      const userWithSessions = await prisma.user.findUniqueOrThrow({
        where: { id: testUserId },
        include: { sessions: true },
      });
      expect(userWithSessions.sessions).toHaveLength(2);

      await prisma.user.delete({ where: { id: testUserId } });
      testUserId = '';

      const remaining = await prisma.userSession.findMany({
        where: { id: { in: [s1.session.id, s2.session.id] } },
      });
      expect(remaining).toHaveLength(0);
    });
  });

  describe('3. Rotation, concurrence et detection atomique de reutilisation', () => {
    it('effectue la rotation atomique et renseigne replacedBySessionId + ROTATED', async () => {
      const initial = await service.createSession({
        userId: testUserId,
        ipAddress: '10.0.0.1',
        userAgent: 'Agent/1',
      });

      const rotated = await service.rotateSession(initial.rawRefreshToken, {
        ipAddress: '10.0.0.2',
      });

      expect(rotated.previousSessionId).toBe(initial.session.id);
      expect(rotated.rawRefreshToken).not.toBe(initial.rawRefreshToken);

      const oldInDb = await prisma.userSession.findUniqueOrThrow({
        where: { id: initial.session.id },
        include: { replacedBySession: true },
      });
      expect(oldInDb.revokedAt).not.toBeNull();
      expect(oldInDb.revocationReason).toBe(SessionRevocationReason.ROTATED);
      expect(oldInDb.replacedBySessionId).toBe(rotated.session.id);
      expect(oldInDb.replacedBySession?.id).toBe(rotated.session.id);
    });

    it('detecte la reutilisation sequentielle et revoque TOUTES les sessions actives du compte', async () => {
      const s1 = await service.createSession({ userId: testUserId });
      const otherDevice = await service.createSession({ userId: testUserId });
      const s1Rotated = await service.rotateSession(s1.rawRefreshToken);

      await expect(
        service.rotateSession(s1.rawRefreshToken),
      ).rejects.toThrow(/reuse detected/i);

      const activeAfterReuse = await prisma.userSession.findMany({
        where: { userId: testUserId, revokedAt: null },
      });
      expect(activeAfterReuse).toHaveLength(0);

      const revokedS1Rotated = await prisma.userSession.findUniqueOrThrow({
        where: { id: s1Rotated.session.id },
      });
      const revokedOther = await prisma.userSession.findUniqueOrThrow({
        where: { id: otherDevice.session.id },
      });
      expect(revokedS1Rotated.revocationReason).toBe(
        SessionRevocationReason.REUSE_DETECTED,
      );
      expect(revokedOther.revocationReason).toBe(
        SessionRevocationReason.REUSE_DETECTED,
      );
    });

    it('serialise deux rotations CONCURRENTES du meme refresh token (SELECT FOR UPDATE) et revoque toutes les sessions actives', async () => {
      const shared = await service.createSession({ userId: testUserId });
      const parallelDevice = await service.createSession({ userId: testUserId });

      // Deux requetes concurrentes presentent exactement le meme refresh token en meme temps
      const results = await Promise.allSettled([
        service.rotateSession(shared.rawRefreshToken),
        service.rotateSession(shared.rawRefreshToken),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      // Une seule peut passer en premier ; la seconde (bloque par FOR UPDATE) detecte la reutilisation
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0].reason as Error).message).toMatch(/reuse detected/i);

      // Apres la detection concurrente, AUCUNE session ne doit rester active (y compris le successeur cree par la 1re)
      const activeRemaining = await prisma.userSession.findMany({
        where: { userId: testUserId, revokedAt: null },
      });
      expect(activeRemaining).toHaveLength(0);

      const parallelInDb = await prisma.userSession.findUniqueOrThrow({
        where: { id: parallelDevice.session.id },
      });
      expect(parallelInDb.revocationReason).toBe(
        SessionRevocationReason.REUSE_DETECTED,
      );
    });

    it('rejette un refresh token inconnu ou expire', async () => {
      const fakeRaw = service.generateRawRefreshToken();
      await expect(service.rotateSession(fakeRaw)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      const expired = await service.createSession({
        userId: testUserId,
        ttlSeconds: -10,
      });
      await expect(
        service.rotateSession(expired.rawRefreshToken),
      ).rejects.toThrow(/expired/i);
    });

    it('revoque une session unitaire (USER_LOGOUT) et toutes les sessions (LOGOUT_ALL)', async () => {
      const s1 = await service.createSession({ userId: testUserId });
      const s2 = await service.createSession({ userId: testUserId });
      const s3 = await service.createSession({ userId: testUserId });

      expect(await service.revokeByRawToken(s1.rawRefreshToken)).toBe(true);
      expect(await service.revokeByRawToken(s1.rawRefreshToken)).toBe(false);

      const countAll = await service.revokeAllUserSessions(testUserId);
      expect(countAll).toBe(2);

      const s2Db = await prisma.userSession.findUniqueOrThrow({
        where: { id: s2.session.id },
      });
      const s3Db = await prisma.userSession.findUniqueOrThrow({
        where: { id: s3.session.id },
      });
      expect(s2Db.revocationReason).toBe(SessionRevocationReason.LOGOUT_ALL);
      expect(s3Db.revocationReason).toBe(SessionRevocationReason.LOGOUT_ALL);
    });
  });

  describe('4. Invariants SQL de la chaine de rotation (PostgreSQL CHECK + Trigger)', () => {
    it('Invariant 1 : une session ne peut pas se remplacer elle-meme', async () => {
      const s1 = await service.createSession({ userId: testUserId });
      await expect(
        prisma.userSession.update({
          where: { id: s1.session.id },
          data: {
            revokedAt: new Date(),
            revocationReason: SessionRevocationReason.ROTATED,
            replacedBySessionId: s1.session.id,
          },
        }),
      ).rejects.toThrow(/user_sessions_no_self_replace_chk/);
    });

    it('Invariant 2 : une session ne peut avoir qu un seul successeur (non reassignable, unique)', async () => {
      const s1 = await service.createSession({ userId: testUserId });
      const rotated = await service.rotateSession(s1.rawRefreshToken);
      const other = await service.createSession({ userId: testUserId });

      // Tentative de reassigner le successeur de s1 vers `other`
      await expect(
        prisma.userSession.update({
          where: { id: s1.session.id },
          data: { replacedBySessionId: other.session.id },
        }),
      ).rejects.toThrow(/user_sessions_single_successor_violation/);

      // Tentative d'utiliser le meme successeur `rotated.session.id` pour une autre session
      await expect(
        prisma.userSession.update({
          where: { id: other.session.id },
          data: {
            revokedAt: new Date(),
            revocationReason: SessionRevocationReason.ROTATED,
            replacedBySessionId: rotated.session.id,
          },
        }),
      ).rejects.toThrow();
    });

    it('Invariant 3 : le successeur doit obligatoirement appartenir au meme utilisateur', async () => {
      const sUser1 = await service.createSession({ userId: testUserId });
      const sUser2 = await service.createSession({ userId: secondUserId });

      await expect(
        prisma.userSession.update({
          where: { id: sUser1.session.id },
          data: {
            revokedAt: new Date(),
            revocationReason: SessionRevocationReason.ROTATED,
            replacedBySessionId: sUser2.session.id,
          },
        }),
      ).rejects.toThrow(/user_sessions_cross_user_rotation_violation/);
    });

    it('Invariant 4 : une session revoquee ne peut jamais etre reactivee, et user_id/token_hash sont immuables', async () => {
      const s1 = await service.createSession({ userId: testUserId });
      await service.revokeByRawToken(s1.rawRefreshToken);

      await expect(
        prisma.userSession.update({
          where: { id: s1.session.id },
          data: { revokedAt: null, revocationReason: null },
        }),
      ).rejects.toThrow(/user_sessions_cannot_reactivate_revoked/);

      const s2 = await service.createSession({ userId: testUserId });
      await expect(
        prisma.userSession.update({
          where: { id: s2.session.id },
          data: { userId: secondUserId },
        }),
      ).rejects.toThrow(/user_sessions_immutable_identity_violation/);
    });

    it('Invariant 5 : une session expiree ne peut pas recevoir un successeur en base', async () => {
      const expired = await service.createSession({
        userId: testUserId,
        ttlSeconds: -60,
      });
      const candidateSuccessor = await service.createSession({
        userId: testUserId,
      });

      await expect(
        prisma.userSession.update({
          where: { id: expired.session.id },
          data: {
            revokedAt: new Date(),
            revocationReason: SessionRevocationReason.ROTATED,
            replacedBySessionId: candidateSuccessor.session.id,
          },
        }),
      ).rejects.toThrow(/user_sessions_expired_cannot_rotate/);
    });
  });

  describe('5. Politique de conservation des sessions revoquees et expirees (30 jours apres expiration)', () => {
    it('refuse une duree de retention inferieure a 30 jours apres expiration', async () => {
      await expect(
        service.purgeExpiredSessionsBeyondRetention(7),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('conserve les sessions revoquees/expirees recentes (< 30j) pour la detection de reutilisation et purge celles > 30j', async () => {
      // Session revoquee mais expiree il y a seulement 5 jours -> DOIT etre conservee
      const recentExpired = await service.createSession({
        userId: testUserId,
        ttlSeconds: -5 * 24 * 60 * 60,
      });
      await service.revokeByRawToken(recentExpired.rawRefreshToken);

      // Session expiree il y a 35 jours -> DOIT etre purgee
      const oldExpired = await service.createSession({
        userId: testUserId,
        ttlSeconds: -35 * 24 * 60 * 60,
      });

      const purgedCount = await service.purgeExpiredSessionsBeyondRetention(30);
      expect(purgedCount).toBeGreaterThanOrEqual(1);

      const recentStillThere = await prisma.userSession.findUnique({
        where: { id: recentExpired.session.id },
      });
      const oldGone = await prisma.userSession.findUnique({
        where: { id: oldExpired.session.id },
      });
      expect(recentStillThere).not.toBeNull();
      expect(oldGone).toBeNull();
    });
  });
});
