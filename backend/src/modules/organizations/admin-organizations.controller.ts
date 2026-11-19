import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
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
import { GlobalRole, VerificationStatus } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { GlobalRolesGuard } from '../auth/global-roles.guard';
import { extractClientIp, extractUserAgent } from '../auth/ip-extractor.util';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/rbac.decorators';
import { VerifyOrganizationDto } from './dto/verify-organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin/organizations')
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@Roles(GlobalRole.SYSTEM_ADMIN)
export class AdminOrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Consultation de la liste des organisations (SYSTEM_ADMIN exclusif, DCTF §4.2)',
  })
  @ApiOkResponse({ description: 'Liste des organisations' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs système' })
  async listOrganizations(@Query('status') status?: string) {
    let verificationStatus: VerificationStatus | undefined;
    if (status) {
      if (!Object.values(VerificationStatus).includes(status as VerificationStatus)) {
        throw new BadRequestException(`Invalid verification status: ${status}`);
      }
      verificationStatus = status as VerificationStatus;
    }

    const data = await this.organizationsService.listOrganizationsForAdmin(verificationStatus);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Patch(':organizationId/verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Validation ou rejet administratif du statut d une organisation (SYSTEM_ADMIN exclusif, DCTF §4.2)',
  })
  @ApiOkResponse({ description: 'Statut de l organisation mis à jour' })
  @ApiNotFoundResponse({ description: 'Organisation introuvable' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Réservé aux administrateurs système' })
  async verifyOrganization(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentUser() adminUser: AuthenticatedUser,
    @Body() dto: VerifyOrganizationDto,
    @Req() req: Request,
  ) {
    const data = await this.organizationsService.verifyOrganization(
      organizationId,
      adminUser.userId,
      dto,
      {
        ipAddress: extractClientIp(req),
        userAgent: extractUserAgent(req),
      },
    );

    return {
      statusCode: HttpStatus.OK,
      message: `Organization verification status updated to ${dto.status}`,
      data,
    };
  }
}
