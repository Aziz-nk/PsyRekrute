import { Injectable } from '@nestjs/common';

export interface MatchingWeights {
  weightFormation: number;
  weightSkills: number;
  weightExperience: number;
  weightLocation: number;
  weightLanguages: number;
  weightAvailability: number;
}

export interface CandidateData {
  /**
   * Plus haut diplome OBTENU (un diplome en cours ne compte JAMAIS ici).
   * 0 = aucun diplome superieur obtenu, 1 = BAC_3, 2 = BAC_5, 3 = BAC_8.
   */
  degreeLevelValue: number;
  /**
   * Niveau de la formation ACTUELLEMENT SUIVIE (inscription en cours). 0 = aucune inscription.
   * Distinct du diplome obtenu : il ne satisfait une exigence que si l'offre l'accepte (voir OfferData.enrollmentCreditScore).
   */
  enrolledLevelValue: number;
  specialtyTaxonomyFactor: number; // 1.0 (exact), 0.75 (sister), 0.50 (cousin), 0.25 (other)
  skills: Array<{
    code: string;
    level: number; // 1: NOTIONS, 2: PRATIQUANT, 3: AUTONOME, 4: EXPERT
    isVerified: boolean;
  }>;
  totalExperienceMonths: number;
  hasTargetAudienceExperience: boolean;
  isSameCity: boolean;
  isSameRegion: boolean;
  hasMobility: boolean;
  openToRelocation: boolean;
  languages: Array<{
    code: string;
    proficiency: number; // 1: NOTIONS, 2: INTERMEDIAIRE, 3: COURANT, 4: MATERNELLE
  }>;
  isImmediate: boolean;
  delayDays: number;
}

export interface OfferData {
  requiredDegreeLevelValue: number;
  /**
   * Credit accorde a un candidat INSCRIT dans le niveau demande mais sans diplome obtenu (0..100).
   * Absent ou 0 = l'offre exige un diplome obtenu (cas des emplois).
   * Valeurs par defaut par type d'offre : voir ENROLLMENT_CREDIT_BY_OFFER_TYPE.
   */
  enrollmentCreditScore?: number;
  requiredSkills: Array<{
    code: string;
    minRequiredLevel: number;
    isMandatory: boolean;
    weight: number;
  }>;
  minExperienceMonths: number;
  requiredLanguages: Array<{
    code: string;
    minProficiency: number;
    isMandatory: boolean;
  }>;
}

export interface MatchScoreResult {
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
}

/**
 * Credit d'une INSCRIPTION dans le niveau exige (sans diplome obtenu), par type d'offre.
 * Derive des exemples chiffres du DCTF : Cas 1 (stage d'observation, L3 en cours => 100)
 * et Cas 2 (PFE, Master 2 en cours => 85). 0 = diplome obtenu exige (emploi).
 * Les ponderations par dimension ne sont PAS concernees.
 */
export const ENROLLMENT_CREDIT_BY_OFFER_TYPE = {
  STAGE_OBSERVATION: 100,
  STAGE_PFE: 85,
  EMPLOI: 0,
} as const;

@Injectable()
export class MatchingService {
  calculateMatchScore(
    candidate: CandidateData,
    offer: OfferData,
    weights: MatchingWeights,
  ): MatchScoreResult {
    const strengths: string[] = [];
    const gaps: string[] = [];
    let mandatoryCriteriaSatisfied = true;

    // 1. FORMATION (DCTF v3.1.1 §5.2.1 : diplome obtenu != formation en cours)
    const obtained = candidate.degreeLevelValue;
    const enrolled = candidate.enrolledLevelValue;
    const enrollmentCredit = Math.max(0, Math.min(100, offer.enrollmentCreditScore ?? 0));
    let scoreNiveau = 40;
    if (obtained >= offer.requiredDegreeLevelValue) {
      scoreNiveau = 100;
    } else if (enrollmentCredit > 0 && enrolled >= offer.requiredDegreeLevelValue) {
      scoreNiveau = enrollmentCredit; // inscription dans le niveau exige, acceptee par l'offre
      gaps.push('Diplôme requis en cours d\'obtention (inscription dans le niveau demandé)');
    } else if (enrolled >= offer.requiredDegreeLevelValue) {
      gaps.push('Diplôme requis non obtenu : une formation en cours ne satisfait pas cette offre');
    }
    let scoreFormation = Number((scoreNiveau * candidate.specialtyTaxonomyFactor).toFixed(2));
    if (obtained <= 0 && enrolled <= 0) {
      // DCTF v3.1 §5.2.1 : aucune formation renseignee => S_form = 0 et critere obligatoire non satisfait
      scoreFormation = 0;
      mandatoryCriteriaSatisfied = false;
      gaps.push('Aucune formation renseignée');
    }
    if (scoreFormation >= 80) {
      strengths.push('Formation et spécialité académique en adéquation');
    }

    // 2. SKILLS
    const mandatoryReqs = offer.requiredSkills.filter((s) => s.isMandatory);
    const desirableReqs = offer.requiredSkills.filter((s) => !s.isMandatory);

    let scoreSkillsOblig = 100;
    if (mandatoryReqs.length > 0) {
      let totalWeightedScore = 0;
      let totalWeights = 0;

      for (const req of mandatoryReqs) {
        const candSkill = candidate.skills.find((s) => s.code === req.code);
        const candLevel = candSkill ? candSkill.level : 0;
        let baseScore = 0;
        if (candLevel >= req.minRequiredLevel) {
          baseScore = 100;
        } else {
          baseScore = (candLevel / req.minRequiredLevel) * 100;
          if (candLevel === 0) {
            mandatoryCriteriaSatisfied = false;
            gaps.push(`Compétence requise manquante : ${req.code}`);
          }
        }

        const bonus = candSkill && candSkill.isVerified ? 0.15 : 0;
        const unitaire = Math.min(100, baseScore * (1 + bonus));
        totalWeightedScore += unitaire * req.weight;
        totalWeights += req.weight;

        if (unitaire >= 100) {
          strengths.push(`Compétence clé maîtrisée : ${req.code}`);
        }
      }
      scoreSkillsOblig = totalWeightedScore / totalWeights;
    }

    let bonusSouhait = 0;
    if (desirableReqs.length > 0) {
      let totalWeightedScore = 0;
      let totalWeights = 0;

      for (const req of desirableReqs) {
        const candSkill = candidate.skills.find((s) => s.code === req.code);
        const candLevel = candSkill ? candSkill.level : 0;
        let baseScore = 0;
        if (candLevel >= req.minRequiredLevel) {
          baseScore = 100;
        } else {
          baseScore = (candLevel / req.minRequiredLevel) * 100;
        }

        const bonus = candSkill && candSkill.isVerified ? 0.15 : 0;
        const unitaire = Math.min(100, baseScore * (1 + bonus));
        totalWeightedScore += unitaire * req.weight;
        totalWeights += req.weight;

        if (candLevel === 0) {
          gaps.push(`Compétence souhaitable non renseignée : ${req.code}`);
        }
      }
      bonusSouhait = Math.min(15, (totalWeightedScore / totalWeights) * 0.15);
    }

    const scoreSkills = Number(Math.min(100, scoreSkillsOblig + bonusSouhait).toFixed(2));

    // 3. EXPERIENCE
    let scoreExperience = 100;
    if (offer.minExperienceMonths > 0) {
      const ratio = Math.min(100, (candidate.totalExperienceMonths / offer.minExperienceMonths) * 100);
      const bonusPublic = candidate.hasTargetAudienceExperience ? 10 : 0;
      scoreExperience = Number(Math.min(100, ratio + bonusPublic).toFixed(2));
      if (candidate.totalExperienceMonths >= offer.minExperienceMonths) {
        strengths.push('Expérience pratique conforme ou supérieure aux exigences');
      } else {
        gaps.push(`Expérience inférieure au seuil souhaité (${candidate.totalExperienceMonths}/${offer.minExperienceMonths} mois)`);
      }
    }

    // 4. LOCATION
    let scoreLocation = 25;
    if (candidate.isSameCity) {
      scoreLocation = 100;
      strengths.push('Réside dans la même ville que la structure');
    } else if (candidate.isSameRegion) {
      scoreLocation = candidate.hasMobility ? 85 : 65;
    } else if (candidate.openToRelocation) {
      scoreLocation = 75;
    }

    // 5. LANGUAGES
    let scoreLanguages = 100;
    if (offer.requiredLanguages.length > 0) {
      let sum = 0;
      for (const req of offer.requiredLanguages) {
        const candLang = candidate.languages.find((l) => l.code === req.code);
        const candProf = candLang ? candLang.proficiency : 0;
        if (candProf >= req.minProficiency) {
          sum += 100;
        } else {
          sum += (candProf / req.minProficiency) * 100;
          if (candProf === 0 && req.isMandatory) {
            mandatoryCriteriaSatisfied = false;
            gaps.push(`Langue obligatoire manquante : ${req.code}`);
          }
        }
      }
      scoreLanguages = Number((sum / offer.requiredLanguages.length).toFixed(2));
    }

    // 6. AVAILABILITY
    let scoreAvailability = 20;
    if (candidate.isImmediate || candidate.delayDays <= 0) {
      scoreAvailability = 100;
    } else if (candidate.delayDays <= 30) {
      scoreAvailability = Number((100 - candidate.delayDays * 1.5).toFixed(2));
    } else {
      scoreAvailability = 40;
    }

    // GLOBAL WEIGHTED TOTAL
    const total =
      weights.weightFormation * scoreFormation +
      weights.weightSkills * scoreSkills +
      weights.weightExperience * scoreExperience +
      weights.weightLocation * scoreLocation +
      weights.weightLanguages * scoreLanguages +
      weights.weightAvailability * scoreAvailability;

    return {
      totalScore: Number(total.toFixed(2)),
      subScores: {
        formation: scoreFormation,
        skills: scoreSkills,
        experience: scoreExperience,
        location: scoreLocation,
        languages: scoreLanguages,
        availability: scoreAvailability,
      },
      mandatoryCriteriaSatisfied,
      explanations: {
        strengths,
        gaps,
      },
    };
  }
}
