import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GlobalRole, OrgMemberRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { GlobalRolesGuard } from '../auth/global-roles.guard';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgRolesGuard } from '../auth/org-roles.guard';
import { OrgRoles, Roles } from '../auth/rbac.decorators';
import { QueryRecommendedCandidatesDto } from './dto/query-recommended-candidates.dto';
import { MatchingOrchestratorService } from './matching-orchestrator.service';

@ApiTags('matching')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
export class MatchingController {
  constructor(
    private readonly matchingOrchestrator: MatchingOrchestratorService,
  ) {}

  @Get('job-offers/:id/recommended-candidates')
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @ApiOperation({
    summary:
      'Vivier de talents : candidats recommandés et anonymisés pour une offre (DCTF §9.4)',
  })
  @ApiOkResponse({
    description:
      'Liste paginée des candidats recommandés triés par score décroissant',
  })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({
    description:
      "Non-membre de l'organisation, rôle insuffisant ou organisation non vérifiée",
  })
  @ApiNotFoundResponse({ description: 'Offre introuvable' })
  async getRecommendedCandidates(
    @Param('id', ParseUUIDPipe) offerId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryRecommendedCandidatesDto,
  ) {
    const result =
      await this.matchingOrchestrator.getRecommendedCandidatesForOffer(
        offerId,
        {
          userId: user.userId,
          globalRole: user.globalRole,
        },
        query,
      );

    return {
      statusCode: HttpStatus.OK,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('organizations/:organizationId/job-offers/:offerId/recommended-candidates')
  @UseGuards(OrgRolesGuard)
  @Roles(GlobalRole.ORGANIZATION_USER, GlobalRole.SYSTEM_ADMIN)
  @OrgRoles(OrgMemberRole.RECRUITER, OrgMemberRole.ADMIN, OrgMemberRole.OWNER)
  @ApiOperation({
    summary:
      'Vivier de talents par organisation : candidats recommandés et anonymisés pour une offre',
  })
  @ApiOkResponse({
    description:
      'Liste paginée des candidats recommandés triés par score décroissant',
  })
  async getOrgRecommendedCandidates(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryRecommendedCandidatesDto,
  ) {
    const result =
      await this.matchingOrchestrator.getRecommendedCandidatesForOffer(
        offerId,
        {
          userId: user.userId,
          globalRole: user.globalRole,
        },
        query,
        organizationId,
      );

    return {
      statusCode: HttpStatus.OK,
      data: result.data,
      meta: result.meta,
    };
  }
}
