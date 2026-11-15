import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, VerificationStatus } from '@prisma/client';
import { MOROCCAN_REGION_CODES } from '../../constants/moroccan-regions.constant';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateJobOfferDto,
  OfferRequiredLanguageItemDto,
  OfferRequiredSkillItemDto,
  UpdateJobOfferDto,
} from './dto/create-offer.dto';
import {
  QueryJobOffersDto,
  QueryOrgJobOffersDto,
} from './dto/query-offers.dto';

export interface OfferRequestContext {
  ipAddress?: string;
  userAgent?: string;
}

const OFFER_DETAIL_INCLUDE = {
  organization: {
    select: {
      id: true,
      tradeName: true,
      legalName: true,
      organizationType: true,
      cityName: true,
      regionCode: true,
      website: true,
      verificationStatus: true,
      isActive: true,
    },
  },
  targetSpecialty: {
    select: {
      id: true,
      code: true,
      titleFr: true,
      titleAr: true,
      titleEn: true,
    },
  },
  requiredSkills: {
    include: {
      skill: {
        select: {
          id: true,
          code: true,
          category: true,
          titleFr: true,
          titleAr: true,
          titleEn: true,
        },
      },
    },
  },
  requiredLanguages: true,
} satisfies Prisma.JobOfferInclude;

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Retourne les organisations actives auxquelles appartient un utilisateur ORGANIZATION_USER,
   * avec son rôle contextuel et le statut de vérification de l'organisation.
   */
  async getMyOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: {
        userId,
        organization: {
          isActive: true,
        },
      },
      include: {
        organization: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return memberships.map((m) => ({
      membershipId: m.id,
      role: m.role,
      organization: m.organization,
    }));
  }

  /**
   * Recherche et liste publique des offres publiées (DCTF §9.3).
   * Seules les offres au statut PUBLISHED émises par une organisation active et VERIFIED
   * sont retournées publiquement.
   */
  async listPublicOffers(query: QueryJobOffersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.JobOfferWhereInput = {
      status: 'PUBLISHED',
      organization: {
        isActive: true,
        verificationStatus: VerificationStatus.VERIFIED,
      },
    };

    if (query.offerType) {
      where.offerType = query.offerType;
    }

    if (query.regionCode) {
      where.regionCode = query.regionCode;
    }

    if (query.specialtyId) {
      where.targetSpecialtyId = query.specialtyId;
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.jobOffer.count({ where }),
      this.prisma.jobOffer.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          organization: {
            select: {
              id: true,
              tradeName: true,
              organizationType: true,
              cityName: true,
              regionCode: true,
            },
          },
          targetSpecialty: {
            select: {
              id: true,
              code: true,
              titleFr: true,
              titleAr: true,
              titleEn: true,
            },
          },
        },
      }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Consultation publique du détail d'une offre publiée.
   */
  async getPublicOfferById(offerId: string) {
    const offer = await this.prisma.jobOffer.findUnique({
      where: { id: offerId },
      include: OFFER_DETAIL_INCLUDE,
    });

    if (
      !offer ||
      offer.status !== 'PUBLISHED' ||
      !offer.organization.isActive ||
      offer.organization.verificationStatus !== VerificationStatus.VERIFIED
    ) {
      throw new NotFoundException('Job offer not found');
    }

    return offer;
  }

  /**
   * Création d'une offre par un membre autorisé (OWNER, ADMIN, RECRUITER) au statut initial DRAFT.
   */
  async createOffer(
    organizationId: string,
    userId: string,
    dto: CreateJobOfferDto,
  ) {
    if (!MOROCCAN_REGION_CODES.includes(dto.regionCode)) {
      throw new BadRequestException(
        `Invalid Moroccan region code: ${dto.regionCode}`,
      );
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Access denied: user is not a member of the target organization',
      );
    }

    await this.validateTargetSpecialty(dto.targetSpecialtyId);
    await this.validateSkillsAndLanguages(
      dto.requiredSkills,
      dto.requiredLanguages,
    );

    return this.prisma.jobOffer.create({
      data: {
        organizationId,
        authorMemberId: membership.id,
        title: dto.title.trim(),
        offerType: dto.offerType,
        contractSubType: dto.contractSubType,
        requiredDegreeLevel: dto.requiredDegreeLevel,
        targetSpecialtyId: dto.targetSpecialtyId,
        regionCode: dto.regionCode,
        cityName: dto.cityName.trim(),
        minExperienceMonths: dto.minExperienceMonths ?? 0,
        isExperienceMandatory: dto.isExperienceMandatory ?? false,
        startDate: new Date(dto.startDate),
        durationMonths: dto.durationMonths ?? null,
        remunerationStipend: dto.remunerationStipend?.trim() || null,
        description: dto.description.trim(),
        status: 'DRAFT',
        requiredSkills:
          dto.requiredSkills && dto.requiredSkills.length > 0
            ? {
                create: dto.requiredSkills.map((s) => ({
                  skillId: s.skillId,
                  isMandatory: s.isMandatory ?? false,
                  minRequiredLevel: s.minRequiredLevel,
                  weight: s.weight ?? 1,
                })),
              }
            : undefined,
        requiredLanguages:
          dto.requiredLanguages && dto.requiredLanguages.length > 0
            ? {
                create: dto.requiredLanguages.map((l) => ({
                  languageCode: l.languageCode,
                  minProficiencyLevel: l.minProficiencyLevel,
                  isMandatory: l.isMandatory ?? true,
                })),
              }
            : undefined,
      },
      include: OFFER_DETAIL_INCLUDE,
    });
  }

  /**
   * Liste des offres d'une organisation (accessible aux membres VIEWER, RECRUITER, ADMIN, OWNER et SYSTEM_ADMIN).
   */
  async listOrganizationOffers(
    organizationId: string,
    query: QueryOrgJobOffersDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.JobOfferWhereInput = {
      organizationId,
    };

    if (query.status) {
      where.status = query.status;
    }

    const [total, items] = await Promise.all([
      this.prisma.jobOffer.count({ where }),
      this.prisma.jobOffer.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }],
        include: OFFER_DETAIL_INCLUDE,
      }),
    ]);

    return {
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Détail d'une offre au sein de son organisation (quel que soit son statut).
   */
  async getOrganizationOfferById(organizationId: string, offerId: string) {
    const offer = await this.prisma.jobOffer.findUnique({
      where: { id: offerId },
      include: OFFER_DETAIL_INCLUDE,
    });

    if (!offer || offer.organizationId !== organizationId) {
      throw new NotFoundException('Job offer not found in this organization');
    }

    return offer;
  }

  /**
   * Modification d'une offre (interdite si l'offre est ARCHIVED).
   */
  async updateOffer(
    organizationId: string,
    offerId: string,
    dto: UpdateJobOfferDto,
  ) {
    const existing = await this.prisma.jobOffer.findUnique({
      where: { id: offerId },
    });

    if (!existing || existing.organizationId !== organizationId) {
      throw new NotFoundException('Job offer not found in this organization');
    }

    if (existing.status === 'ARCHIVED') {
      throw new BadRequestException('Cannot modify an archived job offer');
    }

    if (dto.regionCode && !MOROCCAN_REGION_CODES.includes(dto.regionCode)) {
      throw new BadRequestException(
        `Invalid Moroccan region code: ${dto.regionCode}`,
      );
    }

    if (dto.targetSpecialtyId) {
      await this.validateTargetSpecialty(dto.targetSpecialtyId);
    }

    await this.validateSkillsAndLanguages(
      dto.requiredSkills,
      dto.requiredLanguages,
    );

    return this.prisma.$transaction(async (tx) => {
      if (dto.requiredSkills !== undefined) {
        await tx.jobRequiredSkill.deleteMany({
          where: { jobOfferId: offerId },
        });
        if (dto.requiredSkills.length > 0) {
          await tx.jobRequiredSkill.createMany({
            data: dto.requiredSkills.map((s) => ({
              jobOfferId: offerId,
              skillId: s.skillId,
              isMandatory: s.isMandatory ?? false,
              minRequiredLevel: s.minRequiredLevel,
              weight: s.weight ?? 1,
            })),
          });
        }
      }

      if (dto.requiredLanguages !== undefined) {
        await tx.jobRequiredLanguage.deleteMany({
          where: { jobOfferId: offerId },
        });
        if (dto.requiredLanguages.length > 0) {
          await tx.jobRequiredLanguage.createMany({
            data: dto.requiredLanguages.map((l) => ({
              jobOfferId: offerId,
              languageCode: l.languageCode,
              minProficiencyLevel: l.minProficiencyLevel,
              isMandatory: l.isMandatory ?? true,
            })),
          });
        }
      }

      return tx.jobOffer.update({
        where: { id: offerId },
        data: {
          title: dto.title !== undefined ? dto.title.trim() : undefined,
          offerType: dto.offerType,
          contractSubType: dto.contractSubType,
          requiredDegreeLevel: dto.requiredDegreeLevel,
          targetSpecialtyId: dto.targetSpecialtyId,
          regionCode: dto.regionCode,
          cityName:
            dto.cityName !== undefined ? dto.cityName.trim() : undefined,
          minExperienceMonths: dto.minExperienceMonths,
          isExperienceMandatory: dto.isExperienceMandatory,
          startDate:
            dto.startDate !== undefined ? new Date(dto.startDate) : undefined,
          durationMonths: dto.durationMonths,
          remunerationStipend:
            dto.remunerationStipend !== undefined
              ? dto.remunerationStipend?.trim() || null
              : undefined,
          description:
            dto.description !== undefined ? dto.description.trim() : undefined,
        },
        include: OFFER_DETAIL_INCLUDE,
      });
    });
  }

  /**
   * Publication d'une offre (DRAFT / PAUSED -> PUBLISHED).
   * Règle métier DCTF : Seule une organisation au statut VERIFIED peut publier des offres.
   * Journalise l'action 'OFFER_PUBLISH' dans AUDIT_LOGS.
   */
  async publishOffer(
    organizationId: string,
    offerId: string,
    userId: string,
    context: OfferRequestContext = {},
  ) {
    const offer = await this.prisma.jobOffer.findUnique({
      where: { id: offerId },
      include: {
        organization: {
          select: {
            id: true,
            verificationStatus: true,
            isActive: true,
          },
        },
      },
    });

    if (!offer || offer.organizationId !== organizationId) {
      throw new NotFoundException('Job offer not found in this organization');
    }

    if (offer.organization.verificationStatus !== VerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Organization must be verified (VERIFIED) before publishing job offers',
      );
    }

    if (offer.status === 'PUBLISHED') {
      throw new BadRequestException('Job offer is already published');
    }

    if (offer.status !== 'DRAFT' && offer.status !== 'PAUSED') {
      throw new BadRequestException(
        `Cannot publish a job offer from status ${offer.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const published = await tx.jobOffer.update({
        where: { id: offerId },
        data: {
          status: 'PUBLISHED',
          publishedAt: offer.publishedAt ?? new Date(),
        },
        include: OFFER_DETAIL_INCLUDE,
      });

      await this.auditService.recordInTx(tx, {
        action: 'OFFER_PUBLISH',
        userId,
        entityType: 'JOB_OFFER',
        entityId: offerId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        details: {
          organizationId,
          previousStatus: offer.status,
          newStatus: 'PUBLISHED',
        },
      });

      return published;
    });
  }

  /**
   * Fermeture d'une offre publiée (PUBLISHED / PAUSED -> CLOSED).
   */
  async closeOffer(organizationId: string, offerId: string) {
    const offer = await this.prisma.jobOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer || offer.organizationId !== organizationId) {
      throw new NotFoundException('Job offer not found in this organization');
    }

    if (offer.status === 'CLOSED') {
      throw new BadRequestException('Job offer is already closed');
    }

    if (offer.status !== 'PUBLISHED' && offer.status !== 'PAUSED') {
      throw new BadRequestException(
        `Cannot close a job offer with status ${offer.status}`,
      );
    }

    return this.prisma.jobOffer.update({
      where: { id: offerId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
      include: OFFER_DETAIL_INCLUDE,
    });
  }

  /**
   * Archivage d'une offre (* -> ARCHIVED).
   * Réservé aux rôles OWNER, ADMIN et SYSTEM_ADMIN (DCTF §4.2).
   */
  async archiveOffer(organizationId: string, offerId: string) {
    const offer = await this.prisma.jobOffer.findUnique({
      where: { id: offerId },
    });

    if (!offer || offer.organizationId !== organizationId) {
      throw new NotFoundException('Job offer not found in this organization');
    }

    if (offer.status === 'ARCHIVED') {
      throw new BadRequestException('Job offer is already archived');
    }

    return this.prisma.jobOffer.update({
      where: { id: offerId },
      data: {
        status: 'ARCHIVED',
        closedAt: offer.closedAt ?? new Date(),
      },
      include: OFFER_DETAIL_INCLUDE,
    });
  }

  private async validateTargetSpecialty(specialtyId: string) {
    const specialty = await this.prisma.refSpecialty.findUnique({
      where: { id: specialtyId },
      select: { id: true, isActive: true },
    });

    if (!specialty || !specialty.isActive) {
      throw new BadRequestException('Target specialty not found or inactive');
    }
  }

  private async validateSkillsAndLanguages(
    skills?: OfferRequiredSkillItemDto[],
    languages?: OfferRequiredLanguageItemDto[],
  ) {
    if (skills && skills.length > 0) {
      const skillIds = skills.map((s) => s.skillId);
      const uniqueSkillIds = new Set(skillIds);
      if (uniqueSkillIds.size !== skillIds.length) {
        throw new BadRequestException(
          'Duplicate skillId in requiredSkills is not allowed',
        );
      }

      const foundSkills = await this.prisma.refSkill.findMany({
        where: { id: { in: skillIds } },
        select: { id: true },
      });

      if (foundSkills.length !== skillIds.length) {
        throw new BadRequestException(
          'One or more skillIds do not exist in the skills reference catalog',
        );
      }
    }

    if (languages && languages.length > 0) {
      const langCodes = languages.map((l) => l.languageCode);
      const uniqueLangCodes = new Set(langCodes);
      if (uniqueLangCodes.size !== langCodes.length) {
        throw new BadRequestException(
          'Duplicate languageCode in requiredLanguages is not allowed',
        );
      }
    }
  }
}
