import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GlobalRole, OrgMemberRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedRequest } from './jwt-auth.guard';
import {
  GLOBAL_ROLES_KEY,
  IS_PUBLIC_KEY,
  ORG_ID_PARAM_KEY,
  ORG_ROLES_KEY,
} from './rbac.decorators';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * M2 – Guard d'autorisation contextuelle d'organisation et d'isolation inter-organisations (`ORGANIZATION_MEMBERS`).
 *
 * Exigences de securite (DCTF §4.1 & §4.2) :
 * - Retourne `401 Unauthorized` si `req.user` est absent.
 * - Separe strictement `GlobalRole` et `OrgMemberRole` : un `CANDIDATE` est systematiquement
 *   refuse (`403 Forbidden`), meme si une ligne anormale existait en base.
 * - N'invente aucun privilege implicite pour `SYSTEM_ADMIN` : sur une route `@OrgRoles(...)`,
 *   `SYSTEM_ADMIN` est refuse (`403`) sauf si `@Roles(..., GlobalRole.SYSTEM_ADMIN)` est
 *   explicitement declare sur la route conformement a la matrice §4.2.
 * - Extrait `organizationId` uniquement depuis les parametres de route (`req.params`)
 *   et jamais depuis un champ non verifie du body ou de la query string.
 * - Verifie en base (`ORGANIZATION_MEMBERS`) que l'utilisateur authentifie appartient bien
 *   a l'`organizationId` cible avec l'un des `OrgMemberRole` requis, et que l'organisation est active.
 */
@Injectable()
export class OrgRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredOrgRoles = this.reflector.getAllAndOverride<OrgMemberRole[]>(
      ORG_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredOrgRoles || requiredOrgRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req?.user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Dissociation stricte : un CANDIDATE ne peut jamais agir comme membre d'organisation
    if (req.user.globalRole === GlobalRole.CANDIDATE) {
      throw new ForbiddenException(
        'Access denied: candidates cannot act as organization members',
      );
    }

    const targetOrganizationId = this.extractTargetOrganizationId(context, req);
    if (!targetOrganizationId || !UUID_REGEX.test(targetOrganizationId)) {
      throw new ForbiddenException(
        'Access denied: missing or invalid target organizationId',
      );
    }

    // SYSTEM_ADMIN n'a aucun acces implicite aux routes d'organisation :
    // il n'est autorise que si la route declare explicitement GlobalRole.SYSTEM_ADMIN dans @Roles()
    if (req.user.globalRole === GlobalRole.SYSTEM_ADMIN) {
      const explicitGlobalRoles =
        this.reflector.getAllAndOverride<GlobalRole[]>(GLOBAL_ROLES_KEY, [
          context.getHandler(),
          context.getClass(),
        ]) ?? [];

      if (!explicitGlobalRoles.includes(GlobalRole.SYSTEM_ADMIN)) {
        throw new ForbiddenException(
          'Access denied: SYSTEM_ADMIN is not permitted for this organization action',
        );
      }

      const org = await this.prisma.organization.findUnique({
        where: { id: targetOrganizationId },
        select: { id: true, isActive: true },
      });
      if (!org || !org.isActive) {
        throw new ForbiddenException(
          'Access denied: target organization not found or inactive',
        );
      }
      return true;
    }

    if (req.user.globalRole !== GlobalRole.ORGANIZATION_USER) {
      throw new ForbiddenException('Access denied: invalid global role');
    }

    // Verification de l'appartenance a l'organisation cible dans ORGANIZATION_MEMBERS
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: targetOrganizationId,
          userId: req.user.userId,
        },
      },
      include: {
        organization: {
          select: {
            id: true,
            isActive: true,
            verificationStatus: true,
          },
        },
      },
    });

    if (!membership || !membership.organization.isActive) {
      throw new ForbiddenException(
        'Access denied: user is not a member of the target organization',
      );
    }

    if (!requiredOrgRoles.includes(membership.role)) {
      throw new ForbiddenException(
        'Access denied: insufficient organization member role',
      );
    }

    req.organizationMembership = {
      organizationId: membership.organizationId,
      role: membership.role,
      verificationStatus: membership.organization.verificationStatus,
    };

    return true;
  }

  private extractTargetOrganizationId(
    context: ExecutionContext,
    req: AuthenticatedRequest,
  ): string | null {
    const paramName =
      this.reflector.getAllAndOverride<string>(ORG_ID_PARAM_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'organizationId';

    const params = req.params as Record<string, string | undefined> | undefined;
    if (!params) {
      return null;
    }

    const rawId = params[paramName] ?? params.orgId;
    return typeof rawId === 'string' && rawId.trim().length > 0
      ? rawId.trim()
      : null;
  }
}
