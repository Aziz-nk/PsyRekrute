'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  JobOffer,
  MoroccanRegion,
  offersApi,
  PaginatedMeta,
  referenceApi,
  RefSpecialty,
} from '@/lib/api-client';

export default function PublicOffersPage() {
  const t = useTranslations('offers');
  const locale = useLocale();

  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [meta, setMeta] = useState<PaginatedMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [regions, setRegions] = useState<MoroccanRegion[]>([]);
  const [specialties, setSpecialties] = useState<RefSpecialty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [offerType, setOfferType] = useState('');
  const [regionCode, setRegionCode] = useState('');
  const [specialtyId, setSpecialtyId] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    Promise.all([referenceApi.getRegions(), referenceApi.getSpecialties()])
      .then(([regRes, specRes]) => {
        setRegions(regRes.data);
        setSpecialties(specRes.data);
      })
      .catch(() => {
        // Ignorer silencieusement si erreur de chargement des filtres
      });
  }, []);

  const loadOffers = useCallback(
    async (targetPage: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await offersApi.listPublicOffers({
          page: targetPage,
          limit: 10,
          offerType: offerType || undefined,
          regionCode: regionCode || undefined,
          specialtyId: specialtyId || undefined,
          search: search.trim() || undefined,
        });
        setOffers(res.data);
        setMeta(res.meta);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading offers');
      } finally {
        setIsLoading(false);
      }
    },
    [offerType, regionCode, specialtyId, search],
  );

  useEffect(() => {
    loadOffers(page);
  }, [loadOffers, page]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadOffers(1);
  };

  const handleReset = () => {
    setSearch('');
    setOfferType('');
    setRegionCode('');
    setSpecialtyId('');
    setPage(1);
  };

  const getRegionLabel = (code: string) => {
    const r = regions.find((item) => item.code === code);
    if (!r) return code;
    if (locale === 'ar') return r.nameAr;
    if (locale === 'en') return r.nameEn;
    return r.nameFr;
  };

  const getSpecialtyLabel = (spec?: RefSpecialty) => {
    if (!spec) return '';
    if (locale === 'ar') return spec.titleAr;
    if (locale === 'en') return spec.titleEn;
    return spec.titleFr;
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1
          data-testid="public-offers-title"
          className="text-2xl sm:text-3xl font-bold text-gray-900"
        >
          {t('public.title')}
        </h1>
        <p className="mt-1 text-sm text-gray-600">{t('public.subtitle')}</p>
      </div>

      {/* Filtres de recherche */}
      <form
        onSubmit={handleFilterSubmit}
        data-testid="public-offers-filter-form"
        className="mb-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('public.searchPlaceholder')}
              data-testid="filter-search-input"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <select
              value={offerType}
              onChange={(e) => {
                setOfferType(e.target.value);
                setPage(1);
              }}
              data-testid="filter-offer-type"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
            >
              <option value="">{t('public.allTypes')}</option>
              <option value="STAGE_OBSERVATION">
                {t('types.STAGE_OBSERVATION')}
              </option>
              <option value="STAGE_PFE">{t('types.STAGE_PFE')}</option>
              <option value="EMPLOI">{t('types.EMPLOI')}</option>
            </select>
          </div>

          <div>
            <select
              value={regionCode}
              onChange={(e) => {
                setRegionCode(e.target.value);
                setPage(1);
              }}
              data-testid="filter-region-code"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
            >
              <option value="">{t('public.allRegions')}</option>
              {regions.map((r) => (
                <option key={r.code} value={r.code}>
                  {locale === 'ar'
                    ? r.nameAr
                    : locale === 'en'
                      ? r.nameEn
                      : r.nameFr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={specialtyId}
              onChange={(e) => {
                setSpecialtyId(e.target.value);
                setPage(1);
              }}
              data-testid="filter-specialty-id"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
            >
              <option value="">{t('public.allSpecialties')}</option>
              {specialties.map((s) => (
                <option key={s.id} value={s.id}>
                  {getSpecialtyLabel(s)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('public.resetFilters')}
          </button>
          <button
            type="submit"
            data-testid="filter-submit-btn"
            className="rounded-lg bg-brand-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            {t('public.filterButton')}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : offers.length === 0 ? (
        <div
          data-testid="no-public-offers"
          className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-500"
        >
          {t('public.noOffers')}
        </div>
      ) : (
        <div className="space-y-4" data-testid="public-offers-list">
          {offers.map((offer) => (
            <div
              key={offer.id}
              data-testid={`offer-card-${offer.id}`}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-brand-300"
            >
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="rounded-full bg-brand-50 px-3 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200">
                      {t(`types.${offer.offerType}`)}
                    </span>
                    <span className="rounded-full bg-gray-100 px-3 py-0.5 text-xs font-medium text-gray-700">
                      {t(`contracts.${offer.contractSubType}`)}
                    </span>
                    <span className="rounded-full bg-blue-50 px-3 py-0.5 text-xs font-medium text-blue-700">
                      {t(`degrees.${offer.requiredDegreeLevel}`)}
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-gray-900">
                    <Link
                      href={`/offers/${offer.id}`}
                      className="hover:text-brand-600 transition"
                    >
                      {offer.title}
                    </Link>
                  </h2>

                  <p className="mt-1 text-sm font-medium text-gray-700">
                    {offer.organization?.tradeName} • {offer.cityName} (
                    {getRegionLabel(offer.regionCode)})
                  </p>

                  {offer.targetSpecialty && (
                    <p className="mt-1 text-xs text-gray-500">
                      {t('public.specialty')} :{' '}
                      <span className="font-medium text-gray-700">
                        {getSpecialtyLabel(offer.targetSpecialty)}
                      </span>
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:items-end gap-2">
                  <Link
                    href={`/offers/${offer.id}`}
                    data-testid={`view-offer-btn-${offer.id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
                  >
                    {t('public.viewDetails')}
                  </Link>
                  <div className="text-xs text-gray-500">
                    {t('public.startDate')} :{' '}
                    {new Date(offer.startDate).toLocaleDateString(locale)}
                    {offer.durationMonths
                      ? ` • ${offer.durationMonths} ${t('public.months')}`
                      : ''}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {meta.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"
              >
                ←
              </button>
              <span className="text-xs font-medium text-gray-600">
                {meta.page} / {meta.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 disabled:opacity-50"
              >
                →
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
