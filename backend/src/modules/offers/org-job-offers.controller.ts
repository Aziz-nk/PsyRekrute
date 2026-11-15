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
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GlobalRole, OrgMemberRole } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { GlobalRolesGuard } from '../auth/global-roles.guard';
import { extractClientIp, extractUserAgent } from '../auth/ip-extractor.util';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgRolesGuard } from '../auth/org-roles.guard';
import { OrgRoles, Roles } from '../auth/rbac.decorators';
import { CreateJobOfferDto, UpdateJobOfferDto } from './dto/create-offer.dto';
import { QueryOrgJobOffersDto } from './dto/query-offers.dto';
import { OffersService } from './offers.service';

@ApiTags('organization-job-offers')
@ApiBearerAuth('access-token')
@Controller('organizations/:organizationId/job-offers')
@UseGuards(JwtAuthGuard, GlobalRolesGuard, OrgRolesGuard)
export class OrgJobOffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(GlobalRole.ORGANIZATION_USER)
  @OrgRoles(OrgMemberRole.RECRUITER, OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @ApiOperation({
    summary:
      "Création d'une offre au statut DRAFT (réservé OWNER, ADMIN, RECRUITER)",
  })
  @ApiCreatedResponse({ description: 'Offre créée en brouillon' })
  @ApiBadRequestResponse({ description: 'Données invalides' })
  @ApiForbiddenResponse({
    description: 'Rôle insuffisant ou hors organisation',
  })
  async createOffer(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateJobOfferDto,
  ) {
    const data = await this.offersService.createOffer(
      organizationId,
      user.userId,
      dto,
    );

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Job offer created successfully',
      data,
    };
  }

  @Get()
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @OrgRoles(
    OrgMemberRole.VIEWER,
    OrgMemberRole.RECRUITER,
    OrgMemberRole.ADMIN,
    OrgMemberRole.OWNER,
  )
  @ApiOperation({
    summary: "Liste des offres d'une organisation (tous statuts)",
  })
  @ApiOkResponse({ description: "Liste paginée des offres de l'organisation" })
  async listOrganizationOffers(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query() query: QueryOrgJobOffersDto,
  ) {
    const result = await this.offersService.listOrganizationOffers(
      organizationId,
      query,
    );
    return {
      statusCode: HttpStatus.OK,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':offerId')
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @OrgRoles(
    OrgMemberRole.VIEWER,
    OrgMemberRole.RECRUITER,
    OrgMemberRole.ADMIN,
    OrgMemberRole.OWNER,
  )
  @ApiOperation({
    summary: "Détail d'une offre au sein de l'organisation",
  })
  @ApiOkResponse({ description: "Détail complet de l'offre" })
  @ApiNotFoundResponse({
    description: "Offre introuvable dans l'organisation",
  })
  async getOrganizationOffer(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    const data = await this.offersService.getOrganizationOfferById(
      organizationId,
      offerId,
    );
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Put(':offerId')
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @OrgRoles(OrgMemberRole.RECRUITER, OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @ApiOperation({
    summary:
      "Modification d'une offre et de ses exigences (réservé OWNER, ADMIN, RECRUITER)",
  })
  @ApiOkResponse({ description: 'Offre mise à jour avec succès' })
  @ApiBadRequestResponse({
    description: 'Données invalides ou offre archivée',
  })
  @ApiNotFoundResponse({
    description: "Offre introuvable dans l'organisation",
  })
  async updateOffer(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @Body() dto: UpdateJobOfferDto,
  ) {
    const data = await this.offersService.updateOffer(
      organizationId,
      offerId,
      dto,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Job offer updated successfully',
      data,
    };
  }

  @Post(':offerId/publish')
  @HttpCode(HttpStatus.OK)
  @Roles(GlobalRole.ORGANIZATION_USER)
  @OrgRoles(OrgMemberRole.RECRUITER, OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @ApiOperation({
    summary:
      "Publication d'une offre (exige que l'organisation soit au statut VERIFIED)",
  })
  @ApiOkResponse({ description: 'Offre publiée avec succès' })
  @ApiForbiddenResponse({
    description: 'Organisation non vérifiée ou rôle insuffisant',
  })
  @ApiBadRequestResponse({
    description: 'Transition de statut invalide',
  })
  async publishOffer(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const data = await this.offersService.publishOffer(
      organizationId,
      offerId,
      user.userId,
      {
        ipAddress: extractClientIp(req),
        userAgent: extractUserAgent(req),
      },
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Job offer published successfully',
      data,
    };
  }

  @Post(':offerId/close')
  @HttpCode(HttpStatus.OK)
  @Roles(GlobalRole.ORGANIZATION_USER)
  @OrgRoles(OrgMemberRole.RECRUITER, OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @ApiOperation({
    summary: "Fermeture d'une offre publiée (PUBLISHED -> CLOSED)",
  })
  @ApiOkResponse({ description: 'Offre clôturée avec succès' })
  @ApiBadRequestResponse({
    description: 'Transition de statut invalide',
  })
  async closeOffer(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    const data = await this.offersService.closeOffer(organizationId, offerId);

    return {
      statusCode: HttpStatus.OK,
      message: 'Job offer closed successfully',
      data,
    };
  }

  @Post(':offerId/archive')
  @HttpCode(HttpStatus.OK)
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @OrgRoles(OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @ApiOperation({
    summary:
      "Archivage d'une offre (réservé OWNER, ADMIN, SYSTEM_ADMIN — interdit au RECRUITER selon DCTF §4.2)",
  })
  @ApiOkResponse({ description: 'Offre archivée avec succès' })
  @ApiForbiddenResponse({
    description: 'Seuls OWNER, ADMIN ou SYSTEM_ADMIN peuvent archiver une offre',
  })
  async archiveOffer(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    const data = await this.offersService.archiveOffer(organizationId, offerId);

    return {
      statusCode: HttpStatus.OK,
      message: 'Job offer archived successfully',
      data,
    };
  }

  @Delete(':offerId')
  @HttpCode(HttpStatus.OK)
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @OrgRoles(OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @ApiOperation({
    summary:
      "Suppression logique (archivage) d'une offre (réservé OWNER, ADMIN, SYSTEM_ADMIN)",
  })
  @ApiOkResponse({ description: 'Offre archivée avec succès' })
  async deleteOffer(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    const data = await this.offersService.archiveOffer(organizationId, offerId);

    return {
      statusCode: HttpStatus.OK,
      message: 'Job offer archived successfully',
      data,
    };
  }
}
