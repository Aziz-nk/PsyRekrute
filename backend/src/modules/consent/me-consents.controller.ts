import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { GlobalRole } from '@prisma/client';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { GlobalRolesGuard } from '../auth/global-roles.guard';
import { extractClientIp, extractUserAgent } from '../auth/ip-extractor.util';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/rbac.decorators';
import {
  ConsentChangeResult,
  ConsentService,
  ConsentStateView,
} from './consent.service';
import { UpdateConsentDto } from './dto/update-consent.dto';

@ApiTags('consents')
@ApiBearerAuth('access-token')
@Controller('me/consents')
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
export class MeConsentsController {
  constructor(private readonly consentService: ConsentService) {}

  @Get()
  @ApiOperation({ summary: 'Etat courant des consentements (M4)' })
  @ApiOkResponse({ description: 'Derniers etats connus par type' })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{
    statusCode: HttpStatus.OK;
    data: ConsentStateView[];
  }> {
    const data = await this.consentService.getCurrentConsents(user.userId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @Roles(GlobalRole.CANDIDATE)
  @ApiOperation({
    summary: 'Accorder ou revoquer TALENT_POOL_MATCHING (CANDIDATE, M4)',
  })
  @ApiOkResponse({ description: 'Etat du consentement apres la demande' })
  @ApiBadRequestResponse({
    description: 'Donnees invalides ou consentement obligatoire',
  })
  @ApiUnauthorizedResponse({ description: 'Authentification requise' })
  @ApiForbiddenResponse({ description: 'Reserve aux candidats' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateConsentDto,
    @Req() req: Request,
  ): Promise<{
    statusCode: HttpStatus.OK;
    message: string;
    data: ConsentChangeResult;
  }> {
    const data = await this.consentService.updateConsent(user.userId, dto, {
      ipAddress: extractClientIp(req),
      userAgent: extractUserAgent(req),
    });
    return {
      statusCode: HttpStatus.OK,
      message: data.changed ? 'Consent recorded' : 'Consent unchanged',
      data,
    };
  }
}
