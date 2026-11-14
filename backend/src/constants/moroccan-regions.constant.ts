export interface MoroccanRegion {
  code: string;
  nameFr: string;
  nameAr: string;
  nameEn: string;
}

/**
 * Référentiel officiel des 12 régions administratives du Royaume du Maroc
 * (Décret n° 2-15-40 du 20 février 2015, codification ISO 3166-2:MA).
 */
export const MOROCCAN_REGIONS: readonly MoroccanRegion[] = [
  {
    code: 'MA-01',
    nameFr: 'Tanger-Tétouan-Al Hoceïma',
    nameAr: 'طنجة - تطوان - الحسيمة',
    nameEn: 'Tangier-Tetouan-Al Hoceima',
  },
  {
    code: 'MA-02',
    nameFr: "L'Oriental",
    nameAr: 'الشرق',
    nameEn: 'Oriental',
  },
  {
    code: 'MA-03',
    nameFr: 'Fès-Meknès',
    nameAr: 'فاس - مكناس',
    nameEn: 'Fez-Meknes',
  },
  {
    code: 'MA-04',
    nameFr: 'Rabat-Salé-Kénitra',
    nameAr: 'الرباط - سلا - القنيطرة',
    nameEn: 'Rabat-Sale-Kenitra',
  },
  {
    code: 'MA-05',
    nameFr: 'Béni Mellal-Khénifra',
    nameAr: 'بني ملال - خنيفرة',
    nameEn: 'Beni Mellal-Khenifra',
  },
  {
    code: 'MA-06',
    nameFr: 'Casablanca-Settat',
    nameAr: 'الدار البيضاء - سطات',
    nameEn: 'Casablanca-Settat',
  },
  {
    code: 'MA-07',
    nameFr: 'Marrakech-Safi',
    nameAr: 'مراكش - آسفي',
    nameEn: 'Marrakech-Safi',
  },
  {
    code: 'MA-08',
    nameFr: 'Drâa-Tafilalet',
    nameAr: 'درعة - تافيلالت',
    nameEn: 'Draa-Tafilalet',
  },
  {
    code: 'MA-09',
    nameFr: 'Souss-Massa',
    nameAr: 'سوس - ماسة',
    nameEn: 'Souss-Massa',
  },
  {
    code: 'MA-10',
    nameFr: 'Guelmim-Oued Noun',
    nameAr: 'كلميم - واد نون',
    nameEn: 'Guelmim-Oued Noun',
  },
  {
    code: 'MA-11',
    nameFr: 'Laâyoune-Sakia El Hamra',
    nameAr: 'العيون - الساقية الحمراء',
    nameEn: 'Laayoune-Sakia El Hamra',
  },
  {
    code: 'MA-12',
    nameFr: 'Dakhla-Oued Ed-Dahab',
    nameAr: 'الداخلة - وادي الذهب',
    nameEn: 'Dakhla-Oued Ed-Dahab',
  },
] as const;

export const MOROCCAN_REGION_CODES = MOROCCAN_REGIONS.map((r) => r.code) as readonly string[];
