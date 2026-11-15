import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AvailabilityStatus,
  DegreeLevel,
  GlobalRole,
  LanguageProficiency,
  OfferType,
  OrgMemberRole,
  Prisma,
  SkillLevel,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { QueryRecommendedCandidatesDto } from './dto/query-recommended-candidates.dto';
import {
  CandidateData,
  ENROLLMENT_CREDIT_BY_OFFER_TYPE,
  MatchingService,
  MatchingWeights,
  OfferData,
} from './matching.service';

export interface RecommendedCandidateView {
  candidateId: string;
  displayName: string;
  isAnonymized: boolean;
  profileCategory: string;
  regionCode: string;
  cityName: string;
  mobilityRadiusKm: number;
  openToRelocation: boolean;
  availabilityStatus: string;
  totalScore: number;
  subScores: {
    formation: number;
    skills: number;
    experience: number;
    location: number;
    languages: number;
    availability: number;
  };
  mandatoryCriteriaSatisfied: boolean;
  explanations: {
    strengths: string[];
    gaps: string[];
  };
  algoVersion: string;
  calculatedAt: Date;
  hasApplied: boolean;
  isInvited: boolean;
}

const DEFAULT_WEIGHTS_BY_OFFER_TYPE: Record<OfferType, MatchingWeights> = {
  [OfferType.STAGE_OBSERVATION]: {
    weightFormation: 0.35,
    weightSkills: 0.15,
    weightExperience: 0.05,
    weightLocation: 0.25,
    weightLanguages: 0.1,
    weightAvailability: 0.1,
  },
  [OfferType.STAGE_PFE]: {
    weightFormation: 0.3,
    weightSkills: 0.25,
    weightExperience: 0.15,
    weightLocation: 0.15,
    weightLanguages: 0.1,
    weightAvailability: 0.05,
  },
  [OfferType.EMPLOI]: {
    weightFormation: 0.2,
    weightSkills: 0.3,
    weightExperience: 0.25,
    weightLocation: 0.1,
    weightLanguages: 0.1,
    weightAvailability: 0.05,
  },
};

const ALLOWED_RECRUITER_ROLES: readonly OrgMemberRole[] = [
  OrgMemberRole.OWNER,
  OrgMemberRole.ADMIN,
  OrgMemberRole.RECRUITER,
];

@Injectable()
export class MatchingOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
  ) {}

  /**
   * Calcule, persiste dans MATCH_RESULTS et retourne les candidats recommandés du vivier
   * pour une offre donnée (DCTF §5, §6, §8.5, §9.4, DEC-02 / D4).
   */
  async getRecommendedCandidatesForOffer(
    offerId: string,
    actor: { userId: string; globalRole: GlobalRole },
    query: QueryRecommendedCandidatesDto,
    expectedOrganizationId?: string,
  ) {
    const offer = await this.prisma.jobOffer.findUnique({
      where: { id: offerId },
      include: {
        organization: {
          select: {
            id: true,
            isActive: true,
            verificationStatus: true,
          },
        },
        targetSpecialty: true,
        requiredSkills: {
          include: {
            skill: true,
          },
        },
        requiredLanguages: true,
      },
    });

    if (!offer) {
      throw new NotFoundException('Job offer not found');
    }

    if (
      expectedOrganizationId &&
      offer.organizationId !== expectedOrganizationId
    ) {
      throw new NotFoundException('Job offer not found in this organization');
    }

    await this.verifyRecruiterAccess(
      offer.organizationId,
      offer.organization.isActive,
      offer.organization.verificationStatus,
      actor,
    );

    // 1. Récupérer la configuration de pondération (MATCHING_CONFIG ou défaut DCTF §5.1)
    const configRow = await this.prisma.matchingConfig.findUnique({
      where: { offerType: offer.offerType },
    });

    const weights: MatchingWeights =
      configRow && configRow.isActive
        ? {
            weightFormation: Number(configRow.weightFormation),
            weightSkills: Number(configRow.weightSkills),
            weightExperience: Number(configRow.weightExperience),
            weightLocation: Number(configRow.weightLocation),
            weightLanguages: Number(configRow.weightLanguages),
            weightAvailability: Number(configRow.weightAvailability),
          }
        : DEFAULT_WEIGHTS_BY_OFFER_TYPE[offer.offerType];

    const algoVersion =
      configRow && configRow.isActive
        ? configRow.algoVersion
        : 'v3.1-deterministic';

    // 2. Charger l'arbre des spécialités et des compétences pour le calcul taxonomique
    const [allSpecialties, allSkills] = await Promise.all([
      this.prisma.refSpecialty.findMany({
        select: { id: true, parentId: true, code: true },
      }),
      this.prisma.refSkill.findMany({
        select: { id: true, parentId: true, code: true },
      }),
    ]);

    const specialtyMap = new Map(allSpecialties.map((s) => [s.id, s]));
    const skillByIdMap = new Map(allSkills.map((s) => [s.id, s]));

    // 3. Récupérer tous les profils candidats actifs et leur dernier consentement TALENT_POOL_MATCHING
    const candidateProfiles = await this.prisma.candidateProfile.findMany({
      where: {
        isDeleted: false,
        user: {
          isActive: true,
          globalRole: GlobalRole.CANDIDATE,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            consents: {
              where: { consentType: 'TALENT_POOL_MATCHING' },
              orderBy: { consentedAt: 'desc' },
              take: 1,
            },
          },
        },
        education: true,
        experiences: true,
        skills: {
          include: {
            skill: true,
          },
        },
        languages: true,
        applications: {
          where: { jobOfferId: offer.id },
          select: {
            id: true,
            origin: true,
            currentStatus: true,
          },
        },
      },
    });

    // 4. Filtrer strictement sur le consentement actif TALENT_POOL_MATCHING === true
    const eligibleCandidates = candidateProfiles.filter((cand) => {
      const latestConsent = cand.user.consents[0];
      return Boolean(latestConsent && latestConsent.hasConsented === true);
    });

    const eligibleCandidateIds = eligibleCandidates.map((c) => c.id);

    // Purger immédiatement de MATCH_RESULTS tout candidat ayant retiré son consentement ou supprimé son profil
    await this.prisma.matchResult.deleteMany({
      where: {
        jobOfferId: offer.id,
        candidateId: {
          notIn: eligibleCandidateIds,
        },
      },
    });

    // 5. Préparer OfferData pour MatchingService
    const offerData: OfferData = {
      requiredDegreeLevelValue: this.mapDegreeLevel(offer.requiredDegreeLevel),
      enrollmentCreditScore: ENROLLMENT_CREDIT_BY_OFFER_TYPE[offer.offerType],
      requiredSkills: offer.requiredSkills.map((rs) => ({
        code: rs.skill.code,
        minRequiredLevel: this.mapSkillLevel(rs.minRequiredLevel),
        isMandatory: rs.isMandatory,
        weight: rs.weight,
      })),
      minExperienceMonths: offer.minExperienceMonths,
      requiredLanguages: offer.requiredLanguages.map((rl) => ({
        code: rl.languageCode,
        minProficiency: this.mapLanguageProficiency(rl.minProficiencyLevel),
        isMandatory: rl.isMandatory,
      })),
    };

    // 6. Calculer et persister dans MATCH_RESULTS pour chaque candidat éligible
    for (const cand of eligibleCandidates) {
      const candidateData = this.buildCandidateData(
        cand,
        offer,
        specialtyMap,
        skillByIdMap,
      );

      const scoreResult = this.matchingService.calculateMatchScore(
        candidateData,
        offerData,
        weights,
      );

      const explanationsJson: Prisma.InputJsonValue = {
        strengths: scoreResult.explanations.strengths,
        gaps: scoreResult.explanations.gaps,
      };

      await this.prisma.matchResult.upsert({
        where: {
          jobOfferId_candidateId: {
            jobOfferId: offer.id,
            candidateId: cand.id,
          },
        },
        update: {
          totalScore: scoreResult.totalScore,
          scoreFormation: scoreResult.subScores.formation,
          scoreSkills: scoreResult.subScores.skills,
          scoreExperience: scoreResult.subScores.experience,
          scoreLocation: scoreResult.subScores.location,
          scoreLanguages: scoreResult.subScores.languages,
          scoreAvailability: scoreResult.subScores.availability,
          explanations: explanationsJson,
          mandatoryCriteriaSatisfied: scoreResult.mandatoryCriteriaSatisfied,
          algoVersion,
          calculatedAt: new Date(),
        },
        create: {
          jobOfferId: offer.id,
          candidateId: cand.id,
          totalScore: scoreResult.totalScore,
          scoreFormation: scoreResult.subScores.formation,
          scoreSkills: scoreResult.subScores.skills,
          scoreExperience: scoreResult.subScores.experience,
          scoreLocation: scoreResult.subScores.location,
          scoreLanguages: scoreResult.subScores.languages,
          scoreAvailability: scoreResult.subScores.availability,
          explanations: explanationsJson,
          mandatoryCriteriaSatisfied: scoreResult.mandatoryCriteriaSatisfied,
          algoVersion,
        },
      });
    }

    // 7. Récupérer les résultats persistés filtrés par minScore et triés par totalScore décroissant
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const minScore = query.minScore ?? 60;
    const skip = (page - 1) * limit;

    const whereMatch: Prisma.MatchResultWhereInput = {
      jobOfferId: offer.id,
      candidateId: { in: eligibleCandidateIds },
      totalScore: { gte: minScore },
    };

    const [total, persistedResults] = await Promise.all([
      this.prisma.matchResult.count({ where: whereMatch }),
      this.prisma.matchResult.findMany({
        where: whereMatch,
        orderBy: [{ totalScore: 'desc' }, { calculatedAt: 'desc' }],
        skip,
        take: limit,
        include: {
          candidate: {
            select: {
              id: true,
              profileCategory: true,
              regionCode: true,
              cityName: true,
              mobilityRadiusKm: true,
              openToRelocation: true,
              availabilityStatus: true,
              isAnonymizedInPool: true,
              applications: {
                where: { jobOfferId: offer.id },
                select: {
                  origin: true,
                  currentStatus: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // 8. Projection strictement anonymisée (aucun nom, prénom, email, téléphone ni CV)
    const data: RecommendedCandidateView[] = persistedResults.map((row) => {
      const appRecord = row.candidate.applications[0];
      const rawExplanations = row.explanations as {
        strengths?: unknown;
        gaps?: unknown;
      } | null;

      return {
        candidateId: row.candidateId,
        displayName: `#CAND-${row.candidateId.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
        isAnonymized: true,
        profileCategory: row.candidate.profileCategory,
        regionCode: row.candidate.regionCode,
        cityName: row.candidate.cityName,
        mobilityRadiusKm: row.candidate.mobilityRadiusKm,
        openToRelocation: row.candidate.openToRelocation,
        availabilityStatus: row.candidate.availabilityStatus,
        totalScore: Number(row.totalScore),
        subScores: {
          formation: Number(row.scoreFormation),
          skills: Number(row.scoreSkills),
          experience: Number(row.scoreExperience),
          location: Number(row.scoreLocation),
          languages: Number(row.scoreLanguages),
          availability: Number(row.scoreAvailability),
        },
        mandatoryCriteriaSatisfied: row.mandatoryCriteriaSatisfied,
        explanations: {
          strengths: Array.isArray(rawExplanations?.strengths)
            ? (rawExplanations.strengths as string[])
            : [],
          gaps: Array.isArray(rawExplanations?.gaps)
            ? (rawExplanations.gaps as string[])
            : [],
        },
        algoVersion: row.algoVersion,
        calculatedAt: row.calculatedAt,
        hasApplied: Boolean(
          appRecord &&
            (appRecord.origin === 'DIRECT_APPLY' ||
              appRecord.currentStatus !== 'INVITED'),
        ),
        isInvited: Boolean(
          appRecord && appRecord.origin === 'CENTER_INVITATION',
        ),
      };
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private async verifyRecruiterAccess(
    organizationId: string,
    isOrgActive: boolean,
    verificationStatus: VerificationStatus,
    actor: { userId: string; globalRole: GlobalRole },
  ) {
    if (actor.globalRole === GlobalRole.CANDIDATE) {
      throw new ForbiddenException(
        'Access denied: candidates cannot access recommended candidates',
      );
    }

    if (!isOrgActive) {
      throw new ForbiddenException(
        'Access denied: target organization is inactive',
      );
    }

    if (actor.globalRole === GlobalRole.ORGANIZATION_USER) {
      const membership = await this.prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: actor.userId,
          },
        },
      });

      if (!membership) {
        throw new ForbiddenException(
          'Access denied: user is not a member of the organization owning this job offer',
        );
      }

      if (!ALLOWED_RECRUITER_ROLES.includes(membership.role)) {
        throw new ForbiddenException(
          'Access denied: insufficient organization member role to access talent pool recommendations',
        );
      }
    } else if (actor.globalRole !== GlobalRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('Access denied: invalid global role');
    }

    if (verificationStatus !== VerificationStatus.VERIFIED) {
      throw new ForbiddenException(
        'Organization must be verified (VERIFIED) before accessing talent pool recommendations',
      );
    }
  }

  private buildCandidateData(
    cand: {
      primarySpecialtyId: string;
      regionCode: string;
      cityName: string;
      mobilityRadiusKm: number;
      openToRelocation: boolean;
      availabilityStatus: AvailabilityStatus;
      availableFrom: Date | null;
      education: Array<{
        degreeLevel: DegreeLevel;
        specialtyId: string;
        isCurrentlyEnrolled: boolean;
      }>;
      experiences: Array<{
        totalMonths: number;
        targetAudience: string | null;
      }>;
      skills: Array<{
        skillId: string;
        level: SkillLevel;
        isVerified: boolean;
        skill: { id: string; code: string; parentId: string | null };
      }>;
      languages: Array<{
        languageCode: string;
        proficiencyLevel: LanguageProficiency;
      }>;
    },
    offer: {
      targetSpecialtyId: string;
      regionCode: string;
      cityName: string;
      startDate: Date;
      requiredSkills: Array<{
        skillId: string;
        skill: { id: string; code: string; parentId: string | null };
      }>;
    },
    specialtyMap: Map<
      string,
      { id: string; parentId: string | null; code: string }
    >,
    skillByIdMap: Map<
      string,
      { id: string; parentId: string | null; code: string }
    >,
  ): CandidateData {
    // 1. Diplômes obtenus vs formations en cours (DCTF v3.1.1 §5.2.1)
    let degreeLevelValue = 0;
    let enrolledLevelValue = 0;

    for (const edu of cand.education) {
      const val = this.mapDegreeLevel(edu.degreeLevel);
      if (edu.isCurrentlyEnrolled) {
        if (val > enrolledLevelValue) {
          enrolledLevelValue = val;
        }
      } else {
        if (val > degreeLevelValue) {
          degreeLevelValue = val;
        }
      }
    }

    // Facteur taxonomique de spécialité (meilleure proximité entre spécialité principale / formations et spécialité de l'offre)
    const candidateSpecialtyIds = new Set<string>([
      cand.primarySpecialtyId,
      ...cand.education.map((e) => e.specialtyId),
    ]);

    let specialtyTaxonomyFactor = 0.25;
    for (const specId of candidateSpecialtyIds) {
      const factor = this.computeSpecialtyTaxonomyFactor(
        specId,
        offer.targetSpecialtyId,
        specialtyMap,
      );
      if (factor > specialtyTaxonomyFactor) {
        specialtyTaxonomyFactor = factor;
      }
    }

    // 2. Compétences (incluant la règle DCTF §5.2.2 d'abattement de 50% pour compétence connexe partageant le même parent_id)
    const mappedSkills: Array<{
      code: string;
      level: number;
      isVerified: boolean;
    }> = cand.skills.map((cs) => ({
      code: cs.skill.code,
      level: this.mapSkillLevel(cs.level),
      isVerified: cs.isVerified,
    }));

    for (const reqSkill of offer.requiredSkills) {
      const alreadyHasExact = mappedSkills.some(
        (s) => s.code === reqSkill.skill.code,
      );
      if (!alreadyHasExact) {
        const reqMeta = skillByIdMap.get(reqSkill.skillId);
        if (reqMeta) {
          let bestRelatedLevel = 0;
          for (const cs of cand.skills) {
            const candMeta = skillByIdMap.get(cs.skillId);
            if (candMeta && this.areSkillsRelated(candMeta, reqMeta)) {
              const relatedLevel = this.mapSkillLevel(cs.level) * 0.5;
              if (relatedLevel > bestRelatedLevel) {
                bestRelatedLevel = relatedLevel;
              }
            }
          }
          if (bestRelatedLevel > 0) {
            mappedSkills.push({
              code: reqSkill.skill.code,
              level: bestRelatedLevel,
              isVerified: false,
            });
          }
        }
      }
    }

    // 3. Expérience totale et bonus public cible
    const totalExperienceMonths = cand.experiences.reduce(
      (sum, exp) => sum + Math.max(0, exp.totalMonths),
      0,
    );
    const hasTargetAudienceExperience = cand.experiences.some(
      (exp) =>
        typeof exp.targetAudience === 'string' &&
        exp.targetAudience.trim().length > 0,
    );

    // 4. Localisation et mobilité
    const isSameCity =
      cand.cityName.trim().toLowerCase() ===
      offer.cityName.trim().toLowerCase();
    const isSameRegion =
      cand.regionCode.trim().toUpperCase() ===
      offer.regionCode.trim().toUpperCase();
    const hasMobility = cand.mobilityRadiusKm >= 30;

    // 5. Langues
    const languages = cand.languages.map((l) => ({
      code: l.languageCode,
      proficiency: this.mapLanguageProficiency(l.proficiencyLevel),
    }));

    // 6. Disponibilité
    let isImmediate = cand.availabilityStatus === AvailabilityStatus.IMMEDIATE;
    let delayDays = 0;

    if (!isImmediate) {
      if (cand.availableFrom) {
        const diffMs =
          new Date(cand.availableFrom).getTime() -
          new Date(offer.startDate).getTime();
        const computedDays = Math.round(diffMs / 86_400_000);
        if (computedDays <= 0) {
          isImmediate = true;
          delayDays = 0;
        } else {
          delayDays = computedDays;
        }
      } else {
        delayDays = 45;
      }
    }

    return {
      degreeLevelValue,
      enrolledLevelValue,
      specialtyTaxonomyFactor,
      skills: mappedSkills,
      totalExperienceMonths,
      hasTargetAudienceExperience,
      isSameCity,
      isSameRegion,
      hasMobility,
      openToRelocation: cand.openToRelocation,
      languages,
      isImmediate,
      delayDays,
    };
  }

  private computeSpecialtyTaxonomyFactor(
    candSpecId: string,
    targetSpecId: string,
    specialtyMap: Map<
      string,
      { id: string; parentId: string | null; code: string }
    >,
  ): number {
    if (candSpecId === targetSpecId) {
      return 1.0;
    }

    const candSpec = specialtyMap.get(candSpecId);
    const targetSpec = specialtyMap.get(targetSpecId);
    if (!candSpec || !targetSpec) {
      return 0.25;
    }

    // Spécialités sœurs (même parent_id non nul) ou lien direct parent-enfant
    if (
      (candSpec.parentId && candSpec.parentId === targetSpec.parentId) ||
      candSpec.parentId === targetSpec.id ||
      targetSpec.parentId === candSpec.id
    ) {
      return 0.75;
    }

    // Spécialités cousines (même grand-parent non nul)
    const candParent = candSpec.parentId
      ? specialtyMap.get(candSpec.parentId)
      : undefined;
    const targetParent = targetSpec.parentId
      ? specialtyMap.get(targetSpec.parentId)
      : undefined;

    if (
      candParent?.parentId &&
      targetParent?.parentId &&
      candParent.parentId === targetParent.parentId
    ) {
      return 0.5;
    }

    return 0.25;
  }

  private areSkillsRelated(
    skillA: { id: string; parentId: string | null },
    skillB: { id: string; parentId: string | null },
  ): boolean {
    if (skillA.id === skillB.id) return true;
    if (skillA.parentId && skillA.parentId === skillB.parentId) return true;
    if (skillA.parentId === skillB.id || skillB.parentId === skillA.id) {
      return true;
    }
    return false;
  }

  private mapDegreeLevel(level: DegreeLevel): number {
    switch (level) {
      case DegreeLevel.BAC_3:
      case DegreeLevel.DU_SPECIALISE:
      case DegreeLevel.DIPLOME_ETAT:
        return 1;
      case DegreeLevel.BAC_5_MASTER:
        return 2;
      case DegreeLevel.BAC_8_DOCTORAT:
        return 3;
      default:
        return 1;
    }
  }

  private mapSkillLevel(level: SkillLevel): number {
    switch (level) {
      case SkillLevel.NOTIONS:
        return 1;
      case SkillLevel.PRATIQUANT:
        return 2;
      case SkillLevel.AUTONOME:
        return 3;
      case SkillLevel.EXPERT:
        return 4;
      default:
        return 1;
    }
  }

  private mapLanguageProficiency(prof: LanguageProficiency): number {
    switch (prof) {
      case LanguageProficiency.NOTIONS:
        return 1;
      case LanguageProficiency.INTERMEDIAIRE:
        return 2;
      case LanguageProficiency.COURANT_PROFESSIONNEL:
        return 3;
      case LanguageProficiency.LANGUE_MATERNELLE:
        return 4;
      default:
        return 1;
    }
  }
}
