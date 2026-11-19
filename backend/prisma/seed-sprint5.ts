import {
  PrismaClient,
  GlobalRole,
  OrganizationType,
  OrgMemberRole,
  VerificationStatus,
  DegreeLevel,
  OfferType,
  ProfileCategory,
  AvailabilityStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const ARGON2ID_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

const prisma = new PrismaClient();

async function main() {
  console.log('--- SEEDING SPRINT 5 TEST DATA ---');
  const passwordHash = await argon2.hash('Password123!', ARGON2ID_OPTIONS);

  // 1. SYSTEM ADMIN
  const admin = await prisma.user.upsert({
    where: { email: 'admin@psyrekrute.ma' },
    update: {
      passwordHash,
      isActive: true,
      globalRole: GlobalRole.SYSTEM_ADMIN,
    },
    create: {
      email: 'admin@psyrekrute.ma',
      passwordHash,
      globalRole: GlobalRole.SYSTEM_ADMIN,
      isActive: true,
      preferredLocale: 'fr',
    },
  });
  console.log('SYSTEM_ADMIN ready:', admin.email);

  // 2. CANDIDATE
  const cand = await prisma.user.upsert({
    where: { email: 'candidat.sprint5@psyrekrute.ma' },
    update: {
      passwordHash,
      isActive: true,
      globalRole: GlobalRole.CANDIDATE,
    },
    create: {
      email: 'candidat.sprint5@psyrekrute.ma',
      passwordHash,
      globalRole: GlobalRole.CANDIDATE,
      isActive: true,
      preferredLocale: 'fr',
    },
  });
  console.log('CANDIDATE user ready:', cand.email);

  let spec = await prisma.refSpecialty.findFirst({ where: { isActive: true } });
  if (!spec) {
    spec = await prisma.refSpecialty.create({
      data: {
        code: 'CLINIQUE_ENFANT',
        titleFr: 'Psychologie Clinique et Psychopathologie',
        titleAr: 'علم النفس العيادي وعلم النفس المرضي',
        titleEn: 'Clinical Psychology',
        isActive: true,
      },
    });
  }

  let candProfile = await prisma.candidateProfile.findUnique({
    where: { userId: cand.id },
  });
  if (!candProfile) {
    candProfile = await prisma.candidateProfile.create({
      data: {
        userId: cand.id,
        firstName: 'Yassine',
        lastName: 'El Mansouri',
        phone: '+212612345678',
        regionCode: 'MA-06',
        cityName: 'Casablanca',
        profileCategory: ProfileCategory.EXPERIENCED_PROFESSIONAL,
        availabilityStatus: AvailabilityStatus.IMMEDIATE,
        primarySpecialtyId: spec.id,
        profileCompletionPercentage: 85,
      },
    });
    console.log('Candidate profile created:', candProfile.id);
  }

  await prisma.consent.deleteMany({
    where: { userId: cand.id },
  });
  await prisma.consent.create({
    data: {
      userId: cand.id,
      consentType: 'TALENT_POOL_MATCHING',
      version: '1.0',
      hasConsented: true,
      ipAddress: '127.0.0.1',
      userAgent: 'Seed/Sprint5',
    },
  });

  // 3. RECRUITER / ORG OWNER
  const orgOwner = await prisma.user.upsert({
    where: { email: 'recruteur.sprint5@psyrekrute.ma' },
    update: {
      passwordHash,
      isActive: true,
      globalRole: GlobalRole.ORGANIZATION_USER,
    },
    create: {
      email: 'recruteur.sprint5@psyrekrute.ma',
      passwordHash,
      globalRole: GlobalRole.ORGANIZATION_USER,
      isActive: true,
      preferredLocale: 'ar',
    },
  });
  console.log('ORGANIZATION_USER ready:', orgOwner.email);

  // Organization
  let org = await prisma.organization.findFirst({
    where: { identifierIce: '003456789012345' },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        legalName: 'Cabinet Psychologie Avenir SARL',
        tradeName: 'Avenir Psychologie',
        organizationType: OrganizationType.CABINET_LIBERAL,
        identifierIce: '003456789012345',
        officialRegistrationNumber: 'RC-998877',
        phone: '+212522998877',
        email: 'contact@avenirpsy.ma',
        regionCode: 'MA-06',
        cityName: 'Casablanca',
        addressLine: '120 Avenue Hassan II',
        verificationStatus: VerificationStatus.PENDING,
        members: {
          create: {
            userId: orgOwner.id,
            role: OrgMemberRole.OWNER,
          },
        },
      },
    });
    console.log('Organization created (PENDING):', org.id);
  } else {
    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: orgOwner.id,
        },
      },
    });
    if (!existingMember) {
      await prisma.organizationMember.create({
        data: {
          organizationId: org.id,
          userId: orgOwner.id,
          role: OrgMemberRole.OWNER,
        },
      });
    }
    org = await prisma.organization.update({
      where: { id: org.id },
      data: { verificationStatus: VerificationStatus.PENDING, verifiedAt: null },
    });
  }

  // Published offer
  const member = await prisma.organizationMember.findFirst({
    where: { organizationId: org.id },
  });

  let offer = await prisma.jobOffer.findFirst({
    where: { organizationId: org.id, title: 'Psychologue Clinicien de l Enfance' },
  });
  if (!offer) {
    offer = await prisma.jobOffer.create({
      data: {
        organizationId: org.id,
        authorMemberId: member!.id,
        title: 'Psychologue Clinicien de l Enfance',
        description:
          'Poste en CDI pour psychologue clinicien specialise dans l accompagnement de l enfant et de l adolescent.',
        offerType: OfferType.EMPLOI,
        contractSubType: 'CDI',
        requiredDegreeLevel: DegreeLevel.BAC_5_MASTER,
        targetSpecialtyId: spec.id,
        regionCode: 'MA-06',
        cityName: 'Casablanca',
        startDate: new Date(),
        status: 'PUBLISHED',
      },
    });
    console.log('Offer created (PUBLISHED):', offer.id);
  }

  // Clean and recreate Candidate Notifications
  await prisma.notification.deleteMany({
    where: { userId: cand.id },
  });

  await prisma.notification.create({
    data: {
      userId: cand.id,
      type: 'NEW_INVITATION',
      title: 'Nouvelle invitation de Avenir Psychologie',
      message:
        'L organisme Avenir Psychologie vous a invite a postuler a son offre Psychologue Clinicien de l Enfance.',
      linkUrl: `/offers/${offer.id}`,
      isRead: false,
    },
  });

  await prisma.notification.create({
    data: {
      userId: cand.id,
      type: 'STATUS_CHANGED',
      title: 'Mise a jour de votre dossier',
      message: 'Votre candidature a ete transferee en cours d etude.',
      linkUrl: '/candidate/applications',
      isRead: false,
    },
  });
  console.log('Candidate notifications created.');

  // Clean any saved offers for candidate to start clean
  await prisma.savedOffer.deleteMany({
    where: { candidateId: candProfile.id },
  });

  console.log('--- SPRINT 5 SEED SUCCESSFUL ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
