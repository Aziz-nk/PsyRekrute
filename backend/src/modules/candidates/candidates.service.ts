import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { MOROCCAN_REGION_CODES } from '../../constants/moroccan-regions.constant';
import { UpsertCandidateProfileDto } from './dto/upsert-profile.dto';
import { AddCandidateEducationDto } from './dto/education.dto';
import { AddCandidateExperienceDto } from './dto/experience.dto';
import { SetCandidateSkillsDto } from './dto/skills.dto';
import { SetCandidateLanguagesDto } from './dto/languages.dto';
import { ConfirmCvUploadDto } from './dto/cv.dto';

export interface AuditContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class CandidatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Calcule le pourcentage d'avancement du profil candidat (0 - 100 %).
   */
  async computeProfileCompletion(candidateId: string): Promise<number> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { id: candidateId },
      include: {
        education: true,
        skills: true,
        experiences: true,
        languages: true,
      },
    });

    if (!profile) return 0;

    let score = 0;
    // Informations personnelles, catégorie & spécialité : 25 %
    if (profile.firstName && profile.lastName && profile.primarySpecialtyId && profile.regionCode && profile.cityName) {
      score += 25;
    }
    // Au moins une formation déclarée : 25 %
    if (profile.education.length > 0) {
      score += 25;
    }
    // Au moins une compétence déclarée : 20 %
    if (profile.skills.length > 0) {
      score += 20;
    }
    // Au moins une expérience déclarée ou disponibilité immédiate renseignée : 15 %
    if (profile.experiences.length > 0 || profile.availabilityStatus) {
      score += 15;
    }
    // Au moins une langue renseignée : 10 %
    if (profile.languages.length > 0) {
      score += 10;
    }
    // CV téléversé : bonus de complétion
    if (profile.cvStoragePath) {
      score = Math.min(100, score + 5);
    }

    return Math.min(100, score);
  }

  async getProfile(userId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
      include: {
        primarySpecialty: true,
        education: {
          include: { specialty: true },
          orderBy: { startYear: 'desc' },
        },
        experiences: {
          orderBy: { startDate: 'desc' },
        },
        skills: {
          include: { skill: true },
        },
        languages: {
          orderBy: { languageCode: 'asc' },
        },
      },
    });

    return profile;
  }

  async upsertProfile(
    userId: string,
    dto: UpsertCandidateProfileDto,
    _context?: AuditContext,
  ) {
    // Valider la région
    if (!MOROCCAN_REGION_CODES.includes(dto.regionCode)) {
      throw new BadRequestException(
        `Invalid regionCode '${dto.regionCode}'. Must be one of: ${MOROCCAN_REGION_CODES.join(', ')}`,
      );
    }

    // Valider la spécialité
    const specialty = await this.prisma.refSpecialty.findUnique({
      where: { id: dto.primarySpecialtyId },
    });
    if (!specialty || !specialty.isActive) {
      throw new BadRequestException('Invalid or inactive primarySpecialtyId');
    }

    const availableFromDate = dto.availableFrom
      ? new Date(dto.availableFrom)
      : null;

    const profile = await this.prisma.candidateProfile.upsert({
      where: { userId },
      create: {
        userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        profileCategory: dto.profileCategory,
        primarySpecialtyId: dto.primarySpecialtyId,
        regionCode: dto.regionCode,
        cityName: dto.cityName,
        mobilityRadiusKm: dto.mobilityRadiusKm ?? 0,
        openToRelocation: dto.openToRelocation ?? false,
        availabilityStatus: dto.availabilityStatus,
        availableFrom: availableFromDate,
        targetContractTypes: dto.targetContractTypes ?? [],
        bio: dto.bio,
        isAnonymizedInPool: dto.isAnonymizedInPool ?? true,
      },
      update: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        profileCategory: dto.profileCategory,
        primarySpecialtyId: dto.primarySpecialtyId,
        regionCode: dto.regionCode,
        cityName: dto.cityName,
        mobilityRadiusKm: dto.mobilityRadiusKm ?? 0,
        openToRelocation: dto.openToRelocation ?? false,
        availabilityStatus: dto.availabilityStatus,
        availableFrom: availableFromDate,
        targetContractTypes: dto.targetContractTypes ?? [],
        bio: dto.bio,
        isAnonymizedInPool: dto.isAnonymizedInPool ?? true,
      },
    });

    const completion = await this.computeProfileCompletion(profile.id);
    const updated = await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: { profileCompletionPercentage: completion },
      include: { primarySpecialty: true },
    });

    return updated;
  }

  async addEducation(userId: string, dto: AddCandidateEducationDto) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new BadRequestException('Candidate profile must be created before adding education');
    }

    const specialty = await this.prisma.refSpecialty.findUnique({
      where: { id: dto.specialtyId },
    });
    if (!specialty) {
      throw new BadRequestException('Invalid specialtyId');
    }

    const education = await this.prisma.candidateEducation.create({
      data: {
        candidateId: profile.id,
        degreeLevel: dto.degreeLevel,
        degreeTitle: dto.degreeTitle,
        institutionName: dto.institutionName,
        specialtyId: dto.specialtyId,
        startYear: dto.startYear,
        endYear: dto.endYear,
        isCurrentlyEnrolled: dto.isCurrentlyEnrolled ?? false,
      },
      include: { specialty: true },
    });

    const completion = await this.computeProfileCompletion(profile.id);
    await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: { profileCompletionPercentage: completion },
    });

    return education;
  }

  async deleteEducation(userId: string, educationId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const education = await this.prisma.candidateEducation.findUnique({
      where: { id: educationId },
    });
    if (!education || education.candidateId !== profile.id) {
      throw new NotFoundException('Education entry not found or unauthorized');
    }

    await this.prisma.candidateEducation.delete({
      where: { id: educationId },
    });

    const completion = await this.computeProfileCompletion(profile.id);
    await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: { profileCompletionPercentage: completion },
    });

    return { deleted: true };
  }

  async addExperience(userId: string, dto: AddCandidateExperienceDto) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new BadRequestException('Candidate profile must be created before adding experience');
    }

    const experience = await this.prisma.candidateExperience.create({
      data: {
        candidateId: profile.id,
        experienceType: dto.experienceType,
        organizationName: dto.organizationName,
        positionTitle: dto.positionTitle,
        targetAudience: dto.targetAudience,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        isCurrent: dto.isCurrent ?? false,
        totalMonths: dto.totalMonths,
        description: dto.description,
      },
    });

    const completion = await this.computeProfileCompletion(profile.id);
    await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: { profileCompletionPercentage: completion },
    });

    return experience;
  }

  async deleteExperience(userId: string, experienceId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const experience = await this.prisma.candidateExperience.findUnique({
      where: { id: experienceId },
    });
    if (!experience || experience.candidateId !== profile.id) {
      throw new NotFoundException('Experience entry not found or unauthorized');
    }

    await this.prisma.candidateExperience.delete({
      where: { id: experienceId },
    });

    const completion = await this.computeProfileCompletion(profile.id);
    await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: { profileCompletionPercentage: completion },
    });

    return { deleted: true };
  }

  async setSkills(userId: string, dto: SetCandidateSkillsDto) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new BadRequestException('Candidate profile must be created before declaring skills');
    }

    // Valider chaque skillId
    for (const item of dto.skills) {
      const skill = await this.prisma.refSkill.findUnique({
        where: { id: item.skillId },
      });
      if (!skill) {
        throw new BadRequestException(`Skill with ID ${item.skillId} does not exist`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.candidateSkill.deleteMany({
        where: { candidateId: profile.id },
      });

      if (dto.skills.length > 0) {
        await tx.candidateSkill.createMany({
          data: dto.skills.map((s) => ({
            candidateId: profile.id,
            skillId: s.skillId,
            level: s.level,
          })),
        });
      }
    });

    const completion = await this.computeProfileCompletion(profile.id);
    await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: { profileCompletionPercentage: completion },
    });

    return this.prisma.candidateSkill.findMany({
      where: { candidateId: profile.id },
      include: { skill: true },
    });
  }

  async setLanguages(userId: string, dto: SetCandidateLanguagesDto) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new BadRequestException('Candidate profile must be created before declaring languages');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.candidateLanguage.deleteMany({
        where: { candidateId: profile.id },
      });

      if (dto.languages.length > 0) {
        await tx.candidateLanguage.createMany({
          data: dto.languages.map((l) => ({
            candidateId: profile.id,
            languageCode: l.languageCode.toUpperCase(),
            proficiencyLevel: l.proficiencyLevel,
          })),
        });
      }
    });

    const completion = await this.computeProfileCompletion(profile.id);
    await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: { profileCompletionPercentage: completion },
    });

    return this.prisma.candidateLanguage.findMany({
      where: { candidateId: profile.id },
    });
  }

  async generateCvUploadUrl(userId: string) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new BadRequestException('Candidate profile must be created before uploading a CV');
    }

    return this.storageService.generateUploadPresignedUrl(profile.id, 'cv');
  }

  async confirmCvUpload(userId: string, dto: ConfirmCvUploadDto) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    const exists = await this.storageService.exists(dto.storageKey);
    if (!exists) {
      throw new BadRequestException('Uploaded file was not found in storage');
    }

    await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: { cvStoragePath: dto.storageKey },
    });

    const completion = await this.computeProfileCompletion(profile.id);
    const updated = await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: { profileCompletionPercentage: completion },
    });

    return updated;
  }

  async generateCvDownloadUrl(userId: string, context?: AuditContext) {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
    });
    if (!profile || !profile.cvStoragePath) {
      throw new NotFoundException('No CV uploaded for this candidate');
    }

    const result = await this.storageService.generateDownloadPresignedUrl(
      profile.cvStoragePath,
    );

    // Audit log (M3)
    await this.auditService.record({
      action: 'CV_DOWNLOAD',
      userId,
      entityType: 'CANDIDATE_PROFILE',
      entityId: profile.id,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      details: { cvStoragePath: profile.cvStoragePath },
    });

    return result;
  }
}
