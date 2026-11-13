import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GlobalRole, OrgMemberRole } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { GlobalRolesGuard } from '../auth/global-roles.guard';
import { extractClientIp, extractUserAgent } from '../auth/ip-extractor.util';
import {
  AuthenticatedRequest,
  AuthenticatedUser,
  JwtAuthGuard,
} from '../auth/jwt-auth.guard';
import { OrgRolesGuard } from '../auth/org-roles.guard';
import { OrgRoles, Roles } from '../auth/rbac.decorators';
import { AddOrgMemberDto } from './dto/add-org-member.dto';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth('access-token')
@Controller('organizations')
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(GlobalRole.ORGANIZATION_USER)
  @ApiOperation({
    summary:
      "Création d'une organisation (le créateur devient OWNER, statut PENDING)",
  })
  @ApiCreatedResponse({ description: 'Organisation créée avec succès' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiConflictResponse({ description: 'Identifiant ICE déjà utilisé' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({
    description: "Seuls les ORGANIZATION_USER peuvent créer une structure d'accueil",
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrganizationDto,
    @Req() req: Request,
  ) {
    const data = await this.organizationsService.createOrganization(
      user.userId,
      dto,
      {
        ipAddress: extractClientIp(req),
        userAgent: extractUserAgent(req),
      },
    );

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Organization created successfully',
      data,
    };
  }

  @Get(':organizationId')
  @UseGuards(OrgRolesGuard)
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @OrgRoles(
    OrgMemberRole.VIEWER,
    OrgMemberRole.RECRUITER,
    OrgMemberRole.ADMIN,
    OrgMemberRole.OWNER,
  )
  @ApiOperation({
    summary: "Consultation des informations d'une organisation",
  })
  @ApiOkResponse({ description: 'Détails de la structure' })
  @ApiNotFoundResponse({ description: 'Organisation introuvable' })
  @ApiForbiddenResponse({
    description: "Accès refusé hors de l'organisation",
  })
  async getOne(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    const data =
      await this.organizationsService.getOrganization(organizationId);

    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Get(':organizationId/members')
  @UseGuards(OrgRolesGuard)
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @OrgRoles(
    OrgMemberRole.VIEWER,
    OrgMemberRole.RECRUITER,
    OrgMemberRole.ADMIN,
    OrgMemberRole.OWNER,
  )
  @ApiOperation({
    summary: "Liste des membres d'une organisation",
  })
  @ApiOkResponse({ description: 'Membres de la structure' })
  @ApiForbiddenResponse({
    description: "Accès refusé hors de l'organisation",
  })
  async listMembers(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    const data = await this.organizationsService.getMembers(organizationId);

    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Post(':organizationId/members')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(OrgRolesGuard)
  @Roles(GlobalRole.ORGANIZATION_USER)
  @OrgRoles(OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @ApiOperation({
    summary: "Ajout d'un membre existant dans l'organisation",
  })
  @ApiCreatedResponse({ description: 'Membre ajouté avec succès' })
  @ApiBadRequestResponse({
    description: 'Utilisateur cible invalide ou rôle candidat',
  })
  @ApiConflictResponse({ description: 'Utilisateur déjà membre' })
  @ApiForbiddenResponse({
    description: 'Permission insuffisante ou accès hors organisation',
  })
  async addMember(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddOrgMemberDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const actorRole = req.organizationMembership?.role ?? OrgMemberRole.ADMIN;
    const data = await this.organizationsService.addMember(
      organizationId,
      user.userId,
      actorRole,
      dto,
      {
        ipAddress: extractClientIp(req),
        userAgent: extractUserAgent(req),
      },
    );

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Organization member added successfully',
      data,
    };
  }

  @Delete(':organizationId/members/:userId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OrgRolesGuard)
  @Roles(GlobalRole.ORGANIZATION_USER)
  @OrgRoles(OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @ApiOperation({
    summary: "Révocation d'un membre de l'organisation",
  })
  @ApiOkResponse({ description: 'Membre révoqué avec succès' })
  @ApiBadRequestResponse({ description: 'Tentative de révocation du OWNER' })
  @ApiForbiddenResponse({
    description: 'Seul le OWNER peut révoquer un administrateur',
  })
  @ApiNotFoundResponse({ description: 'Membre introuvable' })
  async removeMember(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthenticatedRequest,
  ) {
    const actorRole = req.organizationMembership?.role ?? OrgMemberRole.ADMIN;
    const data = await this.organizationsService.removeMember(
      organizationId,
      user.userId,
      actorRole,
      targetUserId,
      {
        ipAddress: extractClientIp(req),
        userAgent: extractUserAgent(req),
      },
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Organization member removed successfully',
      data,
    };
  }
}
