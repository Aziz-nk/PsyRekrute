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
import { CandidatesService } from './candidates.service';
import { AddCandidateEducationDto } from './dto/education.dto';
import { AddCandidateExperienceDto } from './dto/experience.dto';
import { SetCandidateSkillsDto } from './dto/skills.dto';
import { SetCandidateLanguagesDto } from './dto/languages.dto';
import { ConfirmCvUploadDto } from './dto/cv.dto';
import { UpsertCandidateProfileDto } from './dto/upsert-profile.dto';

@ApiTags('candidates')
@ApiBearerAuth('access-token')
@Controller('candidates')
@UseGuards(JwtAuthGuard, GlobalRolesGuard)
@Roles(GlobalRole.CANDIDATE)
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Get('me')
  @ApiOperation({ summary: 'Consulter son profil candidat complet' })
  @ApiOkResponse({ description: 'Profil candidat avec formations, expériences, compétences et langues' })
  async getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.candidatesService.getProfile(user.userId);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Put('me')
  @ApiOperation({ summary: 'Créer ou mettre à jour son profil candidat' })
  @ApiOkResponse({ description: 'Profil candidat enregistré avec calcul du taux de complétion' })
  async upsertProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertCandidateProfileDto,
    @Req() req: Request,
  ) {
    const data = await this.candidatesService.upsertProfile(user.userId, dto, {
      ipAddress: extractClientIp(req),
      userAgent: extractUserAgent(req),
    });
    return {
      statusCode: HttpStatus.OK,
      message: 'Profile updated successfully',
      data,
    };
  }

  @Post('me/education')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter une formation / diplôme à son profil' })
  @ApiCreatedResponse({ description: 'Formation ajoutée' })
  async addEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddCandidateEducationDto,
  ) {
    const data = await this.candidatesService.addEducation(user.userId, dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Education added successfully',
      data,
    };
  }

  @Delete('me/education/:educationId')
  @ApiOperation({ summary: 'Supprimer une formation de son profil' })
  @ApiOkResponse({ description: 'Formation supprimée' })
  async deleteEducation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('educationId', ParseUUIDPipe) educationId: string,
  ) {
    const data = await this.candidatesService.deleteEducation(
      user.userId,
      educationId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Education deleted successfully',
      data,
    };
  }

  @Post('me/experiences')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter une expérience professionnelle ou stage' })
  @ApiCreatedResponse({ description: 'Expérience ajoutée' })
  async addExperience(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddCandidateExperienceDto,
  ) {
    const data = await this.candidatesService.addExperience(user.userId, dto);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Experience added successfully',
      data,
    };
  }

  @Delete('me/experiences/:experienceId')
  @ApiOperation({ summary: 'Supprimer une expérience de son profil' })
  @ApiOkResponse({ description: 'Expérience supprimée' })
  async deleteExperience(
    @CurrentUser() user: AuthenticatedUser,
    @Param('experienceId', ParseUUIDPipe) experienceId: string,
  ) {
    const data = await this.candidatesService.deleteExperience(
      user.userId,
      experienceId,
    );
    return {
      statusCode: HttpStatus.OK,
      message: 'Experience deleted successfully',
      data,
    };
  }

  @Put('me/skills')
  @ApiOperation({ summary: 'Déclarer ou mettre à jour ses compétences' })
  @ApiOkResponse({ description: 'Compétences mises à jour' })
  async setSkills(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetCandidateSkillsDto,
  ) {
    const data = await this.candidatesService.setSkills(user.userId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Skills updated successfully',
      data,
    };
  }

  @Put('me/languages')
  @ApiOperation({ summary: 'Déclarer ou mettre à jour ses compétences linguistiques' })
  @ApiOkResponse({ description: 'Langues mises à jour' })
  async setLanguages(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetCandidateLanguagesDto,
  ) {
    const data = await this.candidatesService.setLanguages(user.userId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Languages updated successfully',
      data,
    };
  }

  @Post('me/cv/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Générer une URL d'upload pré-signée pour le CV (PDF, 5 Mo max)" })
  @ApiOkResponse({ description: "URL signée d'upload et clé de stockage générées" })
  async generateCvUploadUrl(@CurrentUser() user: AuthenticatedUser) {
    const data = await this.candidatesService.generateCvUploadUrl(user.userId);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Post('me/cv/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Confirmer l'attachement du CV téléversé au profil" })
  @ApiOkResponse({ description: 'CV rattaché au profil candidat' })
  async confirmCvUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfirmCvUploadDto,
  ) {
    const data = await this.candidatesService.confirmCvUpload(user.userId, dto);
    return {
      statusCode: HttpStatus.OK,
      message: 'CV confirmed and attached to profile',
      data,
    };
  }

  @Get('me/cv/download-url')
  @ApiOperation({ summary: 'Générer une URL de téléchargement pré-signée pour son CV' })
  @ApiOkResponse({ description: 'URL signée de téléchargement générée' })
  async generateCvDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const data = await this.candidatesService.generateCvDownloadUrl(user.userId, {
      ipAddress: extractClientIp(req),
      userAgent: extractUserAgent(req),
    });
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }
}
