import { PrismaClient, GlobalRole, OrgMemberRole, ProfileCategory, AvailabilityStatus, OrganizationType, VerificationStatus, DegreeLevel, ExperienceType, SkillLevel, LanguageProficiency, OfferType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding PsyRekrute Database (DCTF v3.1)...');

  // 1. REF_SPECIALTIES (6 Spécialités validées)
  const specialtiesData = [
    {
      code: 'PSY_EDU_DEV',
      titleFr: "Psychologie de l'Éducation et du Développement",
      titleAr: 'علم نفس التربية والنمو',
      titleEn: 'Educational and Developmental Psychology',
      description: 'Apprentissages scolaires, orientation, difficultés socio-émotionnelles en milieu éducatif',
    },
    {
      code: 'PSY_CLIN_CHILD',
      titleFr: "Psychologie Clinique de l'Enfant et de l'Adolescent",
      titleAr: 'علم النفس العيادي للطفل والمراهق',
      titleEn: 'Child and Adolescent Clinical Psychology',
      description: 'Évaluation psycho-affective, guidance parentale, bilans de développement',
    },
    {
      code: 'NEUROPSY_LEARN',
      titleFr: 'Neuropsychologie Infantile et Troubles des Apprentissages',
      titleAr: 'علم النفس العصبي للطفل واضطرابات التعلم',
      titleEn: 'Child Neuropsychology and Learning Disorders',
      description: 'Troubles DYS (dyslexie, dyscalculie, dyspraxie), TDAH, bilans cognitifs WISC/TEA-Ch',
    },
    {
      code: 'PSYCHO_EDU_SPEC',
      titleFr: 'Psycho-éducation et Éducation Spécialisée',
      titleAr: 'التربية النفسية والتربية الخاصة',
      titleEn: 'Psycho-education and Special Education',
      description: 'Interventions adaptées, gestion des troubles du comportement, accompagnement inclusif',
    },
    {
      code: 'AUTISM_TSA',
      titleFr: "Accompagnement du Spectre de l'Autisme (TSA)",
      titleAr: 'مرافقة طيف التوحد',
      titleEn: 'Autism Spectrum Support',
      description: 'Méthodes éducatives et comportementales structurées (ABA, TEACCH, PECS)',
    },
    {
      code: 'REMED_COGNITIVE',
      titleFr: 'Remédiation Cognitive et Psychopédagogie',
      titleAr: 'العلاج المعرفي والتربية النفسية',
      titleEn: 'Cognitive Remediation and Psychopedagogy',
      description: 'Stratégies métacognitives, réhabilitation des fonctions attentionnelles et exécutives',
    },
  ];

  const createdSpecialties: Record<string, string> = {};
  for (const spec of specialtiesData) {
    const record = await prisma.refSpecialty.upsert({
      where: { code: spec.code },
      update: {},
      create: spec,
    });
    createdSpecialties[spec.code] = record.id;
  }
  console.log(`Seeded ${Object.keys(createdSpecialties).length} specialties.`);

  // 2. REF_SKILLS (Compétences cliniques & pédagogiques)
  const skillsData = [
    { code: 'TEST_WISC_V', category: 'TEST_PSYCHOMETRIQUE', titleFr: 'Passation et cotation WISC-V', titleAr: 'تمرير وتقييم اختبار WISC-V', titleEn: 'WISC-V Assessment & Scoring' },
    { code: 'TEST_TEACH', category: 'TEST_PSYCHOMETRIQUE', titleFr: "Évaluation de l'attention TEA-Ch", titleAr: 'تقييم الانتباه TEA-Ch', titleEn: 'TEA-Ch Attention Assessment' },
    { code: 'METHOD_PECS', category: 'METHODE_EDUCATIVE', titleFr: 'Système de communication PECS (Niveau 1/2)', titleAr: 'نظام التواصل عبر تبادل الصور PECS', titleEn: 'PECS Communication System' },
    { code: 'METHOD_TEACCH', category: 'METHODE_EDUCATIVE', titleFr: 'Structuration TEACCH', titleAr: 'منهجية تيتش TEACCH للتوحد', titleEn: 'TEACCH Structured Teaching' },
    { code: 'METHOD_ABA', category: 'METHODE_EDUCATIVE', titleFr: 'Intervention comportementale ABA', titleAr: 'التحليل السلوكي التطبيقي ABA', titleEn: 'Applied Behavior Analysis (ABA)' },
    { code: 'PROJECT_PPI', category: 'PRISE_EN_CHARGE', titleFr: 'Élaboration de Projet Personnalisé (PPI)', titleAr: 'إعداد المشروع الفردي المخصص PPI', titleEn: 'Individualized Education Plan (IEP/PPI)' },
    { code: 'PARENT_GUIDANCE', category: 'PRISE_EN_CHARGE', titleFr: 'Guidance parentale et psychoéducation', titleAr: 'الإرشاد الوالدي والتربية النفسية', titleEn: 'Parent Guidance & Psychoeducation' },
  ];

  const createdSkills: Record<string, string> = {};
  for (const s of skillsData) {
    const record = await prisma.refSkill.upsert({
      where: { code: s.code },
      update: {},
      create: s,
    });
    createdSkills[s.code] = record.id;
  }
  console.log(`Seeded ${Object.keys(createdSkills).length} skills.`);

  // 3. MATCHING_CONFIG (Pondérations officielles DCTF v3.1)
  const matchingConfigs = [
    {
      offerType: OfferType.STAGE_OBSERVATION,
      weightFormation: 0.35,
      weightSkills: 0.15,
      weightExperience: 0.05,
      weightLocation: 0.25,
      weightLanguages: 0.10,
      weightAvailability: 0.10,
      algoVersion: 'v3.1-deterministic',
    },
    {
      offerType: OfferType.STAGE_PFE,
      weightFormation: 0.30,
      weightSkills: 0.25,
      weightExperience: 0.15,
      weightLocation: 0.15,
      weightLanguages: 0.10,
      weightAvailability: 0.05,
      algoVersion: 'v3.1-deterministic',
    },
    {
      offerType: OfferType.EMPLOI,
      weightFormation: 0.20,
      weightSkills: 0.30,
      weightExperience: 0.25,
      weightLocation: 0.10,
      weightLanguages: 0.10,
      weightAvailability: 0.05,
      algoVersion: 'v3.1-deterministic',
    },
  ];

  for (const cfg of matchingConfigs) {
    await prisma.matchingConfig.upsert({
      where: { offerType: cfg.offerType },
      update: cfg,
      create: cfg,
    });
  }
  console.log('Seeded Matching Configurations.');

  // 4. USERS & PROFILES FICTIFS POUR TESTS SPRINT 1
  const passwordHash = await bcrypt.hash('Password123!Secure', 10);

  // Admin
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@psyrekrute.ma' },
    update: {},
    create: {
      email: 'admin@psyrekrute.ma',
      passwordHash,
      globalRole: GlobalRole.SYSTEM_ADMIN,
      preferredLocale: 'fr',
      isEmailVerified: true,
    },
  });

  // Structure Al-Amal (Casablanca)
  const centerUser = await prisma.user.upsert({
    where: { email: 'contact@centre-alamal.ma' },
    update: {},
    create: {
      email: 'contact@centre-alamal.ma',
      passwordHash,
      globalRole: GlobalRole.ORGANIZATION_USER,
      preferredLocale: 'fr',
      isEmailVerified: true,
    },
  });

  const organization = await prisma.organization.upsert({
    where: { identifierIce: '001234567000089' },
    update: {},
    create: {
      legalName: 'Centre Psycho-Éducatif Al-Amal SARL',
      tradeName: 'Centre Al-Amal',
      organizationType: OrganizationType.CMPP,
      identifierIce: '001234567000089',
      phone: '+212522000000',
      email: 'contact@centre-alamal.ma',
      regionCode: 'MA-06', // Casablanca-Settat
      cityName: 'Casablanca',
      addressLine: '12 Boulevard d\'Anfa, Maârif',
      verificationStatus: VerificationStatus.VERIFIED,
      verifiedAt: new Date(),
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: centerUser.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      userId: centerUser.id,
      role: OrgMemberRole.OWNER,
    },
  });

  // Candidat Kenza (L3 Psychologie à Casablanca)
  const candidateUser = await prisma.user.upsert({
    where: { email: 'kenza.etudiante@example.ma' },
    update: {},
    create: {
      email: 'kenza.etudiante@example.ma',
      passwordHash,
      globalRole: GlobalRole.CANDIDATE,
      preferredLocale: 'fr',
      isEmailVerified: true,
    },
  });

  await prisma.candidateProfile.upsert({
    where: { userId: candidateUser.id },
    update: {},
    create: {
      userId: candidateUser.id,
      firstName: 'Kenza',
      lastName: 'El Fassi',
      phone: '+212661000001',
      profileCategory: ProfileCategory.STUDENT,
      primarySpecialtyId: createdSpecialties['PSY_EDU_DEV'],
      regionCode: 'MA-06',
      cityName: 'Casablanca',
      mobilityRadiusKm: 20,
      openToRelocation: false,
      availabilityStatus: AvailabilityStatus.IMMEDIATE,
      targetContractTypes: ['STAGE_OBSERVATION', 'STAGE_PFE'],
      bio: 'Étudiante en Licence 3 de psychologie, passionnée par les apprentissages scolaires et l\'accompagnement psycho-éducatif.',
      isAnonymizedInPool: true,
    },
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
