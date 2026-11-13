import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GlobalRole,
  Organization,
  OrganizationMember,
  OrgMemberRole,
  Prisma,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AddOrgMemberDto } from './dto/add-org-member.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { VerifyOrganizationDto } from './dto/verify-organization.dto';

export interface OrgRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface OrganizationMemberView {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgMemberRole;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    globalRole: GlobalRole;
    preferredLocale: string;
    createdAt: Date;
  };
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Création d'une organisation (M5) :
   * - Réservée à un utilisateur GlobalRole.ORGANIZATION_USER.
   * - Initialise le statut à PENDING et rattache immédiatement le créateur comme OWNER
   *   au sein de la même transaction Prisma.
   * - Enregistre l'événement ORGANIZATION_CREATED via AuditService.
   */
  async createOrganization(
    creatorUserId: string,
    dto: CreateOrganizationDto,
    context: OrgRequestContext = {},
  ): Promise<Organization> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            legalName: dto.legalName,
            tradeName: dto.tradeName,
            organizationType: dto.organizationType,
            identifierIce: dto.identifierIce || null,
            officialRegistrationNumber: dto.officialRegistrationNumber || null,
            website: dto.website || null,
            phone: dto.phone,
            email: dto.email,
            regionCode: dto.regionCode,
            cityName: dto.cityName,
            addressLine: dto.addressLine,
            verificationStatus: VerificationStatus.PENDING,
            isActive: true,
          },
        });

        await tx.organizationMember.create({
          data: {
            organizationId: organization.id,
            userId: creatorUserId,
            role: OrgMemberRole.OWNER,
          },
        });

        await this.auditService.recordInTx(tx, {
          action: 'ORGANIZATION_CREATED',
          userId: creatorUserId,
          entityType: 'ORGANIZATION',
          entityId: organization.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          details: {
            legalName: organization.legalName,
            tradeName: organization.tradeName,
            organizationType: organization.organizationType,
            identifierIce: organization.identifierIce,
          },
        });

        return organization;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An organization with this ICE identifier already exists',
        );
      }
      throw error;
    }
  }

  /**
   * Consultation des détails d'une organisation :
   * Vérifie l'existence et l'état actif.
   */
  async getOrganization(organizationId: string): Promise<Organization> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org || !org.isActive) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }

  /**
   * Consultation des membres d'une organisation.
   */
  async getMembers(organizationId: string): Promise<OrganizationMemberView[]> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, isActive: true },
    });

    if (!org || !org.isActive) {
      throw new NotFoundException('Organization not found');
    }

    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            globalRole: true,
            preferredLocale: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members;
  }

  /**
   * Ajout d'un utilisateur existant comme membre d'une organisation :
   * - Seul OWNER ou ADMIN peut inviter/ajouter des membres (DCTF §4.2).
   * - Un ADMIN ne peut pas nommer un autre ADMIN (réservé au OWNER, DCTF §4.1).
   * - Un CANDIDATE ou SYSTEM_ADMIN ne peut JAMAIS devenir membre d'une organisation.
   * - L'utilisateur cible doit avoir GlobalRole.ORGANIZATION_USER et exister en base.
   */
  async addMember(
    organizationId: string,
    actorUserId: string,
    actorRole: OrgMemberRole,
    dto: AddOrgMemberDto,
    context: OrgRequestContext = {},
  ): Promise<OrganizationMember> {
    if (actorRole === OrgMemberRole.ADMIN && dto.role === OrgMemberRole.ADMIN) {
      throw new ForbiddenException(
        'Only the organization owner can appoint administrators',
      );
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, globalRole: true, isActive: true },
    });

    if (!targetUser || !targetUser.isActive) {
      throw new NotFoundException('Target user not found or inactive');
    }

    if (targetUser.globalRole === GlobalRole.CANDIDATE) {
      throw new BadRequestException(
        'Candidates cannot be members of an organization',
      );
    }

    if (targetUser.globalRole !== GlobalRole.ORGANIZATION_USER) {
      throw new BadRequestException(
        'Only organization users can be added as organization members',
      );
    }

    const existingMember = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: dto.userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException(
        'User is already a member of this organization',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const member = await tx.organizationMember.create({
        data: {
          organizationId,
          userId: dto.userId,
          role: dto.role,
        },
      });

      await this.auditService.recordInTx(tx, {
        action: 'ORG_MEMBER_ADDED',
        userId: actorUserId,
        entityType: 'ORGANIZATION_MEMBER',
        entityId: member.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: {
          organizationId,
          targetUserId: dto.userId,
          assignedRole: dto.role,
        },
      });

      return member;
    });
  }

  /**
   * Révocation d'un membre de l'organisation :
   * - Le OWNER ne peut pas être révoqué (protection stricte).
   * - Un ADMIN ne peut pas révoquer un autre ADMIN ni le OWNER.
   * - Enregistre l'événement ORG_MEMBER_REMOVED dans AUDIT_LOGS.
   */
  async removeMember(
    organizationId: string,
    actorUserId: string,
    actorRole: OrgMemberRole,
    targetUserId: string,
    context: OrgRequestContext = {},
  ): Promise<{ revoked: boolean }> {
    const targetMember = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundException('Member not found in this organization');
    }

    if (targetMember.role === OrgMemberRole.OWNER) {
      throw new BadRequestException('Organization owner cannot be removed');
    }

    if (
      actorRole === OrgMemberRole.ADMIN &&
      targetMember.role === OrgMemberRole.ADMIN
    ) {
      throw new ForbiddenException(
        'Only the organization owner can remove an administrator',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMember.delete({
        where: {
          organizationId_userId: {
            organizationId,
            userId: targetUserId,
          },
        },
      });

      await this.auditService.recordInTx(tx, {
        action: 'ORG_MEMBER_REMOVED',
        userId: actorUserId,
        entityType: 'ORGANIZATION_MEMBER',
        entityId: targetMember.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: {
          organizationId,
          targetUserId,
          previousRole: targetMember.role,
        },
      });
    });

    return { revoked: true };
  }

  /**
   * Vérification administrative (SYSTEM_ADMIN exclusif, DCTF §4.2) :
   * Valide ou rejette le statut de l'organisation (PENDING, VERIFIED, REJECTED).
   */
  async verifyOrganization(
    organizationId: string,
    adminUserId: string,
    dto: VerifyOrganizationDto,
    context: OrgRequestContext = {},
  ): Promise<Organization> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const verifiedAt =
      dto.status === VerificationStatus.VERIFIED ? new Date() : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: {
          verificationStatus: dto.status,
          verifiedAt,
        },
      });

      await this.auditService.recordInTx(tx, {
        action: 'ORGANIZATION_VERIFIED',
        userId: adminUserId,
        entityType: 'ORGANIZATION',
        entityId: organizationId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: {
          newStatus: dto.status,
          previousStatus: org.verificationStatus,
          reason: dto.reason,
        },
      });

      return updated;
    });
  }
}
