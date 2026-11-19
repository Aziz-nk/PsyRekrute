import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GlobalRole } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { GlobalRolesGuard } from '../auth/global-roles.guard';
import { extractClientIp, extractUserAgent } from '../auth/ip-extractor.util';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/rbac.decorators';
import { ApplicationsService } from './applications.service';
import {
  ApplyDirectDto,
  CandidateTransitionDto,
  GetCvDownloadUrlDto,
  InviteCandidateDto,
  RecruiterTransitionDto,
} from './dto/applications.dto';

@ApiTags('applications')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  @Roles(GlobalRole.CANDIDATE)
  @ApiOperation({
    summary:
      'Postuler directement à une offre publiée (DIRECT_APPLY -> SUBMITTED)',
  })
  @ApiCreatedResponse({ description: 'Candidature enregistrée avec succès' })
  async applyDirect(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ApplyDirectDto,
    @Req() req: Request,
  ) {
    const data = await this.applicationsService.applyDirect(user.userId, dto, {
      ipAddress: extractClientIp(req),
      userAgent: extractUserAgent(req),
    });

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Application submitted successfully',
      data,
    };
  }

  @Post('applications/invite')
  @HttpCode(HttpStatus.CREATED)
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      'Inviter un candidat recommandé du vivier sur une offre publiée (DCTF §9.5)',
  })
  @ApiCreatedResponse({ description: 'Invitation envoyée avec succès' })
  async inviteCandidate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteCandidateDto,
    @Req() req: Request,
  ) {
    const data = await this.applicationsService.inviteCandidate(
      { userId: user.userId, globalRole: user.globalRole },
      dto,
      {
        ipAddress: extractClientIp(req),
        userAgent: extractUserAgent(req),
      },
    );

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Candidate invited successfully',
      data,
    };
  }

  @Get('candidates/me/applications')
  @Roles(GlobalRole.CANDIDATE)
  @ApiOperation({
    summary: 'Lister les candidatures et invitations reçues par le candidat',
  })
  @ApiOkResponse({ description: 'Liste des candidatures du candidat' })
  async listMyApplications(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.applicationsService.listCandidateApplications(
      user.userId,
    );

    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Patch('candidates/me/applications/:applicationId/status')
  @Roles(GlobalRole.CANDIDATE)
  @ApiOperation({
    summary:
      'Mettre à jour le statut d une candidature côté candidat (FSM §7.1)',
  })
  @ApiOkResponse({ description: 'Statut mis à jour avec succès' })
  async transitionByCandidate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: CandidateTransitionDto,
    @Req() req: Request,
  ) {
    const data = await this.applicationsService.transitionByCandidate(
      user.userId,
      applicationId,
      dto,
      {
        ipAddress: extractClientIp(req),
        userAgent: extractUserAgent(req),
      },
    );

    return {
      statusCode: HttpStatus.OK,
      message: `Application status updated to ${dto.targetStatus}`,
      data,
    };
  }

  @Get('organizations/:organizationId/job-offers/:offerId/applications')
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      'Lister les candidatures et invitations d une offre pour une organisation',
  })
  @ApiOkResponse({
    description:
      'Liste des candidatures (profils anonymisés tant que le statut est INVITED)',
  })
  async listOfferApplications(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    const data = await this.applicationsService.listOfferApplicationsForOrg(
      organizationId,
      offerId,
      { userId: user.userId, globalRole: user.globalRole },
    );

    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Patch('organizations/:organizationId/applications/:applicationId/status')
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      'Mettre à jour le statut d une candidature côté recruteur (FSM §7.1)',
  })
  @ApiOkResponse({ description: 'Statut mis à jour avec succès' })
  async transitionByRecruiter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: RecruiterTransitionDto,
    @Req() req: Request,
  ) {
    const data = await this.applicationsService.transitionByRecruiter(
      organizationId,
      applicationId,
      { userId: user.userId, globalRole: user.globalRole },
      dto,
      {
        ipAddress: extractClientIp(req),
        userAgent: extractUserAgent(req),
      },
    );

    return {
      statusCode: HttpStatus.OK,
      message: `Application status updated to ${dto.targetStatus}`,
      data,
    };
  }

  @Post('candidate/cv/download-url')
  @HttpCode(HttpStatus.OK)
  @Roles(
    GlobalRole.CANDIDATE,
    GlobalRole.ORGANIZATION_USER,
    GlobalRole.SYSTEM_ADMIN,
  )
  @ApiOperation({
    summary:
      'Générer une URL pré-signée de téléchargement de CV (DCTF §9.6 + Audit CV_DOWNLOAD)',
  })
  @ApiOkResponse({
    description: 'URL pré-signée temporaire (15 minutes) générée',
  })
  async getCvDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GetCvDownloadUrlDto,
    @Req() req: Request,
  ) {
    const data = await this.applicationsService.getCvDownloadUrl(
      { userId: user.userId, globalRole: user.globalRole },
      dto,
      {
        ipAddress: extractClientIp(req),
        userAgent: extractUserAgent(req),
      },
    );

    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }
}
