import { MatchingService, MatchingWeights, CandidateData, OfferData } from './matching.service';

describe('MatchingService (DCTF v3.1 Golden Test Vectors)', () => {
  let service: MatchingService;

  beforeEach(() => {
    service = new MatchingService();
  });

  it('Cas 1: Stage d Observation -> doit calculer exactement 100.00%', () => {
    const weights: MatchingWeights = {
      weightFormation: 0.35,
      weightSkills: 0.15,
      weightExperience: 0.05,
      weightLocation: 0.25,
      weightLanguages: 0.10,
      weightAvailability: 0.10,
    };

    const offer: OfferData = {
      requiredDegreeLevelValue: 1, // Bac+3 L3
      requiredSkills: [
        { code: 'TSA_NOTIONS', minRequiredLevel: 1, isMandatory: false, weight: 1 },
      ],
      minExperienceMonths: 0,
      requiredLanguages: [
        { code: 'AR_DARIJA', minProficiency: 4, isMandatory: true },
        { code: 'FR', minProficiency: 3, isMandatory: true },
      ],
    };

    const candidate: CandidateData = {
      degreeLevelValue: 1,
      isCurrentlyEnrolled: true,
      specialtyTaxonomyFactor: 1.0,
      skills: [{ code: 'TSA_NOTIONS', level: 1, isVerified: false }],
      totalExperienceMonths: 0,
      hasTargetAudienceExperience: false,
      isSameCity: true,
      isSameRegion: true,
      hasMobility: false,
      openToRelocation: false,
      languages: [
        { code: 'AR_DARIJA', proficiency: 4 },
        { code: 'FR', proficiency: 3 },
      ],
      isImmediate: true,
      delayDays: 0,
    };

    const result = service.calculateMatchScore(candidate, offer, weights);

    expect(result.subScores.formation).toBe(100.00);
    expect(result.subScores.skills).toBe(100.00);
    expect(result.subScores.experience).toBe(100.00);
    expect(result.subScores.location).toBe(100.00);
    expect(result.subScores.languages).toBe(100.00);
    expect(result.subScores.availability).toBe(100.00);
    expect(result.totalScore).toBe(100.00);
  });

  it('Cas 2: Stage PFE -> doit calculer exactement 93.25%', () => {
    const weights: MatchingWeights = {
      weightFormation: 0.30,
      weightSkills: 0.25,
      weightExperience: 0.15,
      weightLocation: 0.15,
      weightLanguages: 0.10,
      weightAvailability: 0.05,
    };

    const offer: OfferData = {
      requiredDegreeLevelValue: 3, // Bac+8 / Doctorat (Stage PFE de recherche)
      requiredSkills: [
        { code: 'WISC_V', minRequiredLevel: 3, isMandatory: true, weight: 2 },
        { code: 'PECS', minRequiredLevel: 2, isMandatory: false, weight: 1 },
      ],
      minExperienceMonths: 2,
      requiredLanguages: [
        { code: 'AR_DARIJA', minProficiency: 3, isMandatory: true },
        { code: 'FR', minProficiency: 3, isMandatory: true },
      ],
    };

    const candidate: CandidateData = {
      degreeLevelValue: 2,
      isCurrentlyEnrolled: true,
      specialtyTaxonomyFactor: 1.0,
      skills: [
        { code: 'WISC_V', level: 3, isVerified: true }, // attestation verified
      ],
      totalExperienceMonths: 3,
      hasTargetAudienceExperience: false,
      isSameCity: false,
      isSameRegion: true,
      hasMobility: true, // Kenitra to Rabat with mobility
      openToRelocation: false,
      languages: [
        { code: 'AR_DARIJA', proficiency: 4 },
        { code: 'FR', proficiency: 3 },
      ],
      isImmediate: true,
      delayDays: 0,
    };

    const result = service.calculateMatchScore(candidate, offer, weights);

    expect(result.subScores.formation).toBe(85.00);
    expect(result.subScores.skills).toBe(100.00);
    expect(result.subScores.experience).toBe(100.00);
    expect(result.subScores.location).toBe(85.00);
    expect(result.subScores.languages).toBe(100.00);
    expect(result.subScores.availability).toBe(100.00);
    expect(result.totalScore).toBe(93.25);
  });

  it('Cas 3: Emploi Salarie -> doit calculer exactement 82.33%', () => {
    const weights: MatchingWeights = {
      weightFormation: 0.20,
      weightSkills: 0.30,
      weightExperience: 0.25,
      weightLocation: 0.10,
      weightLanguages: 0.10,
      weightAvailability: 0.05,
    };

    const offer: OfferData = {
      requiredDegreeLevelValue: 1, // Bac+3
      requiredSkills: [
        { code: 'TEACCH', minRequiredLevel: 3, isMandatory: true, weight: 2 },
        { code: 'PPI', minRequiredLevel: 3, isMandatory: true, weight: 1 },
        { code: 'ABA', minRequiredLevel: 2, isMandatory: false, weight: 1 },
      ],
      minExperienceMonths: 24,
      requiredLanguages: [
        { code: 'AR_DARIJA', minProficiency: 3, isMandatory: true },
        { code: 'FR', minProficiency: 3, isMandatory: true },
      ],
    };

    const candidate: CandidateData = {
      degreeLevelValue: 1,
      isCurrentlyEnrolled: false,
      specialtyTaxonomyFactor: 0.75, // Specialité soeur
      skills: [
        { code: 'TEACCH', level: 4, isVerified: true },
        { code: 'PPI', level: 2, isVerified: false },
        { code: 'ABA', level: 2, isVerified: false },
      ],
      totalExperienceMonths: 14,
      hasTargetAudienceExperience: true, // +10 bonus TSA
      isSameCity: false,
      isSameRegion: false,
      hasMobility: false,
      openToRelocation: true, // Prete a demenager
      languages: [
        { code: 'AR_DARIJA', proficiency: 3 },
        { code: 'FR', proficiency: 3 },
      ],
      isImmediate: false,
      delayDays: 30, // 1 mois preavis
    };

    const result = service.calculateMatchScore(candidate, offer, weights);

    expect(result.subScores.formation).toBe(75.00);
    expect(result.subScores.skills).toBe(100.00);
    expect(result.subScores.experience).toBe(68.33);
    expect(result.subScores.location).toBe(75.00);
    expect(result.subScores.languages).toBe(100.00);
    expect(result.subScores.availability).toBe(55.00);
    expect(result.totalScore).toBe(82.33);
  });
});
