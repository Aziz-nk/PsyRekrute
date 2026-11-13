import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole } from '@prisma/client';
import { AuthenticatedRequest } from './jwt-auth.guard';
import { GLOBAL_ROLES_KEY, IS_PUBLIC_KEY } from './rbac.decorators';

/**
 * M2 – Guard de controle d'acces par role global (`USERS.global_role`).
 * - Retourne `true` si la route est marquee `@Public()` ou si aucun `@Roles()` n'est requis.
 * - Retourne `401 Unauthorized` si l'utilisateur n'est pas authentifie (`req.user` absent).
 * - Retourne `403 Forbidden` si `req.user.globalRole` ne figure pas explicitement dans `@Roles(...)`.
 * - N'accorde aucun passe-droit implicite a `SYSTEM_ADMIN` (DCTF §4.2).
 */
@Injectable()
export class GlobalRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<GlobalRole[]>(
      GLOBAL_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req?.user) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!requiredRoles.includes(req.user.globalRole)) {
      throw new ForbiddenException(
        'Access denied: insufficient global role permissions',
      );
    }

    return true;
  }
}
