import { MatchingService, CandidateData, OfferData, MatchingWeights, ENROLLMENT_CREDIT_BY_OFFER_TYPE } from './matching.service';

/**
 * Cas limites derives UNIQUEMENT des formules du DCTF v3.1 §5.2.
 * Aucune regle metier n'est modifiee ici : chaque valeur attendue est recalculable a la main.
 */
describe('MatchingService – cas limites (DCTF v3.1 §5.2)', () => {
  const service = new MatchingService();

  const weights: MatchingWeights = {
    weightFormation: 0.3,
    weightSkills: 0.25,
    weightExperience: 0.15,
    weightLocation: 0.15,
    weightLanguages: 0.1,
    weightAvailability: 0.05,
  };

  const candidate = (o: Partial<CandidateData> = {}): CandidateData => ({
    degreeLevelValue: 2,
    enrolledLevelValue: 0,
    specialtyTaxonomyFactor: 1,
    skills: [],
    totalExperienceMonths: 0,
    hasTargetAudienceExperience: false,
    isSameCity: true,
    isSameRegion: true,
    hasMobility: false,
    openToRelocation: false,
    languages: [],
    isImmediate: true,
    delayDays: 0,
    ...o,
  });

  const offer = (o: Partial<OfferData> = {}): OfferData => ({
    requiredDegreeLevelValue: 2,
    requiredSkills: [],
    minExperienceMonths: 0,
    requiredLanguages: [],
    ...o,
  });

  const run = (c: Partial<CandidateData>, of: Partial<OfferData> = {}) =>
    service.calculateMatchScore(candidate(c), offer(of), weights);

  describe('Formation : diplome OBTENU vs formation EN COURS (DCTF v3.1.1 §5.2.1)', () => {
    const PFE = { enrollmentCreditScore: ENROLLMENT_CREDIT_BY_OFFER_TYPE.STAGE_PFE };
    const OBS = { enrollmentCreditScore: ENROLLMENT_CREDIT_BY_OFFER_TYPE.STAGE_OBSERVATION };

    it('diplome obtenu au niveau exige ou superieur => 100', () => {
      expect(run({ degreeLevelValue: 2 }).subScores.formation).toBe(100);
      expect(run({ degreeLevelValue: 3 }).subScores.formation).toBe(100);
    });
    it('un diplome obtenu n est jamais degrade par une inscription en cours', () => {
      expect(run({ degreeLevelValue: 2, enrolledLevelValue: 3 }, PFE).subScores.formation).toBe(100);
    });

    describe('Emploi (diplome obtenu exige, aucun credit d inscription)', () => {
      it('Master 2 en cours (Licence obtenue) ne satisfait PAS une exigence Bac+5 => 40', () => {
        const r = run({ degreeLevelValue: 1, enrolledLevelValue: 2 }, { enrollmentCreditScore: 0 });
        expect(r.subScores.formation).toBe(40);
        expect(r.explanations.gaps.join(' ')).toContain('non obtenu');
      });
      it('credit absent (undefined) = meme comportement strict', () => {
        expect(run({ degreeLevelValue: 1, enrolledLevelValue: 2 }).subScores.formation).toBe(40);
      });
      it('le type EMPLOI du referentiel n accorde aucun credit', () => {
        expect(ENROLLMENT_CREDIT_BY_OFFER_TYPE.EMPLOI).toBe(0);
      });
    });

    describe('Stage PFE (inscription dans le niveau exige acceptee, credit 85)', () => {
      it('Master 2 en cours (Licence obtenue), offre Bac+5 => 85 (exemple DCTF Cas 2)', () => {
        expect(run({ degreeLevelValue: 1, enrolledLevelValue: 2 }, PFE).subScores.formation).toBe(85);
      });
      it('inscrit dans un niveau INFERIEUR a celui exige => 40', () => {
        expect(run({ degreeLevelValue: 0, enrolledLevelValue: 1 }, PFE).subScores.formation).toBe(40);
      });
      it('pas inscrit et diplome insuffisant => 40', () => {
        expect(run({ degreeLevelValue: 1, enrolledLevelValue: 0 }, PFE).subScores.formation).toBe(40);
      });
      it('le credit d inscription est multiplie par la specialite : 85 x 0.75 = 63.75', () => {
        expect(run({ degreeLevelValue: 1, enrolledLevelValue: 2, specialtyTaxonomyFactor: 0.75 }, PFE).subScores.formation).toBe(63.75);
      });
      it('une inscription acceptee est signalee comme diplome en cours d obtention', () => {
        const r = run({ degreeLevelValue: 1, enrolledLevelValue: 2 }, PFE);
        expect(r.explanations.gaps.join(' ')).toContain('en cours d\'obtention');
      });
    });

    describe('Stage d observation (credit 100 : le public cible est en cours de cursus)', () => {
      it('L3 en cours, offre Bac+3 => 100 (exemple DCTF Cas 1)', () => {
        expect(run({ degreeLevelValue: 0, enrolledLevelValue: 1 }, { ...OBS, requiredDegreeLevelValue: 1 }).subScores.formation).toBe(100);
      });
      it('un etudiant en cours de cursus n est PAS "sans formation" (critere obligatoire intact)', () => {
        expect(run({ degreeLevelValue: 0, enrolledLevelValue: 1 }, { ...OBS, requiredDegreeLevelValue: 1 }).mandatoryCriteriaSatisfied).toBe(true);
      });
    });

    it('niveau obtenu < exige, sans inscription => 40', () => {
      expect(run({ degreeLevelValue: 1 }, { requiredDegreeLevelValue: 3 }).subScores.formation).toBe(40);
    });
    it('specialite soeur (0.75) / cousine (0.5) / autre (0.25) multiplient le niveau', () => {
      expect(run({ specialtyTaxonomyFactor: 0.75 }).subScores.formation).toBe(75);
      expect(run({ specialtyTaxonomyFactor: 0.5 }).subScores.formation).toBe(50);
      expect(run({ specialtyTaxonomyFactor: 0.25 }).subScores.formation).toBe(25);
    });
    it('aucune formation (ni obtenue ni en cours) => 0 et critere obligatoire non satisfait', () => {
      const r = run({ degreeLevelValue: 0, enrolledLevelValue: 0 });
      expect(r.subScores.formation).toBe(0);
      expect(r.mandatoryCriteriaSatisfied).toBe(false);
    });
    it('les donnees candidat distinguent diplome obtenu et formation suivie (deux champs separes)', () => {
      const keys = Object.keys(candidate());
      expect(keys).toContain('degreeLevelValue');
      expect(keys).toContain('enrolledLevelValue');
      expect(keys).not.toContain('isCurrentlyEnrolled');
    });
  });
  describe('Competences', () => {
    const mandA = { code: 'A', minRequiredLevel: 3, isMandatory: true, weight: 1 };
    const desB = { code: 'B', minRequiredLevel: 2, isMandatory: false, weight: 1 };

    it('aucune competence obligatoire definie => base 100', () => {
      expect(run({}).subScores.skills).toBe(100);
    });
    it('competence obligatoire absente => 0 et critere obligatoire non satisfait', () => {
      const r = run({ skills: [] }, { requiredSkills: [mandA] });
      expect(r.subScores.skills).toBe(0);
      expect(r.mandatoryCriteriaSatisfied).toBe(false);
    });
    it('niveau partiel non verifie : 2/3 => 66.67', () => {
      expect(run({ skills: [{ code: 'A', level: 2, isVerified: false }] }, { requiredSkills: [mandA] }).subScores.skills).toBe(66.67);
    });
    it('bonus de verification x1.15 : 66.67 => 76.67', () => {
      expect(run({ skills: [{ code: 'A', level: 2, isVerified: true }] }, { requiredSkills: [mandA] }).subScores.skills).toBe(76.67);
    });
    it('bonus de verification ne depasse jamais 100', () => {
      expect(run({ skills: [{ code: 'A', level: 4, isVerified: true }] }, { requiredSkills: [mandA] }).subScores.skills).toBe(100);
    });
    it('competence souhaitable ABSENTE n abaisse jamais le score de base', () => {
      const base = run({ skills: [{ code: 'A', level: 2, isVerified: false }] }, { requiredSkills: [mandA] });
      const withDesirable = run({ skills: [{ code: 'A', level: 2, isVerified: false }] }, { requiredSkills: [mandA, desB] });
      expect(withDesirable.subScores.skills).toBe(base.subScores.skills);
    });
    it('competence souhaitable maitrisee => bonus +15 (66.67 + 15 = 81.67)', () => {
      const r = run(
        { skills: [{ code: 'A', level: 2, isVerified: false }, { code: 'B', level: 2, isVerified: false }] },
        { requiredSkills: [mandA, desB] },
      );
      expect(r.subScores.skills).toBe(81.67);
    });
    it('competence souhaitable partielle (1/2 => 50) => bonus 7.5 (74.17)', () => {
      const r = run(
        { skills: [{ code: 'A', level: 2, isVerified: false }, { code: 'B', level: 1, isVerified: false }] },
        { requiredSkills: [mandA, desB] },
      );
      expect(r.subScores.skills).toBe(74.17);
    });
    it('score competences plafonne a 100 meme avec bonus', () => {
      const r = run(
        { skills: [{ code: 'A', level: 3, isVerified: true }, { code: 'B', level: 4, isVerified: true }] },
        { requiredSkills: [mandA, desB] },
      );
      expect(r.subScores.skills).toBe(100);
    });
  });

  describe('Experience', () => {
    it('aucune experience requise => 100', () => {
      expect(run({ totalExperienceMonths: 0 }, { minExperienceMonths: 0 }).subScores.experience).toBe(100);
    });
    it('experience requise et aucune renseignee => 0', () => {
      expect(run({ totalExperienceMonths: 0 }, { minExperienceMonths: 4 }).subScores.experience).toBe(0);
    });
    it('ratio 2/4 => 50 ; +10 public cible => 60', () => {
      expect(run({ totalExperienceMonths: 2 }, { minExperienceMonths: 4 }).subScores.experience).toBe(50);
      expect(run({ totalExperienceMonths: 2, hasTargetAudienceExperience: true }, { minExperienceMonths: 4 }).subScores.experience).toBe(60);
    });
    it('plafonne a 100', () => {
      expect(run({ totalExperienceMonths: 12, hasTargetAudienceExperience: true }, { minExperienceMonths: 4 }).subScores.experience).toBe(100);
    });
  });

  describe('Localisation', () => {
    it('meme ville 100 / meme region 85 avec mobilite, 65 sans / autre region 75 si deplacement, 25 sinon', () => {
      expect(run({ isSameCity: true }).subScores.location).toBe(100);
      expect(run({ isSameCity: false, isSameRegion: true, hasMobility: true }).subScores.location).toBe(85);
      expect(run({ isSameCity: false, isSameRegion: true, hasMobility: false }).subScores.location).toBe(65);
      expect(run({ isSameCity: false, isSameRegion: false, openToRelocation: true }).subScores.location).toBe(75);
      expect(run({ isSameCity: false, isSameRegion: false, openToRelocation: false }).subScores.location).toBe(25);
    });
  });

  describe('Langues', () => {
    const fr = (m: boolean) => ({ code: 'FR', minProficiency: 3, isMandatory: m });
    it('aucune langue requise => 100', () => {
      expect(run({}).subScores.languages).toBe(100);
    });
    it('niveau partiel 2/3 => 66.67', () => {
      expect(run({ languages: [{ code: 'FR', proficiency: 2 }] }, { requiredLanguages: [fr(true)] }).subScores.languages).toBe(66.67);
    });
    it('langue obligatoire absente => 0 et critere obligatoire non satisfait', () => {
      const r = run({ languages: [] }, { requiredLanguages: [fr(true)] });
      expect(r.subScores.languages).toBe(0);
      expect(r.mandatoryCriteriaSatisfied).toBe(false);
    });
    it('langue NON obligatoire absente => 0 pour la langue mais critere obligatoire intact', () => {
      const r = run({ languages: [] }, { requiredLanguages: [fr(false)] });
      expect(r.subScores.languages).toBe(0);
      expect(r.mandatoryCriteriaSatisfied).toBe(true);
    });
  });

  describe('Disponibilite (bornes)', () => {
    it('immediate => 100 meme avec delai renseigne', () => {
      expect(run({ isImmediate: true, delayDays: 40 }).subScores.availability).toBe(100);
    });
    it('retard 0 => 100 ; 10 j => 85 ; 30 j => 55 ; 31 j => 40', () => {
      expect(run({ isImmediate: false, delayDays: 0 }).subScores.availability).toBe(100);
      expect(run({ isImmediate: false, delayDays: 10 }).subScores.availability).toBe(85);
      expect(run({ isImmediate: false, delayDays: 30 }).subScores.availability).toBe(55);
      expect(run({ isImmediate: false, delayDays: 31 }).subScores.availability).toBe(40);
    });
  });

  describe('Score global et non-discrimination', () => {
    it('somme des ponderations = 1', () => {
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    });
    it('profil parfait => 100 ; le total reste dans [0, 100]', () => {
      expect(run({}).totalScore).toBe(100);
      const worst = run(
        { degreeLevelValue: 0, enrolledLevelValue: 0, isSameCity: false, isSameRegion: false, isImmediate: false, delayDays: 90 },
        { minExperienceMonths: 6 },
      );
      expect(worst.totalScore).toBeGreaterThanOrEqual(0);
      expect(worst.totalScore).toBeLessThanOrEqual(100);
    });
    it('critere obligatoire manquant : un score est TOUJOURS retourne (aucun rejet automatique)', () => {
      const r = run({ skills: [] }, { requiredSkills: [{ code: 'A', minRequiredLevel: 3, isMandatory: true, weight: 1 }] });
      expect(r.mandatoryCriteriaSatisfied).toBe(false);
      expect(typeof r.totalScore).toBe('number');
      expect(r.totalScore).toBeGreaterThan(0);
    });
    it('les donnees du candidat ne contiennent aucun champ discriminant (age, genre, photo, nom)', () => {
      const forbidden = ['age', 'gender', 'sex', 'photo', 'firstName', 'lastName', 'birthDate', 'nationality'];
      const keys = Object.keys(candidate());
      for (const k of forbidden) expect(keys).not.toContain(k);
    });
    it('resultat deterministe (memes entrees => memes sorties)', () => {
      const c = candidate({ degreeLevelValue: 1, enrolledLevelValue: 2 });
      expect(service.calculateMatchScore(c, offer(), weights)).toEqual(service.calculateMatchScore(c, offer(), weights));
    });
  });
});


