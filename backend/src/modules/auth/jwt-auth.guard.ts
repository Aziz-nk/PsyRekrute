import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GlobalRole } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes (D6 / DCTF §8.1)
export const DEFAULT_DEV_JWT_SECRET =
  'psyrekrute_dev_jwt_secret_hs256_min_32_bytes_key';

export function getJwtAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : DEFAULT_DEV_JWT_SECRET;
}

export interface AccessTokenJwtPayload {
  sub: string;
  email: string;
  globalRole: GlobalRole;
  preferredLocale: string;
  sid?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  globalRole: GlobalRole;
  preferredLocale: string;
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(req);
    if (!token) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    let payload: AccessTokenJwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenJwtPayload>(
        token,
        {
          secret: getJwtAccessSecret(),
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (!payload?.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid access token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        globalRole: true,
        preferredLocale: true,
        isEmailVerified: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User account is inactive or not found');
    }

    req.user = {
      userId: user.id,
      email: user.email,
      globalRole: user.globalRole,
      preferredLocale: user.preferredLocale,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };

    return true;
  }

  private extractBearerToken(req: Partial<Request> | undefined): string | null {
    const authHeader = req?.headers?.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      return null;
    }
    const [scheme, token] = authHeader.trim().split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
      return null;
    }
    return token;
  }
}
