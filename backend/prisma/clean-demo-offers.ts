import { PrismaClient } from '@prisma/client';
import { DEMO_EMAIL_DOMAIN, DEMO_IDENTIFIER_PREFIX } from './seed-demo-offers';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Nettoyage sécurisé des données de démonstration PsyRekrute ---');

  // 1. Suppression des offres de démonstration (détectées par titre [DÉMO] ou organisation démo)
  const deletedOffers = await prisma.jobOffer.deleteMany({
    where: {
      OR: [
        { title: { startsWith: DEMO_IDENTIFIER_PREFIX } },
        { organization: { tradeName: { startsWith: DEMO_IDENTIFIER_PREFIX } } },
      ],
    },
  });
  console.log(`[Nettoyage] ${deletedOffers.count} offres de démonstration supprimées.`);

  // 2. Suppression des organisations de démonstration
  const deletedOrgs = await prisma.organization.deleteMany({
    where: {
      OR: [
        { legalName: { startsWith: DEMO_IDENTIFIER_PREFIX } },
        { tradeName: { startsWith: DEMO_IDENTIFIER_PREFIX } },
        { email: { endsWith: DEMO_EMAIL_DOMAIN } },
        { identifierIce: { startsWith: '999' } },
      ],
    },
  });
  console.log(`[Nettoyage] ${deletedOrgs.count} organismes de démonstration supprimés.`);

  // 3. Suppression des utilisateurs recruteurs de démonstration
  const deletedUsers = await prisma.user.deleteMany({
    where: {
      email: { endsWith: DEMO_EMAIL_DOMAIN },
    },
  });
  console.log(`[Nettoyage] ${deletedUsers.count} comptes de démonstration supprimés.`);

  console.log('[Succès] Nettoyage terminé. Aucune donnée réelle n\'a été affectée.');
}

main()
  .catch((e) => {
    console.error('Erreur lors du nettoyage des données démo :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
