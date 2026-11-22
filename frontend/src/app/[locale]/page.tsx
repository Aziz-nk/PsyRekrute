'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useAuth } from '@/context/auth-context';
import {
  ExternalJobListing,
  externalJobsApi,
  JobOffer,
  MoroccanRegion,
  offersApi,
  PaginatedMeta,
  referenceApi,
  RefSpecialty,
} from '@/lib/api-client';
import HealthStatus from '@/components/HealthStatus';

const MOROCCAN_CITIES = ['Rabat', 'Casablanca', 'Fès', 'Marrakech', 'Salé', 'Tanger', 'Kénitra', 'Agadir'];

type OfferSourceFilter = 'ALL' | 'INTERNAL' | 'EXTERNAL';

export default function HomePage() {
  const t = useTranslations('home');
  const tOffers = useTranslations('offers');
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuth();

  // Offres internes PsyRekrute
  const [internalOffers, setInternalOffers] = useState<JobOffer[]>([]);
  const [internalMeta, setInternalMeta] = useState<PaginatedMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  // Offres externes agrégées (Dreamjob, etc.)
  const [externalOffers, setExternalOffers] = useState<ExternalJobListing[]>([]);
  const [externalTotal, setExternalTotal] = useState<number>(0);

  const [specialties, setSpecialties] = useState<RefSpecialty[]>([]);
  const [regions, setRegions] = useState<MoroccanRegion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtres
  const [search, setSearch] = useState('');
  const [cityName, setCityName] = useState('');
  const [offerType, setOfferType] = useState('');
  const [specialtyId, setSpecialtyId] = useState('');
  const [page, setPage] = useState(1);
  const [sourceFilter, setSourceFilter] = useState<OfferSourceFilter>('ALL');

  useEffect(() => {
    Promise.all([referenceApi.getSpecialties(), referenceApi.getRegions()])
      .then(([specRes, regRes]) => {
        setSpecialties(specRes.data || []);
        setRegions(regRes.data || []);
      })
      .catch(() => {});
  }, []);

  const loadAllOffers = useCallback(
    async (targetPage: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const [intOutcome, extOutcome] = await Promise.allSettled([
          offersApi.listPublicOffers({
            page: targetPage,
            limit: 10,
            search: search.trim() || undefined,
            cityName: cityName || undefined,
            offerType: offerType || undefined,
            specialtyId: specialtyId || undefined,
          }),
          externalJobsApi.listPublished({
            page: targetPage,
            limit: 10,
            search: search.trim() || undefined,
            cityName: cityName || undefined,
            contractType:
              offerType === 'STAGE_OBSERVATION' || offerType === 'STAGE_PFE'
                ? 'Stage'
                : offerType === 'EMPLOI'
                  ? 'Emploi'
                  : undefined,
          }),
        ]);

        const errors: string[] = [];

        if (intOutcome.status === 'fulfilled') {
          setInternalOffers(intOutcome.value.data || []);
          setInternalMeta(intOutcome.value.meta);
        } else {
          setInternalOffers([]);
          setInternalMeta({ page: 1, limit: 10, total: 0, totalPages: 1 });
          errors.push(
            intOutcome.reason instanceof Error
              ? intOutcome.reason.message
              : 'Erreur de chargement des offres internes',
          );
        }

        if (extOutcome.status === 'fulfilled') {
          setExternalOffers(extOutcome.value.data || []);
          setExternalTotal(extOutcome.value.meta?.total || 0);
        } else {
          setExternalOffers([]);
          setExternalTotal(0);
          const extMsg =
            extOutcome.reason instanceof Error
              ? extOutcome.reason.message
              : 'Erreur de chargement des offres externes';
          if (!errors.includes(extMsg)) {
            errors.push(extMsg);
          }
        }

        if (errors.length > 0) {
          setError(errors.join(' | '));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur de chargement des offres');
      } finally {
        setIsLoading(false);
      }
    },
    [search, cityName, offerType, specialtyId],
  );

  useEffect(() => {
    loadAllOffers(page);
  }, [loadAllOffers, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadAllOffers(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setCityName('');
    setOfferType('');
    setSpecialtyId('');
    setSourceFilter('ALL');
    setPage(1);
  };

  const handleApplyClick = (offerId: string) => {
    if (!user) {
      router.push(`/register?returnUrl=/offers/${offerId}`);
      return;
    }

    if (user.globalRole === 'CANDIDATE') {
      router.push(`/offers/${offerId}#apply`);
      return;
    }

    alert(
      locale === 'ar'
        ? 'الترشح مخصص لحسابات المرشحين فقط.'
        : locale === 'en'
          ? 'Applications are reserved for candidate accounts.'
          : 'Les candidatures sont réservées aux comptes candidats.',
    );
  };

  const getSpecialtyLabel = (spec?: RefSpecialty) => {
    if (!spec) return '';
    if (locale === 'ar') return spec.titleAr;
    if (locale === 'en') return spec.titleEn;
    return spec.titleFr;
  };

  const getRegionLabel = (code: string) => {
    const r = regions.find((item) => item.code === code);
    if (!r) return code;
    if (locale === 'ar') return r.nameAr;
    if (locale === 'en') return r.nameEn;
    return r.nameFr;
  };

  const displayedExternal = sourceFilter === 'INTERNAL' ? [] : externalOffers;
  const displayedInternal = sourceFilter === 'EXTERNAL' ? [] : internalOffers;
  const totalCount =
    sourceFilter === 'INTERNAL'
      ? internalMeta.total
      : sourceFilter === 'EXTERNAL'
        ? externalTotal
        : internalMeta.total + externalTotal;

  return (
    <main className="flex flex-col min-h-screen">
      {/* ---------------------------------------------------------------------- */}
      {/* 1. HERO SECTION AVEC IMAGE 1 ET BARRE DE RECHERCHE PRINCIPALE         */}
      {/* ---------------------------------------------------------------------- */}
      <section className="relative bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 text-white px-4 py-12 sm:py-16 overflow-hidden">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Colonne texte et recherche (7 col) */}
            <div className="lg:col-span-7 text-left rtl:text-right space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-brand-100 backdrop-blur-sm border border-white/20">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Plateforme Nationale de Référence • Psychologie de l&apos;Éducation au Maroc</span>
              </div>

              <h1
                data-testid="home-hero-title"
                className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-white"
              >
                {t('hero.title')}
              </h1>

              <p className="text-sm sm:text-base text-brand-100 leading-relaxed max-w-2xl">
                {t('hero.subtitle')}
              </p>

              {/* Chiffres clés condensés */}
              <div className="grid grid-cols-3 gap-3 max-w-lg pt-2 text-center">
                <div className="rounded-xl bg-white/10 backdrop-blur-sm p-2.5 border border-white/10">
                  <div className="text-xl sm:text-2xl font-extrabold text-white">30+</div>
                  <div className="text-[11px] text-brand-200 mt-0.5">{t('hero.stats.offers')}</div>
                </div>
                <div className="rounded-xl bg-white/10 backdrop-blur-sm p-2.5 border border-white/10">
                  <div className="text-xl sm:text-2xl font-extrabold text-white">100%</div>
                  <div className="text-[11px] text-brand-200 mt-0.5">{t('hero.stats.organizations')}</div>
                </div>
                <div className="rounded-xl bg-white/10 backdrop-blur-sm p-2.5 border border-white/10">
                  <div className="text-xl sm:text-2xl font-extrabold text-white">12</div>
                  <div className="text-[11px] text-brand-200 mt-0.5">Régions du Maroc</div>
                </div>
              </div>
            </div>

            {/* Colonne Image 1 (5 col) : Accompagnement éducatif et psychologique */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="relative w-full max-w-md aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl border-4 border-white/20 bg-brand-950/40">
                <Image
                  src="/images/home-educational-support.jpg"
                  alt="Accompagnement éducatif et psychologique"
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 500px"
                  className="object-cover transition duration-500 hover:scale-105"
                  data-testid="hero-primary-image"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-950/60 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 text-center sm:text-left rtl:sm:text-right">
                  <span className="inline-block rounded-lg bg-black/60 backdrop-blur-md px-3 py-1 text-[11px] font-medium text-white border border-white/10">
                    Accompagnement spécialisé & soutien clinique
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------------ */}
          {/* BARRE DE RECHERCHE FLOTTANTE                                       */}
          {/* ------------------------------------------------------------------ */}
          <form
            onSubmit={handleSearchSubmit}
            data-testid="home-search-form"
            className="mt-8 rounded-2xl bg-white p-4 sm:p-5 shadow-2xl text-gray-900 border border-gray-100"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Mot-clé */}
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('search.keywordPlaceholder')}
                  data-testid="home-search-input"
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2.5 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Filtre Ville */}
              <div>
                <select
                  value={cityName}
                  onChange={(e) => {
                    setCityName(e.target.value);
                    setPage(1);
                  }}
                  data-testid="home-filter-city"
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2.5 text-xs sm:text-sm text-gray-900 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">{t('search.allCities')}</option>
                  {MOROCCAN_CITIES.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtre Type d'Offre */}
              <div>
                <select
                  value={offerType}
                  onChange={(e) => {
                    setOfferType(e.target.value);
                    setPage(1);
                  }}
                  data-testid="home-filter-type"
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2.5 text-xs sm:text-sm text-gray-900 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">{t('search.allTypes')}</option>
                  <option value="STAGE_OBSERVATION">
                    {tOffers('types.STAGE_OBSERVATION')} (PFA)
                  </option>
                  <option value="STAGE_PFE">{tOffers('types.STAGE_PFE')}</option>
                  <option value="EMPLOI">{tOffers('types.EMPLOI')}</option>
                </select>
              </div>

              {/* Filtre Domaine / Spécialité */}
              <div>
                <select
                  value={specialtyId}
                  onChange={(e) => {
                    setSpecialtyId(e.target.value);
                    setPage(1);
                  }}
                  data-testid="home-filter-specialty"
                  className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3.5 py-2.5 text-xs sm:text-sm text-gray-900 focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">{t('search.allSpecialties')}</option>
                  {specialties.map((s) => (
                    <option key={s.id} value={s.id}>
                      {getSpecialtyLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3.5 flex items-center justify-between pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleResetFilters}
                data-testid="home-reset-filters-btn"
                className="text-xs font-medium text-gray-500 hover:text-gray-800 transition"
              >
                {t('search.reset')}
              </button>

              <button
                type="submit"
                data-testid="home-search-submit-btn"
                className="rounded-xl bg-brand-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 transition"
              >
                {t('search.submit')}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ---------------------------------------------------------------------- */}
      {/* 2. CATÉGORIES D'OPPORTUNITÉS (PFA, PFE, EMPLOIS) & DOMAINES MAROCAINS */}
      {/* ---------------------------------------------------------------------- */}
      <section className="py-12 bg-white border-b border-gray-100" data-testid="opportunity-categories-section">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {t('categories.title')}
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-gray-600">
              {t('categories.subtitle')}
            </p>
          </div>

          {/* Cartes Types d'opportunités */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* PFA */}
            <div
              onClick={() => {
                setOfferType('STAGE_OBSERVATION');
                setPage(1);
              }}
              className="cursor-pointer rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm hover:shadow-md hover:border-emerald-300 transition"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white font-bold text-sm mb-3">
                PFA
              </div>
              <h3 className="text-base font-bold text-emerald-950 mb-1">
                {t('categories.pfa')}
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                {t('categories.pfaDesc')}
              </p>
            </div>

            {/* PFE */}
            <div
              onClick={() => {
                setOfferType('STAGE_PFE');
                setPage(1);
              }}
              className="cursor-pointer rounded-2xl border border-blue-200 bg-blue-50/40 p-6 shadow-sm hover:shadow-md hover:border-blue-300 transition"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-sm mb-3">
                PFE
              </div>
              <h3 className="text-base font-bold text-blue-950 mb-1">
                {t('categories.pfe')}
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                {t('categories.pfeDesc')}
              </p>
            </div>

            {/* Emplois */}
            <div
              onClick={() => {
                setOfferType('EMPLOI');
                setPage(1);
              }}
              className="cursor-pointer rounded-2xl border border-brand-200 bg-brand-50/40 p-6 shadow-sm hover:shadow-md hover:border-brand-300 transition"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white font-bold text-sm mb-3">
                CDI
              </div>
              <h3 className="text-base font-bold text-brand-950 mb-1">
                {t('categories.jobs')}
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                {t('categories.jobsDesc')}
              </p>
            </div>
          </div>

          {/* Pilules Domaines d'intervention ciblés au Maroc */}
          <div className="pt-4 border-t border-gray-100">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider text-center mb-3">
              {t('categories.domainsTitle')}
            </h4>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800 border border-gray-200">
                {t('categories.schoolPsy')}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800 border border-gray-200">
                {t('categories.neuropsy')}
              </span>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 border border-amber-200">
                {t('categories.tsa')}
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-900 border border-blue-200">
                {t('categories.ortho')}
              </span>
              <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-900 border border-purple-200">
                {t('categories.psychoed')}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900 border border-emerald-200">
                {t('categories.psychomot')}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------- */}
      {/* 3. EXPLORATEUR D'OFFRES AVEC ONGLETS (TOUTES / INTERNES / EXTERNES)    */}
      {/* ---------------------------------------------------------------------- */}
      <section className="py-12 bg-gray-50 flex-1" id="offers-list">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-4">
            <div>
              <h2
                data-testid="recent-offers-title"
                className="text-2xl sm:text-3xl font-bold text-gray-900"
              >
                {t('recentOffers.title')}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-gray-600">
                {t('recentOffers.subtitle')}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span
                data-testid="offers-count-badge"
                className="rounded-full bg-brand-100 px-3.5 py-1 text-xs font-semibold text-brand-800"
              >
                {totalCount} offres
              </span>
            </div>
          </div>

          {/* Onglets Filtre de Source (Toutes / Internes / Externes) */}
          <div className="mb-6 inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setSourceFilter('ALL')}
              data-testid="tab-source-all"
              className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                sourceFilter === 'ALL'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('tabs.all')} ({internalMeta.total + externalTotal})
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('INTERNAL')}
              data-testid="tab-source-internal"
              className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                sourceFilter === 'INTERNAL'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('tabs.internal')} ({internalMeta.total})
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('EXTERNAL')}
              data-testid="tab-source-external"
              className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                sourceFilter === 'EXTERNAL'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('tabs.external')} ({externalTotal})
            </button>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs sm:text-sm text-red-700">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-brand-600 border-t-transparent" />
            </div>
          ) : displayedInternal.length === 0 && displayedExternal.length === 0 ? (
            <div
              data-testid="no-recent-offers"
              className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500"
            >
              {t('recentOffers.noOffers')}
            </div>
          ) : (
            <div className="space-y-4" data-testid="recent-offers-list">
              {/* CARTES D'OFFRES INTERNES PSYREKRUTE */}
              {displayedInternal.map((offer) => {
                const isDemoOffer =
                  offer.title.includes('[DÉMO]') ||
                  offer.organization?.tradeName?.includes('[DÉMO]');
                return (
                  <div
                    key={`int-${offer.id}`}
                    data-testid={`home-offer-card-${offer.id}`}
                    className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-brand-300"
                  >
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {isDemoOffer && (
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-300">
                              DÉMO
                            </span>
                          )}
                          <span className="rounded-full bg-brand-50 px-3 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200">
                            {tOffers(`types.${offer.offerType}`)}
                          </span>
                          <span className="rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-700">
                            {tOffers(`contracts.${offer.contractSubType}`)}
                          </span>
                          <span className="rounded-full bg-blue-50 px-3 py-0.5 text-xs font-medium text-blue-700">
                            {tOffers(`degrees.${offer.requiredDegreeLevel}`)}
                          </span>
                        </div>

                        <h3 className="text-lg font-bold text-gray-900 hover:text-brand-600 transition">
                          <Link href={`/offers/${offer.id}`}>{offer.title}</Link>
                        </h3>

                        <p className="mt-1 text-xs sm:text-sm font-semibold text-gray-700">
                          {offer.organization?.tradeName} •{' '}
                          <span className="text-brand-700 font-bold">{offer.cityName}</span> (
                          {getRegionLabel(offer.regionCode)})
                        </p>

                        {offer.targetSpecialty && (
                          <p className="mt-1 text-xs text-gray-500">
                            {tOffers('public.specialty')} :{' '}
                            <span className="font-medium text-gray-800">
                              {getSpecialtyLabel(offer.targetSpecialty)}
                            </span>
                          </p>
                        )}

                        <p className="mt-2 text-xs sm:text-sm text-gray-600 line-clamp-2 leading-relaxed">
                          {offer.description}
                        </p>

                        <div className="mt-2 text-[11px] text-gray-400">
                          {t('recentOffers.publishedOn')} :{' '}
                          {offer.publishedAt
                            ? new Date(offer.publishedAt).toLocaleDateString(locale)
                            : new Date(offer.createdAt).toLocaleDateString(locale)}
                          {offer.durationMonths &&
                            ` • ${offer.durationMonths} ${tOffers('public.months')}`}
                        </div>
                      </div>

                      {/* Actions internes : Voir l'offre & Postuler */}
                      <div className="flex flex-row lg:flex-col items-center lg:items-end gap-2.5 pt-3 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                        <Link
                          href={`/offers/${offer.id}`}
                          data-testid={`home-view-offer-btn-${offer.id}`}
                          className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition"
                        >
                          {t('recentOffers.viewOffer')}
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleApplyClick(offer.id)}
                          data-testid={`home-apply-btn-${offer.id}`}
                          className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-700 transition"
                        >
                          {t('recentOffers.apply')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* CARTES D'ANNONCES EXTERNES (DREAMJOB / WEB MAROCAIN) */}
              {displayedExternal.map((extJob) => (
                <div
                  key={`ext-${extJob.id}`}
                  data-testid={`external-job-card-${extJob.id}`}
                  className="rounded-2xl border-2 border-indigo-100 bg-gradient-to-r from-white via-indigo-50/20 to-white p-6 shadow-sm transition hover:shadow-md hover:border-indigo-300"
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="flex-1">
                      {/* Badge source très visible */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="rounded-full bg-indigo-100 px-3 py-0.5 text-xs font-bold text-indigo-900 border border-indigo-300 flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
                          {t('external.badge', {
                            source:
                              extJob.sourceName ||
                              extJob.sourcePlatform ||
                              extJob.sourceDomain ||
                              'Dreamjob.ma',
                          })}
                        </span>
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                          {extJob.contractType || 'Emploi'}
                        </span>
                        <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                          {extJob.category || 'Psychologie'}
                        </span>
                      </div>

                      {/* Titre avec lien externe sécurisé */}
                      <h3 className="text-lg font-bold text-gray-900 hover:text-indigo-700 transition">
                        <a
                          href={extJob.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5"
                        >
                          <span>{extJob.title}</span>
                          <svg className="h-4 w-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      </h3>

                      {/* Organisme & Ville */}
                      <p className="mt-1 text-xs sm:text-sm font-semibold text-gray-700">
                        {extJob.organizationName} •{' '}
                        <span className="text-indigo-800 font-bold">{extJob.cityName}</span> (Maroc)
                      </p>

                      {/* Résumé des missions */}
                      <p className="mt-2 text-xs sm:text-sm text-gray-600 line-clamp-2 leading-relaxed">
                        {extJob.descriptionSummary}
                      </p>

                      <div className="mt-2.5 flex items-center gap-2 text-[11px] text-gray-400">
                        <span>
                          {t('recentOffers.publishedOn')} :{' '}
                          {new Date(
                            extJob.publicationDate ||
                              extJob.discoveredAt ||
                              extJob.collectedAt ||
                              Date.now(),
                          ).toLocaleDateString(locale)}
                        </span>
                        <span>•</span>
                        <span className="italic text-gray-500">
                          {t('external.disclaimer')}
                        </span>
                      </div>
                    </div>

                    {/* CTA unique : Redirection vers le site source original */}
                    <div className="flex flex-col items-center lg:items-end gap-2 pt-3 lg:pt-0 border-t lg:border-t-0 border-indigo-100">
                      <a
                        href={extJob.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`external-cta-btn-${extJob.id}`}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition"
                      >
                        <span>{t('external.viewOriginal')}</span>
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                          />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {internalMeta.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"
                  >
                    ←
                  </button>
                  <span className="text-xs font-semibold text-gray-600">
                    {internalMeta.page} / {internalMeta.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= internalMeta.totalPages}
                    onClick={() => setPage((p) => Math.min(internalMeta.totalPages, p + 1))}
                    className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"
                  >
                    →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------------- */}
      {/* 4. SECTION PRÉSENTATION & INNOVATION PÉDAGOGIQUE AVEC IMAGE 2          */}
      {/* ---------------------------------------------------------------------- */}
      <section className="py-16 bg-white border-t border-gray-200" data-testid="pedagogical-innovation-section">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Colonne Image 2 (5 col) : Apprentissage ludique et activités pédagogiques */}
            <div className="lg:col-span-5 order-2 lg:order-1 flex justify-center">
              <div className="relative w-full max-w-md aspect-[4/3] rounded-3xl overflow-hidden shadow-xl border border-gray-200 bg-gray-50">
                <Image
                  src="/images/home-learning-activities.jpg"
                  alt="Apprentissage ludique et approches pédagogiques innovantes"
                  fill
                  sizes="(max-width: 768px) 100vw, 500px"
                  className="object-cover transition duration-500 hover:scale-105"
                  data-testid="pedagogical-secondary-image"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-gray-950/40 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 text-center sm:text-left rtl:sm:text-right">
                  <span className="inline-block rounded-lg bg-black/60 backdrop-blur-md px-3 py-1 text-[11px] font-medium text-white border border-white/10">
                    Outils cliniques, médiation ludique & cognition
                  </span>
                </div>
              </div>
            </div>

            {/* Colonne Contenu (7 col) */}
            <div className="lg:col-span-7 order-1 lg:order-2 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3.5 py-1 text-xs font-bold text-brand-800 border border-brand-200">
                {t('pedagogy.badge')}
              </div>

              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-tight">
                {t('pedagogy.title')}
              </h2>

              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                {t('pedagogy.paragraph1')}
              </p>

              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                {t('pedagogy.paragraph2')}
              </p>

              {/* Puces d'action */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-start gap-2.5 text-xs text-gray-700">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-800 text-[10px] font-bold">
                    ✓
                  </span>
                  <span>{t('pedagogy.point1')}</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-gray-700">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-800 text-[10px] font-bold">
                    ✓
                  </span>
                  <span>{t('pedagogy.point2')}</span>
                </div>
                <div className="flex items-start gap-2.5 text-xs text-gray-700">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-800 text-[10px] font-bold">
                    ✓
                  </span>
                  <span>{t('pedagogy.point3')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------- */}
      {/* 5. ESPACES CANDIDATS & RECRUTEURS (ORIENTATION PAR PARCOURS)          */}
      {/* ---------------------------------------------------------------------- */}
      <section className="py-16 bg-gray-50 border-t border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Boîte Candidats */}
            <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/50 to-white p-8 shadow-sm">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white mb-4">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {t('candidatesBox.title')}
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed mb-6">
                {t('candidatesBox.desc')}
              </p>
              <Link
                href="/register"
                data-testid="home-candidate-register-btn"
                className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-brand-700 transition"
              >
                {t('candidatesBox.btn')}
              </Link>
            </div>

            {/* Boîte Recruteurs */}
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/50 to-white p-8 shadow-sm">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-700 text-white mb-4">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {t('recruitersBox.title')}
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 leading-relaxed mb-6">
                {t('recruitersBox.desc')}
              </p>
              <Link
                href="/register"
                data-testid="home-recruiter-register-btn"
                className="inline-flex items-center justify-center rounded-xl bg-blue-700 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-blue-800 transition"
              >
                {t('recruitersBox.btn')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------- */}
      {/* 6. PILIERS DE LA PLATEFORME (CARACTÉRISTIQUES CLÉS)                   */}
      {/* ---------------------------------------------------------------------- */}
      <section className="py-16 bg-white border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {(['matching', 'trilingual', 'privacy'] as const).map((key) => (
              <div
                key={key}
                className="rounded-2xl border border-gray-200 bg-gray-50/50 p-6 shadow-sm"
              >
                <h4 className="mb-2 text-base font-bold text-brand-800">
                  {t(`features.${key}.title`)}
                </h4>
                <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                  {t(`features.${key}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------------- */}
      {/* 7. SONDE DE SANTÉ BACKEND                                              */}
      {/* ---------------------------------------------------------------------- */}
      <section className="border-t border-gray-200 bg-gray-50 py-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <HealthStatus />
        </div>
      </section>
    </main>
  );
}
