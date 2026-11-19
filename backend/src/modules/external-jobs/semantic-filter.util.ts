import * as crypto from 'crypto';

/**
 * Mots-clés métiers obligatoires (Français, Arabe, Anglais)
 * Seules les annonces contenant au moins l'un de ces mots-clés sont conservées.
 */
export const ALLOWED_SPECIALTY_KEYWORDS: readonly string[] = [
  // Français
  'psychologue',
  'psychologie',
  'scolaire',
  'neuropsychologue',
  'neuropsychologie',
  'psychoéducation',
  'psychoéducateur',
  'orthophonie',
  'orthophoniste',
  'psychomotricité',
  'psychomotricien',
  'éducateur spécialisé',
  'éducation spécialisée',
  'autisme',
  'tsa',
  'spectre de l\'autisme',
  'troubles des apprentissages',
  'dyslexie',
  'dyscalculie',
  'dyspraxie',
  'tdah',
  'remédiation cognitive',
  'besoins spécifiques',
  'inclusion scolaire',

  // Arabe
  'أخصائي نفسي',
  'علم النفس',
  'مدرسي',
  'تربوي',
  'التربية النفسية',
  'نفسي عصبي',
  'توحد',
  'طيف التوحد',
  'نطق',
  'تخاطب',
  'نفس حركي',
  'مربي متخصص',
  'تربية خاصة',
  'صعوبات التعلم',
  'فرط الحركة',

  // Anglais
  'psychologist',
  'psychology',
  'school psychologist',
  'educational psychology',
  'neuropsychologist',
  'psychoeducation',
  'speech therapist',
  'speech therapy',
  'psychomotor',
  'special educator',
  'autism',
  'asd',
  'learning disabilities',
  'adhd',
];

export interface CityDetection {
  cityName: string;
  regionCode: string;
}

export const CITIES_DICTIONARY: Record<string, { cityName: string; regionCode: string }> = {
  rabat: { cityName: 'Rabat', regionCode: 'MA-04' },
  casablanca: { cityName: 'Casablanca', regionCode: 'MA-06' },
  casa: { cityName: 'Casablanca', regionCode: 'MA-06' },
  fès: { cityName: 'Fès', regionCode: 'MA-03' },
  fes: { cityName: 'Fès', regionCode: 'MA-03' },
  marrakech: { cityName: 'Marrakech', regionCode: 'MA-07' },
  salé: { cityName: 'Salé', regionCode: 'MA-04' },
  sale: { cityName: 'Salé', regionCode: 'MA-04' },
  tanger: { cityName: 'Tanger', regionCode: 'MA-01' },
  tangier: { cityName: 'Tanger', regionCode: 'MA-01' },
  kénitra: { cityName: 'Kénitra', regionCode: 'MA-04' },
  kenitra: { cityName: 'Kénitra', regionCode: 'MA-04' },
  agadir: { cityName: 'Agadir', regionCode: 'MA-09' },
  meknès: { cityName: 'Meknès', regionCode: 'MA-03' },
  meknes: { cityName: 'Meknès', regionCode: 'MA-03' },
  oujda: { cityName: 'Oujda', regionCode: 'MA-02' },
  tétouan: { cityName: 'Tétouan', regionCode: 'MA-01' },
  tetouan: { cityName: 'Tétouan', regionCode: 'MA-01' },
  الرباط: { cityName: 'Rabat', regionCode: 'MA-04' },
  'الدار البيضاء': { cityName: 'Casablanca', regionCode: 'MA-06' },
  فاس: { cityName: 'Fès', regionCode: 'MA-03' },
  مراكش: { cityName: 'Marrakech', regionCode: 'MA-07' },
  سلا: { cityName: 'Salé', regionCode: 'MA-04' },
  طنجة: { cityName: 'Tanger', regionCode: 'MA-01' },
  القنيطرة: { cityName: 'Kénitra', regionCode: 'MA-04' },
  أكادير: { cityName: 'Agadir', regionCode: 'MA-09' },
};

/**
 * Vérifie si le texte (titre + description) relève bien des domaines autorisés de PsyRekrute.
 */
export function isRelevantSpecialty(text: string): boolean {
  const lower = text.toLowerCase();
  return ALLOWED_SPECIALTY_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Tente de détecter automatiquement une ville marocaine dans le texte.
 */
export function detectMoroccanCity(text: string): CityDetection | null {
  const lower = text.toLowerCase();
  for (const [key, val] of Object.entries(CITIES_DICTIONARY)) {
    // Vérification de mot entier ou délimité
    const regex = new RegExp(`(^|[^a-zA-ZÀ-ÿ0-9_])${key}([^a-zA-ZÀ-ÿ0-9_]|$)`, 'i');
    if (regex.test(lower)) {
      return val;
    }
  }
  return null;
}

/**
 * Calcule l'empreinte SHA-256 de détection de doublons.
 * Normalise titre + organisme + ville pour résister aux petites variations d'espaces/casse.
 */
export function computeContentHash(
  title: string,
  organizationName: string,
  cityName?: string | null,
): string {
  const cleanTitle = title.toLowerCase().replace(/\s+/g, ' ').trim();
  const cleanOrg = organizationName.toLowerCase().replace(/\s+/g, ' ').trim();
  const cleanCity = (cityName || '').toLowerCase().replace(/\s+/g, ' ').trim();

  const rawPayload = `${cleanTitle}::${cleanOrg}::${cleanCity}`;
  return crypto.createHash('sha256').update(rawPayload, 'utf8').digest('hex');
}

/**
 * Nettoie une chaîne HTML pour en extraire un texte brut sécurisé et court.
 */
export function stripHtmlToText(html: string, maxLength = 600): string {
  if (!html) return '';

  // Suppression des balises script et style
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  // Remplacement des sauts de ligne et balises de paragraphe par un espace
  text = text.replace(/<[^>]+>/g, ' ');
  // Remplacement des entités HTML courantes
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length > maxLength) {
    return text.slice(0, maxLength) + '…';
  }
  return text;
}

/**
 * Extrait les métadonnées OpenGraph et HTML standard d'une page web pour l'import manuel d'URL.
 */
export function extractPageMetadata(html: string): {
  title: string;
  description: string;
  siteName: string;
  canonicalUrl?: string;
} {
  // 1. Titre (og:title ou <title>)
  let title = '';
  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (ogTitleMatch?.[1]) {
    title = ogTitleMatch[1];
  } else {
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleTagMatch?.[1]) {
      title = titleTagMatch[1];
    }
  }

  // 2. Description (og:description ou meta name=description)
  let description = '';
  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  if (ogDescMatch?.[1]) {
    description = ogDescMatch[1];
  } else {
    const descTagMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (descTagMatch?.[1]) {
      description = descTagMatch[1];
    }
  }

  // 3. Nom du site (og:site_name)
  let siteName = '';
  const siteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
  if (siteNameMatch?.[1]) {
    siteName = siteNameMatch[1];
  }

  // 4. URL canonique
  let canonicalUrl: string | undefined;
  const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  if (canonicalMatch?.[1]) {
    canonicalUrl = canonicalMatch[1];
  }

  return {
    title: stripHtmlToText(title, 250),
    description: stripHtmlToText(description, 1000),
    siteName: stripHtmlToText(siteName, 100),
    canonicalUrl,
  };
}
