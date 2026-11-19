import {
  PrismaClient,
  GlobalRole,
  OrgMemberRole,
  OrganizationType,
  VerificationStatus,
  DegreeLevel,
  OfferType,
} from '@prisma/client';
import * as argon2 from 'argon2';

const ARGON2ID_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

const prisma = new PrismaClient();

// Préfixe et domaine stricts pour l'isolation complète des données de démonstration
export const DEMO_IDENTIFIER_PREFIX = '[DÉMO]';
export const DEMO_EMAIL_DOMAIN = '@demo.psyrekrute.ma';

interface DemoOfferSpec {
  id: string; // UUID déterministe fixe pour idempotence absolue
  title: string;
  offerType: OfferType;
  contractSubType: string;
  requiredDegreeLevel: DegreeLevel;
  specialtyCode: string;
  regionCode: string;
  cityName: string;
  minExperienceMonths: number;
  isExperienceMandatory: boolean;
  durationMonths?: number;
  remunerationStipend?: string;
  description: string;
  orgKey: string;
}

async function main() {
  console.log('--- Seeding 30 Démonstration Job Offers (PsyRekrute MVP) ---');

  // 1. Spécialités requises
  const specialties = await prisma.refSpecialty.findMany();
  const specMap = new Map<string, string>();
  for (const s of specialties) {
    specMap.set(s.code, s.id);
  }

  // 2. Compte Recruteur Démo dédié
  const demoRecruiterEmail = `recruteur${DEMO_EMAIL_DOMAIN}`;
  const passwordHash = await argon2.hash('DemoRecruiter2026!', ARGON2ID_OPTIONS);
  const recruiterUser = await prisma.user.upsert({
    where: { email: demoRecruiterEmail },
    update: {
      passwordHash,
      isActive: true,
      globalRole: GlobalRole.ORGANIZATION_USER,
    },
    create: {
      email: demoRecruiterEmail,
      passwordHash,
      globalRole: GlobalRole.ORGANIZATION_USER,
      preferredLocale: 'fr',
      isActive: true,
      isEmailVerified: true,
    },
  });

  // 3. Organismes de Démonstration (Diversifiés selon DCTF)
  const demoOrgs = [
    {
      key: 'org_rabat_centre',
      legalName: `${DEMO_IDENTIFIER_PREFIX} Centre Psycho-Éducatif Al Amal`,
      tradeName: `${DEMO_IDENTIFIER_PREFIX} Centre Al Amal`,
      organizationType: OrganizationType.CMPP,
      identifierIce: '999000000000001',
      phone: '+212537000001',
      email: `contact-alamal${DEMO_EMAIL_DOMAIN}`,
      regionCode: 'MA-04',
      cityName: 'Rabat',
      addressLine: 'Avenue de France, Agdal, Rabat',
    },
    {
      key: 'org_rabat_asso',
      legalName: `${DEMO_IDENTIFIER_PREFIX} Association Rayon d'Espoir Neurodéveloppement`,
      tradeName: `${DEMO_IDENTIFIER_PREFIX} Rayon d'Espoir`,
      organizationType: OrganizationType.ASSOCIATION,
      identifierIce: '999000000000002',
      phone: '+212537000002',
      email: `contact-rayondespoir${DEMO_EMAIL_DOMAIN}`,
      regionCode: 'MA-04',
      cityName: 'Rabat',
      addressLine: 'Quartier Hassan, Rabat',
    },
    {
      key: 'org_rabat_soutien',
      legalName: `${DEMO_IDENTIFIER_PREFIX} École Inclusive et Soutien Bouregreg`,
      tradeName: `${DEMO_IDENTIFIER_PREFIX} École Inclusive Rabat`,
      organizationType: OrganizationType.ECOLE_INCLUSIVE,
      identifierIce: '999000000000003',
      phone: '+212537000003',
      email: `contact-reussite${DEMO_EMAIL_DOMAIN}`,
      regionCode: 'MA-04',
      cityName: 'Rabat',
      addressLine: 'Avenue Mohammed VI, Souissi, Rabat',
    },
    {
      key: 'org_casa_tsa',
      legalName: `${DEMO_IDENTIFIER_PREFIX} Association Marocaine pour l'Inclusion TSA`,
      tradeName: `${DEMO_IDENTIFIER_PREFIX} Inclusion TSA Maroc`,
      organizationType: OrganizationType.ASSOCIATION,
      identifierIce: '999000000000004',
      phone: '+212522000004',
      email: `contact-tsamaroc${DEMO_EMAIL_DOMAIN}`,
      regionCode: 'MA-06',
      cityName: 'Casablanca',
      addressLine: 'Boulevard Ghandi, Casablanca',
    },
    {
      key: 'org_casa_cabinet',
      legalName: `${DEMO_IDENTIFIER_PREFIX} Cabinet de Neuropsychologie de l'Enfant Anfa`,
      tradeName: `${DEMO_IDENTIFIER_PREFIX} Neuropsychologie Anfa`,
      organizationType: OrganizationType.CABINET_LIBERAL,
      identifierIce: '999000000000005',
      phone: '+212522000005',
      email: `contact-neuroanfa${DEMO_EMAIL_DOMAIN}`,
      regionCode: 'MA-06',
      cityName: 'Casablanca',
      addressLine: 'Boulevard d\'Anfa, Casablanca',
    },
    {
      key: 'org_casa_medico',
      legalName: `${DEMO_IDENTIFIER_PREFIX} Clinique Spécialisée Sidi Maarouf`,
      tradeName: `${DEMO_IDENTIFIER_PREFIX} Clinique Sidi Maarouf`,
      organizationType: OrganizationType.CLINIQUE_SPECIALISEE,
      identifierIce: '999000000000006',
      phone: '+212522000006',
      email: `contact-cmesidi${DEMO_EMAIL_DOMAIN}`,
      regionCode: 'MA-06',
      cityName: 'Casablanca',
      addressLine: 'Zenith Millenium, Sidi Maarouf, Casablanca',
    },
    {
      key: 'org_fes_institut',
      legalName: `${DEMO_IDENTIFIER_PREFIX} Institut des Troubles des Apprentissages et Remédiation Fès`,
      tradeName: `${DEMO_IDENTIFIER_PREFIX} Institut DYS & Remédiation Fès`,
      organizationType: OrganizationType.CMPP,
      identifierIce: '999000000000007',
      phone: '+212535000007',
      email: `contact-dysfes${DEMO_EMAIL_DOMAIN}`,
      regionCode: 'MA-03',
      cityName: 'Fès',
      addressLine: 'Route d\'Immouzer, Fès',
    },
    {
      key: 'org_fes_medico',
      legalName: `${DEMO_IDENTIFIER_PREFIX} Clinique Psycho-Sociale Fès Médina`,
      tradeName: `${DEMO_IDENTIFIER_PREFIX} Clinique Fès Médina`,
      organizationType: OrganizationType.CLINIQUE_SPECIALISEE,
      identifierIce: '999000000000008',
      phone: '+212535000008',
      email: `contact-cmsfes${DEMO_EMAIL_DOMAIN}`,
      regionCode: 'MA-03',
      cityName: 'Fès',
      addressLine: 'Avenue des F.A.R, Ville Nouvelle, Fès',
    },
    {
      key: 'org_marrakech_social',
      legalName: `${DEMO_IDENTIFIER_PREFIX} École Inclusive et Sociale Al Massira Marrakech`,
      tradeName: `${DEMO_IDENTIFIER_PREFIX} École Al Massira Marrakech`,
      organizationType: OrganizationType.ECOLE_INCLUSIVE,
      identifierIce: '999000000000009',
      phone: '+212524000009',
      email: `contact-massiramarrakech${DEMO_EMAIL_DOMAIN}`,
      regionCode: 'MA-07',
      cityName: 'Marrakech',
      addressLine: 'Quartier Guéliz, Marrakech',
    },
    {
      key: 'org_marrakech_eveil',
      legalName: `${DEMO_IDENTIFIER_PREFIX} Centre d'Éveil et Psychoéducation de l'Atlas`,
      tradeName: `${DEMO_IDENTIFIER_PREFIX} Éveil Atlas Marrakech`,
      organizationType: OrganizationType.CMPP,
      identifierIce: '999000000000010',
      phone: '+212524000010',
      email: `contact-eveilatlas${DEMO_EMAIL_DOMAIN}`,
      regionCode: 'MA-07',
      cityName: 'Marrakech',
      addressLine: 'Avenue Mohammed VI, Marrakech',
    },
    {
      key: 'org_sale_cabinet',
      legalName: `${DEMO_IDENTIFIER_PREFIX} Cabinet de Psychopédagogie et Soutien Bouregreg Salé`,
      tradeName: `${DEMO_IDENTIFIER_PREFIX} Psychopédagogie Salé`,
      organizationType: OrganizationType.CABINET_LIBERAL,
      identifierIce: '999000000000011',
      phone: '+212537000011',
      email: `contact-bouregregsale${DEMO_EMAIL_DOMAIN}`,
      regionCode: 'MA-04',
      cityName: 'Salé',
      addressLine: 'Tabriquet, Salé',
    },
    {
      key: 'org_sale_asso',
      legalName: `${DEMO_IDENTIFIER_PREFIX} Association Espoir Apprentissage et Inclusion Salé`,
      tradeName: `${DEMO_IDENTIFIER_PREFIX} Espoir Apprentissage Salé`,
      organizationType: OrganizationType.ASSOCIATION,
      identifierIce: '999000000000012',
      phone: '+212537000012',
      email: `contact-espoirsale${DEMO_EMAIL_DOMAIN}`,
      regionCode: 'MA-04',
      cityName: 'Salé',
      addressLine: 'Bettana, Salé',
    },
  ];

  const orgRecordMap = new Map<string, { orgId: string; memberId: string }>();

  for (const org of demoOrgs) {
    const createdOrg = await prisma.organization.upsert({
      where: { identifierIce: org.identifierIce },
      update: {
        legalName: org.legalName,
        tradeName: org.tradeName,
        organizationType: org.organizationType,
        phone: org.phone,
        email: org.email,
        regionCode: org.regionCode,
        cityName: org.cityName,
        addressLine: org.addressLine,
        verificationStatus: VerificationStatus.VERIFIED,
        verifiedAt: new Date(),
        isActive: true,
      },
      create: {
        legalName: org.legalName,
        tradeName: org.tradeName,
        organizationType: org.organizationType,
        identifierIce: org.identifierIce,
        phone: org.phone,
        email: org.email,
        regionCode: org.regionCode,
        cityName: org.cityName,
        addressLine: org.addressLine,
        verificationStatus: VerificationStatus.VERIFIED,
        verifiedAt: new Date(),
        isActive: true,
      },
    });

    const membership = await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: createdOrg.id,
          userId: recruiterUser.id,
        },
      },
      update: { role: OrgMemberRole.ADMIN },
      create: {
        organizationId: createdOrg.id,
        userId: recruiterUser.id,
        role: OrgMemberRole.ADMIN,
      },
    });

    orgRecordMap.set(org.key, { orgId: createdOrg.id, memberId: membership.id });
  }

  // 4. Exactement 30 Offres de Démonstration Réparties Strictement :
  // - 10 Stages PFA (STAGE_OBSERVATION)
  // - 10 Stages PFE (STAGE_PFE)
  // - 10 Emplois (EMPLOI : CDI ou CDD)
  // Villes : Rabat (7), Casablanca (7), Fès (6), Marrakech (5), Salé (5)
  const demoOffersSpecs: DemoOfferSpec[] = [
    // -------------------------------------------------------------------------
    // RABAT (7 offres : 2 PFA, 2 PFE, 3 Emplois)
    // -------------------------------------------------------------------------
    {
      id: 'd0000001-0000-4000-8000-000000000001',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFA – Observation Clinique et Développement de l'Enfant`,
      offerType: OfferType.STAGE_OBSERVATION,
      contractSubType: 'STAGE_PFA',
      requiredDegreeLevel: DegreeLevel.BAC_3,
      specialtyCode: 'PSY_CLIN_CHILD',
      regionCode: 'MA-04',
      cityName: 'Rabat',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 2,
      remunerationStipend: 'Gratification de stage',
      description:
        'Stage d\'observation clinique au sein d\'une équipe pluridisciplinaire. Découverte des consultations de psychologie infantile, participation aux réunions cliniques et initiation à l\'observation standardisée des comportements socio-émotionnels.',
      orgKey: 'org_rabat_centre',
    },
    {
      id: 'd0000001-0000-4000-8000-000000000002',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFA – Initiation à la Psychoéducation en Établissement Scolaire`,
      offerType: OfferType.STAGE_OBSERVATION,
      contractSubType: 'STAGE_PFA',
      requiredDegreeLevel: DegreeLevel.BAC_3,
      specialtyCode: 'PSY_EDU_DEV',
      regionCode: 'MA-04',
      cityName: 'Rabat',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 3,
      remunerationStipend: 'Indemnité de transport',
      description:
        'Observation des dispositifs de soutien scolaire et de prévention des difficultés d\'apprentissage en milieu éducatif. Accompagnement d\'un psychoéducateur lors d\'ateliers collectifs de gestion des émotions et de concentration.',
      orgKey: 'org_rabat_asso',
    },
    {
      id: 'd0000001-0000-4000-8000-000000000003',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFE – Évaluation Psychométrique et Bilans WISC-V`,
      offerType: OfferType.STAGE_PFE,
      contractSubType: 'STAGE_PFE',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'PSY_CLIN_CHILD',
      regionCode: 'MA-04',
      cityName: 'Rabat',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 6,
      remunerationStipend: '2 500 MAD / mois',
      description:
        'Stage de fin d\'études axé sur la pratique supervisée du bilan psychologique de l\'enfant et de l\'adolescent. Co-passation des échelles de Wechsler (WISC-V), cotation, rédaction de comptes-rendus et restitution aux familles.',
      orgKey: 'org_rabat_centre',
    },
    {
      id: 'd0000001-0000-4000-8000-000000000004',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFE – Accompagnement Inclusif d'Enfants avec Troubles Neurodéveloppementaux`,
      offerType: OfferType.STAGE_PFE,
      contractSubType: 'STAGE_PFE',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'AUTISM_TSA',
      regionCode: 'MA-04',
      cityName: 'Rabat',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 6,
      remunerationStipend: '2 000 MAD / mois',
      description:
        'Conception et évaluation d\'un programme d\'inclusion scolaire adapté pour des enfants présentant un trouble du spectre de l\'autisme. Travail en synergie avec les enseignants, AESH et familles.',
      orgKey: 'org_rabat_asso',
    },
    {
      id: 'd0000001-0000-4000-8000-000000000005',
      title: `${DEMO_IDENTIFIER_PREFIX} Psychologue de l'Éducation – Référent Orientation et Apprentissages (CDI)`,
      offerType: OfferType.EMPLOI,
      contractSubType: 'CDI',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'PSY_EDU_DEV',
      regionCode: 'MA-04',
      cityName: 'Rabat',
      minExperienceMonths: 12,
      isExperienceMandatory: true,
      durationMonths: undefined,
      remunerationStipend: '8 500 - 10 500 MAD',
      description:
        'Poste en CDI pour un psychologue de l\'éducation confirmé. Missions : bilans d\'orientation scolaire, remédiation méthodologique, animation de groupes de parole élèves et médiation parents-équipe pédagogique.',
      orgKey: 'org_rabat_soutien',
    },
    {
      id: 'd0000001-0000-4000-8000-000000000006',
      title: `${DEMO_IDENTIFIER_PREFIX} Neuropsychologue Infantile – Prise en charge TDAH et DYS (CDI)`,
      offerType: OfferType.EMPLOI,
      contractSubType: 'CDI',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'NEUROPSY_LEARN',
      regionCode: 'MA-04',
      cityName: 'Rabat',
      minExperienceMonths: 24,
      isExperienceMandatory: true,
      durationMonths: undefined,
      remunerationStipend: '9 000 - 12 000 MAD',
      description:
        'Recrutement en CDI d\'un neuropsychologue spécialisé en pédiatrie. Diagnostic différentiel des troubles attentionnels (TDA/H) et dysfonctionnements exécutifs, bilans TEA-Ch / NEPSY-II et prise en charge rééducative.',
      orgKey: 'org_rabat_centre',
    },
    {
      id: 'd0000001-0000-4000-8000-000000000007',
      title: `${DEMO_IDENTIFIER_PREFIX} Psycho-éducateur Coordinateur de Projets Personnalisés (CDD)`,
      offerType: OfferType.EMPLOI,
      contractSubType: 'CDD',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'PSYCHO_EDU_SPEC',
      regionCode: 'MA-04',
      cityName: 'Rabat',
      minExperienceMonths: 6,
      isExperienceMandatory: false,
      durationMonths: 12,
      remunerationStipend: '7 500 MAD / mois',
      description:
        'Poste en CDD de 12 mois renouvelable. Coordination des projets personnalisés d\'intervention (PPI), suivi des objectifs éducatifs comportementaux et animation des temps d\'intégration scolaire et sociale.',
      orgKey: 'org_rabat_asso',
    },

    // -------------------------------------------------------------------------
    // CASABLANCA (7 offres : 2 PFA, 3 PFE, 2 Emplois)
    // -------------------------------------------------------------------------
    {
      id: 'd0000002-0000-4000-8000-000000000001',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFA – Observation des Méthodes Comportementales TSA (ABA/TEACCH)`,
      offerType: OfferType.STAGE_OBSERVATION,
      contractSubType: 'STAGE_PFA',
      requiredDegreeLevel: DegreeLevel.BAC_3,
      specialtyCode: 'AUTISM_TSA',
      regionCode: 'MA-06',
      cityName: 'Casablanca',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 2,
      remunerationStipend: 'Gratification de stage',
      description:
        'Sensibilisation aux approches recommandées dans l\'accompagnement de l\'autisme. Observation des séances individuelles ABA, structuration visuelle TEACCH et communication alternative PECS.',
      orgKey: 'org_casa_tsa',
    },
    {
      id: 'd0000002-0000-4000-8000-000000000002',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFA – Découverte des Bilans Neuropsychologiques Infantile`,
      offerType: OfferType.STAGE_OBSERVATION,
      contractSubType: 'STAGE_PFA',
      requiredDegreeLevel: DegreeLevel.BAC_3,
      specialtyCode: 'NEUROPSY_LEARN',
      regionCode: 'MA-06',
      cityName: 'Casablanca',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 2,
      remunerationStipend: 'Indemnité de déplacement',
      description:
        'Immersion en cabinet libéral de référence. Observation de l\'anamnèse, découverte des outils d\'évaluation cognitive chez l\'enfant et participation à la saisie des grilles de cotation sous supervision.',
      orgKey: 'org_casa_cabinet',
    },
    {
      id: 'd0000002-0000-4000-8000-000000000003',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFE – Mise en Œuvre de Programmes Éducatifs Structurés TSA`,
      offerType: OfferType.STAGE_PFE,
      contractSubType: 'STAGE_PFE',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'AUTISM_TSA',
      regionCode: 'MA-06',
      cityName: 'Casablanca',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 6,
      remunerationStipend: '2 800 MAD / mois',
      description:
        'Conduite d\'interventions éducatives supervisées basées sur l\'analyse appliquée du comportement. Mesure des progrès, adaptation des supports de communication et guidance des accompagnants.',
      orgKey: 'org_casa_tsa',
    },
    {
      id: 'd0000002-0000-4000-8000-000000000004',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFE – Remédiation Cognitive des Fonctions Exécutives chez l'Adolescent`,
      offerType: OfferType.STAGE_PFE,
      contractSubType: 'STAGE_PFE',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'REMED_COGNITIVE',
      regionCode: 'MA-06',
      cityName: 'Casablanca',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 6,
      remunerationStipend: '3 000 MAD / mois',
      description:
        'Développement et validation d\'un module de remédiation métacognitive pour collégiens et lycéens présentant des difficultés d\'organisation, d\'inhibition et de flexibilité mentale.',
      orgKey: 'org_casa_cabinet',
    },
    {
      id: 'd0000002-0000-4000-8000-000000000005',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFE – Prévention du Décrochage Scolaire et Soutien Psycho-affectif`,
      offerType: OfferType.STAGE_PFE,
      contractSubType: 'STAGE_PFE',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'PSY_EDU_DEV',
      regionCode: 'MA-06',
      cityName: 'Casablanca',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 5,
      remunerationStipend: '2 200 MAD / mois',
      description:
        'Enquête de terrain et mise en place d\'entretiens d\'écoute active auprès d\'adolescents scolarisés en zone périurbaine. Élaboration de recommandations de soutien pour la communauté éducative.',
      orgKey: 'org_casa_medico',
    },
    {
      id: 'd0000002-0000-4000-8000-000000000006',
      title: `${DEMO_IDENTIFIER_PREFIX} Neuropsychologue Clinicien – Diagnostic des Troubles Spécifiques d'Apprentissage (CDI)`,
      offerType: OfferType.EMPLOI,
      contractSubType: 'CDI',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'NEUROPSY_LEARN',
      regionCode: 'MA-06',
      cityName: 'Casablanca',
      minExperienceMonths: 24,
      isExperienceMandatory: true,
      durationMonths: undefined,
      remunerationStipend: '10 000 - 13 000 MAD',
      description:
        'Prise en charge intégrale des bilans neuropsychologiques de la petite enfance à l\'adolescence. Collaboration étroite avec orthophonistes, psychomotriciens et neuropédiatres.',
      orgKey: 'org_casa_cabinet',
    },
    {
      id: 'd0000002-0000-4000-8000-000000000007',
      title: `${DEMO_IDENTIFIER_PREFIX} Responsable d'Unité Psycho-Éducative TSA (CDI)`,
      offerType: OfferType.EMPLOI,
      contractSubType: 'CDI',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'AUTISM_TSA',
      regionCode: 'MA-06',
      cityName: 'Casablanca',
      minExperienceMonths: 36,
      isExperienceMandatory: true,
      durationMonths: undefined,
      remunerationStipend: '11 000 - 14 000 MAD',
      description:
        'Poste de coordination clinique et pédagogique pour une structure associative d\'envergure. Supervision des intervenants psycho-éducatifs, validation des programmes et interface avec les institutions.',
      orgKey: 'org_casa_tsa',
    },

    // -------------------------------------------------------------------------
    // FÈS (6 offres : 2 PFA, 2 PFE, 2 Emplois)
    // -------------------------------------------------------------------------
    {
      id: 'd0000003-0000-4000-8000-000000000001',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFA – Sensibilisation à la Psychopédagogie et Remédiation`,
      offerType: OfferType.STAGE_OBSERVATION,
      contractSubType: 'STAGE_PFA',
      requiredDegreeLevel: DegreeLevel.BAC_3,
      specialtyCode: 'REMED_COGNITIVE',
      regionCode: 'MA-03',
      cityName: 'Fès',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 2,
      remunerationStipend: 'Indemnité de stage',
      description:
        'Découverte des méthodes de remédiation cognitive pour enfants en difficulté de lecture et de calcul. Observation de séances de remédiation instrumentale et de gestion mentale.',
      orgKey: 'org_fes_institut',
    },
    {
      id: 'd0000003-0000-4000-8000-000000000002',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFA – Pratique de l'Observation en Milieu Médico-Social`,
      offerType: OfferType.STAGE_OBSERVATION,
      contractSubType: 'STAGE_PFA',
      requiredDegreeLevel: DegreeLevel.BAC_3,
      specialtyCode: 'PSYCHO_EDU_SPEC',
      regionCode: 'MA-03',
      cityName: 'Fès',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 3,
      remunerationStipend: 'Gratification de stage',
      description:
        'Observation des dynamiques de groupe et des pratiques d\'accompagnement éducatif auprès d\'enfants en situation de vulnérabilité psychosociale.',
      orgKey: 'org_fes_medico',
    },
    {
      id: 'd0000003-0000-4000-8000-000000000003',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFE – Protocole de Remédiation Neurocognitive chez l'Enfant Dyslexique`,
      offerType: OfferType.STAGE_PFE,
      contractSubType: 'STAGE_PFE',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'NEUROPSY_LEARN',
      regionCode: 'MA-03',
      cityName: 'Fès',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 6,
      remunerationStipend: '2 200 MAD / mois',
      description:
        'Évaluation pré/post-intervention d\'un protocole de remédiation phonologique et visuo-attentionnelle chez des élèves du primaire diagnostiqués dyslexiques-dysorthographiques.',
      orgKey: 'org_fes_institut',
    },
    {
      id: 'd0000003-0000-4000-8000-000000000004',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFE – Guidance Parentale et Accompagnement des Familles`,
      offerType: OfferType.STAGE_PFE,
      contractSubType: 'STAGE_PFE',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'PSY_CLIN_CHILD',
      regionCode: 'MA-03',
      cityName: 'Fès',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 6,
      remunerationStipend: '2 000 MAD / mois',
      description:
        'Animation co-supervisée de groupes de psychoéducation parentale (programme Barkley pour parents d\'enfants TDAH et ateliers de communication bienveillante).',
      orgKey: 'org_fes_medico',
    },
    {
      id: 'd0000003-0000-4000-8000-000000000005',
      title: `${DEMO_IDENTIFIER_PREFIX} Psychopédagogue – Réhabilitation Cognitive et Métacognition (CDI)`,
      offerType: OfferType.EMPLOI,
      contractSubType: 'CDI',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'REMED_COGNITIVE',
      regionCode: 'MA-03',
      cityName: 'Fès',
      minExperienceMonths: 12,
      isExperienceMandatory: true,
      durationMonths: undefined,
      remunerationStipend: '8 000 - 9 500 MAD',
      description:
        'Poste pérenne en CDI au sein d\'un institut spécialisé. Conception de plans d\'intervention personnalisés, entraînement des stratégies cognitives et accompagnement à la scolarisation.',
      orgKey: 'org_fes_institut',
    },
    {
      id: 'd0000003-0000-4000-8000-000000000006',
      title: `${DEMO_IDENTIFIER_PREFIX} Psychologue Clinicien de l'Enfant – Consultation et Bilans (CDD)`,
      offerType: OfferType.EMPLOI,
      contractSubType: 'CDD',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'PSY_CLIN_CHILD',
      regionCode: 'MA-03',
      cityName: 'Fès',
      minExperienceMonths: 12,
      isExperienceMandatory: true,
      durationMonths: 12,
      remunerationStipend: '7 500 MAD / mois',
      description:
        'Consultations psychologiques d\'enfants d\'âge scolaire, passation de bilans psycho-affectifs et cognitifs, rédaction de bilans cliniques et travail de réseau avec les écoles de la région Fès-Meknès.',
      orgKey: 'org_fes_medico',
    },

    // -------------------------------------------------------------------------
    // MARRAKECH (5 offres : 2 PFA, 1 PFE, 2 Emplois)
    // -------------------------------------------------------------------------
    {
      id: 'd0000004-0000-4000-8000-000000000001',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFA – Initiation au Soutien Éducatif et Socio-émotionnel`,
      offerType: OfferType.STAGE_OBSERVATION,
      contractSubType: 'STAGE_PFA',
      requiredDegreeLevel: DegreeLevel.BAC_3,
      specialtyCode: 'PSY_EDU_DEV',
      regionCode: 'MA-07',
      cityName: 'Marrakech',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 2,
      remunerationStipend: 'Gratification de stage',
      description:
        'Observation des actions éducatives et psychopédagogiques en faveur d\'enfants présentant des retards scolaires. Participation à la vie institutionnelle du centre.',
      orgKey: 'org_marrakech_social',
    },
    {
      id: 'd0000004-0000-4000-8000-000000000002',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFA – Observation des Ateliers d'Éveil et Communication Adaptée`,
      offerType: OfferType.STAGE_OBSERVATION,
      contractSubType: 'STAGE_PFA',
      requiredDegreeLevel: DegreeLevel.BAC_3,
      specialtyCode: 'PSYCHO_EDU_SPEC',
      regionCode: 'MA-07',
      cityName: 'Marrakech',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 3,
      remunerationStipend: 'Indemnité forfaitaire',
      description:
        'Découverte des techniques d\'éveil sensoriel, de communication gestuelle et d\'animation d\'ateliers adaptés pour jeunes enfants avec besoins éducatifs particuliers.',
      orgKey: 'org_marrakech_eveil',
    },
    {
      id: 'd0000004-0000-4000-8000-000000000003',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFE – Ingénierie d'Ateliers Psycho-éducatifs Inclusifs`,
      offerType: OfferType.STAGE_PFE,
      contractSubType: 'STAGE_PFE',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'PSYCHO_EDU_SPEC',
      regionCode: 'MA-07',
      cityName: 'Marrakech',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 6,
      remunerationStipend: '2 500 MAD / mois',
      description:
        'Mise en place d\'un cycle d\'ateliers axés sur le développement des compétences psychosociales (CPS) et l\'autorégulation émotionnelle en contexte d\'école inclusive.',
      orgKey: 'org_marrakech_eveil',
    },
    {
      id: 'd0000004-0000-4000-8000-000000000004',
      title: `${DEMO_IDENTIFIER_PREFIX} Psychologue Scolaire – Accompagnement Élèves à Besoins Spécifiques (CDI)`,
      offerType: OfferType.EMPLOI,
      contractSubType: 'CDI',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'PSY_EDU_DEV',
      regionCode: 'MA-07',
      cityName: 'Marrakech',
      minExperienceMonths: 18,
      isExperienceMandatory: true,
      durationMonths: undefined,
      remunerationStipend: '8 500 - 10 000 MAD',
      description:
        'Intégration d\'un pôle d\'inclusion scolaire. Dépistage des difficultés scolaires, mise en œuvre d\'aménagements pédagogiques (PAI/PPS) et sensibilisation des enseignants.',
      orgKey: 'org_marrakech_social',
    },
    {
      id: 'd0000004-0000-4000-8000-000000000005',
      title: `${DEMO_IDENTIFIER_PREFIX} Spécialiste Intervention Précoce TSA et Troubles du Spectre (CDI)`,
      offerType: OfferType.EMPLOI,
      contractSubType: 'CDI',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'AUTISM_TSA',
      regionCode: 'MA-07',
      cityName: 'Marrakech',
      minExperienceMonths: 24,
      isExperienceMandatory: true,
      durationMonths: undefined,
      remunerationStipend: '9 000 - 11 500 MAD',
      description:
        'Coordination des prises en charge précoces (modèle de Denver / ESDM et ABA précoce). Évaluation des compétences développementales (PEP-3 / VB-MAPP) et guidance parentale structurée.',
      orgKey: 'org_marrakech_eveil',
    },

    // -------------------------------------------------------------------------
    // SALÉ (5 offres : 2 PFA, 2 PFE, 1 Emploi)
    // -------------------------------------------------------------------------
    {
      id: 'd0000005-0000-4000-8000-000000000001',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFA – Découverte du Bilan Psycho-éducatif en Cabinet`,
      offerType: OfferType.STAGE_OBSERVATION,
      contractSubType: 'STAGE_PFA',
      requiredDegreeLevel: DegreeLevel.BAC_3,
      specialtyCode: 'PSY_EDU_DEV',
      regionCode: 'MA-04',
      cityName: 'Salé',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 2,
      remunerationStipend: 'Indemnité de transport',
      description:
        'Observation directe d\'évaluations psychopédagogiques, entretien avec l\'enfant et sa famille, et familiarisation avec les échelles d\'évaluation scolaire standardisées.',
      orgKey: 'org_sale_cabinet',
    },
    {
      id: 'd0000005-0000-4000-8000-000000000002',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFA – Observation de l'Inclusion Scolaire des Enfants TDAH`,
      offerType: OfferType.STAGE_OBSERVATION,
      contractSubType: 'STAGE_PFA',
      requiredDegreeLevel: DegreeLevel.BAC_3,
      specialtyCode: 'NEUROPSY_LEARN',
      regionCode: 'MA-04',
      cityName: 'Salé',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 3,
      remunerationStipend: 'Gratification de stage',
      description:
        'Sensibilisation aux adaptations de classe pour enfants avec trouble du déficit de l\'attention avec ou sans hyperactivité. Observation en situation d\'apprentissage.',
      orgKey: 'org_sale_asso',
    },
    {
      id: 'd0000005-0000-4000-8000-000000000003',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFE – Évaluation des Habiletés Sociales chez l'Enfant Neuroatypique`,
      offerType: OfferType.STAGE_PFE,
      contractSubType: 'STAGE_PFE',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'PSY_CLIN_CHILD',
      regionCode: 'MA-04',
      cityName: 'Salé',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 6,
      remunerationStipend: '2 400 MAD / mois',
      description:
        'Animation supervisée de groupes d\'entraînement aux habiletés sociales (GHS) pour enfants et pré-adolescents. Évaluation standardisée des interactions et retours aux familles.',
      orgKey: 'org_sale_cabinet',
    },
    {
      id: 'd0000005-0000-4000-8000-000000000004',
      title: `${DEMO_IDENTIFIER_PREFIX} Stage PFE – Stratégies d'Adaptation Scolaire pour Élèves Dyspraxiques`,
      offerType: OfferType.STAGE_PFE,
      contractSubType: 'STAGE_PFE',
      requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
      specialtyCode: 'NEUROPSY_LEARN',
      regionCode: 'MA-04',
      cityName: 'Salé',
      minExperienceMonths: 0,
      isExperienceMandatory: false,
      durationMonths: 6,
      remunerationStipend: '2 200 MAD / mois',
      description:
        'Élaboration d\'une boîte à outils d\'adaptations pédagogiques et informatiques (logiciels de compensation, géométrie adaptée) pour élèves présentant une dyspraxie visuo-spatiale.',
      orgKey: 'org_sale_asso',
    },
    {
      id: 'd0000005-0000-4000-8000-000000000005',
      title: `${DEMO_IDENTIFIER_PREFIX} Éducateur Spécialisé Référent – Accompagnement Individualisé (CDI)`,
      offerType: OfferType.EMPLOI,
      contractSubType: 'CDI',
      requiredDegreeLevel: DegreeLevel.BAC_3,
      specialtyCode: 'PSYCHO_EDU_SPEC',
      regionCode: 'MA-04',
      cityName: 'Salé',
      minExperienceMonths: 12,
      isExperienceMandatory: true,
      durationMonths: undefined,
      remunerationStipend: '6 500 - 8 000 MAD',
      description:
        'Accompagnement quotidien d\'enfants à besoins spécifiques en milieu associatif. Mise en œuvre des plans éducatifs individualisés et animation d\'ateliers d\'autonomie et d\'expression.',
      orgKey: 'org_sale_asso',
    },
  ];

  console.log(`Préparation de ${demoOffersSpecs.length} offres de démonstration...`);

  let countCreated = 0;
  for (const spec of demoOffersSpecs) {
    const orgData = orgRecordMap.get(spec.orgKey);
    if (!orgData) {
      throw new Error(`Organisme introuvable pour la clé ${spec.orgKey}`);
    }

    const specialtyId = specMap.get(spec.specialtyCode);
    if (!specialtyId) {
      throw new Error(`Spécialité introuvable pour le code ${spec.specialtyCode}`);
    }

    await prisma.jobOffer.upsert({
      where: { id: spec.id },
      update: {
        title: spec.title,
        offerType: spec.offerType,
        contractSubType: spec.contractSubType,
        requiredDegreeLevel: spec.requiredDegreeLevel,
        targetSpecialtyId: specialtyId,
        regionCode: spec.regionCode,
        cityName: spec.cityName,
        minExperienceMonths: spec.minExperienceMonths,
        isExperienceMandatory: spec.isExperienceMandatory,
        startDate: new Date('2026-12-01'),
        durationMonths: spec.durationMonths ?? null,
        remunerationStipend: spec.remunerationStipend ?? null,
        description: spec.description,
        status: 'PUBLISHED',
        publishedAt: new Date('2026-11-15T10:00:00Z'),
        organizationId: orgData.orgId,
        authorMemberId: orgData.memberId,
      },
      create: {
        id: spec.id,
        title: spec.title,
        offerType: spec.offerType,
        contractSubType: spec.contractSubType,
        requiredDegreeLevel: spec.requiredDegreeLevel,
        targetSpecialtyId: specialtyId,
        regionCode: spec.regionCode,
        cityName: spec.cityName,
        minExperienceMonths: spec.minExperienceMonths,
        isExperienceMandatory: spec.isExperienceMandatory,
        startDate: new Date('2026-12-01'),
        durationMonths: spec.durationMonths ?? null,
        remunerationStipend: spec.remunerationStipend ?? null,
        description: spec.description,
        status: 'PUBLISHED',
        publishedAt: new Date('2026-11-15T10:00:00Z'),
        organizationId: orgData.orgId,
        authorMemberId: orgData.memberId,
      },
    });
    countCreated++;
  }

  console.log(`[Succès] ${countCreated} offres de démonstration générées avec succès.`);
  console.log('--- Répartition vérifiée :');
  console.log('- 10 Stages PFA (STAGE_OBSERVATION)');
  console.log('- 10 Stages PFE (STAGE_PFE)');
  console.log('- 10 Emplois (CDI / CDD)');
  console.log('- Géographie : Rabat (7), Casablanca (7), Fès (6), Marrakech (5), Salé (5)');
}

main()
  .catch((e) => {
    console.error('Erreur lors du seed des offres démo :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
