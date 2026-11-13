import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GlobalRole, SessionRevocationReason } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AccessTokenJwtPayload,
  AuthenticatedUser,
  getJwtAccessSecret,
} from './jwt-auth.guard';
import { PasswordHashService } from './password-hash.service';
import { UserSessionsService } from './user-sessions.service';

export interface AuthRequestContext {
  ipAddress: string;
  userAgent: string;
}

export interface AuthUserSummary {
  userId: string;
  email: string;
  globalRole: GlobalRole;
  preferredLocale: string;
  isEmailVerified: boolean;
}

export interface IssuedAuthTokensResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  rawRefreshToken: string;
  user: AuthUserSummary;
}

@Injectable()
export class AuthSessionService implements OnModuleInit {
  private readonly logger = new Logger(AuthSessionService.name);
  private dummyPasswordHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHashService: PasswordHashService,
    private readonly userSessionsService: UserSessionsService,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await this.passwordHashService.hash(
      'dummy-argon2id-timing-shield-pass',
    );
  }

  /**
   * M1.3 – Connexion (`POST /api/v1/auth/login`) :
   * - Normalise l'email et verifie le mot de passe via Argon2id (M1.2).
   * - Equilibre le temps de reponse si l'email n'existe pas (anti-enumeration).
   * - Refuse les comptes desactives (`isActive === false`).
   * - Cree une session dans `USER_SESSIONS` (hash SHA-256) et emet un JWT HS256 (15 min).
   */
  async login(
    dto: LoginDto,
    context: AuthRequestContext,
  ): Promise<IssuedAuthTokensResult> {
    const normalizedEmail = (dto?.email ?? '').trim().toLowerCase();
    const plainPassword = dto?.password ?? '';
    const ipAddress = (context.ipAddress || '0.0.0.0').slice(0, 45);
    const userAgent = (context.userAgent || 'unknown').slice(0, 512);

    if (!normalizedEmail || !plainPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      if (this.dummyPasswordHash) {
        await this.passwordHashService.verify(
          this.dummyPasswordHash,
          plainPassword,
        );
      }
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.passwordHashService.verify(
      user.passwordHash,
      plainPassword,
    );

    if (!isPasswordValid) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_LOGIN_FAILED',
          entityType: 'USER',
          entityId: user.id,
          ipAddress,
          details: { reason: 'INVALID_PASSWORD', userAgent },
        },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_LOGIN_FAILED',
          entityType: 'USER',
          entityId: user.id,
          ipAddress,
          details: { reason: 'ACCOUNT_INACTIVE', userAgent },
        },
      });
      throw new ForbiddenException('User account is inactive');
    }

    const { rawRefreshToken, session } =
      await this.userSessionsService.createSession({
        userId: user.id,
        ipAddress,
        userAgent,
      });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_LOGIN_SUCCESS',
          entityType: 'USER_SESSION',
          entityId: session.id,
          ipAddress,
          details: { userAgent },
        },
      }),
    ]);

    const accessToken = await this.signAccessToken({
      sub: user.id,
      email: user.email,
      globalRole: user.globalRole,
      preferredLocale: user.preferredLocale,
      sid: session.id,
    });

    this.logger.log(`User logged in: id=${user.id} session=${session.id}`);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      rawRefreshToken,
      user: {
        userId: user.id,
        email: user.email,
        globalRole: user.globalRole,
        preferredLocale: user.preferredLocale,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  /**
   * M1.3 – Renouvellement (`POST /api/v1/auth/refresh`) :
   * - Rotation atomique du refresh token via `UserSessionsService.rotateSession` (M1.1).
   * - En cas de reutilisation d'un token deja rote/revoque, `rotateSession` revoque
   *   automatiquement toutes les sessions actives et leve 401.
   * - Emet un nouveau JWT HS256 de 15 min et un nouveau refresh token.
   */
  async refresh(
    rawRefreshToken: string | null,
    context: AuthRequestContext,
  ): Promise<IssuedAuthTokensResult> {
    if (!rawRefreshToken || rawRefreshToken.trim().length === 0) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const ipAddress = (context.ipAddress || '0.0.0.0').slice(0, 45);
    const userAgent = (context.userAgent || 'unknown').slice(0, 512);

    const rotated = await this.userSessionsService.rotateSession(
      rawRefreshToken,
      {
        ipAddress,
        userAgent,
      },
    );

    const user = await this.prisma.user.findUnique({
      where: { id: rotated.session.userId },
    });

    if (!user || !user.isActive) {
      await this.userSessionsService.revokeAllUserSessions(
        rotated.session.userId,
        SessionRevocationReason.ADMIN_REVOKED,
      );
      throw new UnauthorizedException('User account is inactive or not found');
    }

    const accessToken = await this.signAccessToken({
      sub: user.id,
      email: user.email,
      globalRole: user.globalRole,
      preferredLocale: user.preferredLocale,
      sid: rotated.session.id,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      rawRefreshToken: rotated.rawRefreshToken,
      user: {
        userId: user.id,
        email: user.email,
        globalRole: user.globalRole,
        preferredLocale: user.preferredLocale,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  /**
   * M1.3 – Deconnexion unitaire (`POST /api/v1/auth/logout`) :
   * Revoque la session associee au refresh token si present.
   */
  async logout(rawRefreshToken: string | null): Promise<{ revoked: boolean }> {
    if (!rawRefreshToken || rawRefreshToken.trim().length < 16) {
      return { revoked: false };
    }
    const revoked = await this.userSessionsService.revokeByRawToken(
      rawRefreshToken,
      SessionRevocationReason.USER_LOGOUT,
    );
    return { revoked };
  }

  /**
   * M1.3 – Deconnexion globale (`POST /api/v1/auth/logout-all`) :
   * Revoque toutes les sessions actives de l'utilisateur authentifie.
   */
  async logoutAll(
    userId: string,
    context: AuthRequestContext,
  ): Promise<{ revokedCount: number }> {
    const ipAddress = (context.ipAddress || '0.0.0.0').slice(0, 45);
    const revokedCount = await this.userSessionsService.revokeAllUserSessions(
      userId,
      SessionRevocationReason.LOGOUT_ALL,
    );

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'USER_LOGOUT_ALL',
        entityType: 'USER',
        entityId: userId,
        ipAddress,
        details: { revokedCount },
      },
    });

    return { revokedCount };
  }

  /**
   * M1.3 – Profil courant (`GET /api/v1/auth/me`) :
   * Retourne le profil de l'utilisateur authentifie (sans passwordHash).
   */
  async getMe(currentUser: AuthenticatedUser): Promise<AuthenticatedUser> {
    return currentUser;
  }

  /** Signe un access token JWT HS256 de 15 minutes (D6). */
  async signAccessToken(payload: AccessTokenJwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      algorithm: 'HS256',
      secret: getJwtAccessSecret(),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
  }
}
