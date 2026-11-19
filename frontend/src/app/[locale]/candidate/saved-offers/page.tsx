'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/context/auth-context';
import { SavedOfferItem, savedOffersApi } from '@/lib/api-client';

export default function CandidateSavedOffersPage() {
  const t = useTranslations('savedOffers');
  const tNav = useTranslations('nav');
  const { user, isLoading: authLoading } = useAuth();

  const [savedOffers, setSavedOffers] = useState<SavedOfferItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [removingIds, setRemovingIds] = useState<Record<string, boolean>>({});

  const loadSavedOffers = async () => {
    setIsLoading(true);
    try {
      const res = await savedOffersApi.list();
      setSavedOffers(res.data || []);
    } catch {
      setSavedOffers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.globalRole === 'CANDIDATE') {
      loadSavedOffers();
    }
  }, [user]);

  const handleUnsave = async (jobOfferId: string) => {
    setRemovingIds((prev) => ({ ...prev, [jobOfferId]: true }));
    try {
      await savedOffersApi.unsave(jobOfferId);
      setSavedOffers((prev) => prev.filter((item) => item.jobOfferId !== jobOfferId));
    } finally {
      setRemovingIds((prev) => ({ ...prev, [jobOfferId]: false }));
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!user || user.globalRole !== 'CANDIDATE') {
    return (
      <div className="mx-auto max-w-xl text-center py-16 px-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('title')}</h2>
          <p className="text-sm text-gray-600 mb-6">
            Cette page est réservée aux candidats inscrits sur PsyRekrute.
          </p>
          <Link
            href="/auth/login"
            className="inline-block rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            {tNav('login')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="pb-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="saved-offers-title">
            {t('title')}
          </h1>
          <p className="text-sm text-gray-600 mt-1">{t('subtitle')}</p>
        </div>
        <Link
          href="/offers"
          data-testid="browse-offers-link"
          className="rounded-lg bg-brand-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition inline-block text-center"
        >
          {t('browseOffers')}
        </Link>
      </div>

      {/* Content */}
      <div className="mt-6">
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          </div>
        ) : savedOffers.length === 0 ? (
          <div
            data-testid="saved-offers-empty"
            className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-12 text-center"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 mb-3">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-600 mb-4">{t('empty')}</p>
            <Link
              href="/offers"
              className="inline-block rounded-lg border border-brand-600 bg-white px-4 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 transition"
            >
              {t('browseOffers')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {savedOffers.map((item) => {
              const offer = item.jobOffer;
              return (
                <div
                  key={item.id}
                  data-testid={`saved-offer-card-${item.jobOfferId}`}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-gray-300 transition text-left rtl:text-right flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="rounded bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 border border-brand-200">
                        {offer.offerType} • {offer.contractSubType}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {offer.cityName} ({offer.regionCode})
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-gray-900 mb-1 hover:text-brand-600 transition">
                      <Link href={`/offers/${item.jobOfferId}`}>
                        {offer.title}
                      </Link>
                    </h3>

                    <p className="text-xs font-medium text-gray-600 mb-3">
                      {offer.organization?.tradeName || offer.organization?.legalName}
                    </p>

                    <p className="text-xs text-gray-500 line-clamp-2 mb-4 leading-relaxed">
                      {offer.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 gap-2">
                    <Link
                      href={`/offers/${item.jobOfferId}`}
                      data-testid={`view-saved-offer-${item.jobOfferId}`}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
                    >
                      Consulter l&apos;offre
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleUnsave(item.jobOfferId)}
                      disabled={removingIds[item.jobOfferId]}
                      data-testid={`unsave-offer-btn-${item.jobOfferId}`}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                    >
                      {t('remove')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
