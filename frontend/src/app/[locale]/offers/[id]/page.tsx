'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import {
  JobOffer,
  MoroccanRegion,
  offersApi,
  referenceApi,
  RefSkill,
  RefSpecialty,
} from '@/lib/api-client';

export default function OfferDetailPage() {
  const params = useParams();
  const offerId = typeof params?.id === 'string' ? params.id : '';
  const t = useTranslations('offers');
  const tProfile = useTranslations('candidate.profile');
  const locale = useLocale();

  const [offer, setOffer] = useState<JobOffer | null>(null);
  const [regions, setRegions] = useState<MoroccanRegion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!offerId) return;
    setIsLoading(true);
    setError(null);

    Promise.all([offersApi.getPublicOffer(offerId), referenceApi.getRegions()])
      .then(([offerRes, regRes]) => {
        setOffer(offerRes.data);
        setRegions(regRes.data);
      })
      .catch(() => {
        setError(t('public.notFound'));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [offerId, t]);

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

  const getSkillLabel = (skill?: RefSkill) => {
    if (!skill) return '';
    if (locale === 'ar') return skill.titleAr;
    if (locale === 'en') return skill.titleEn;
    return skill.titleFr;
  };

  const getSkillLevelLabel = (level: string) => {
    switch (level) {
      case 'NOTIONS':
        return tProfile('levelNotions');
      case 'PRATIQUANT':
        return tProfile('levelPratiquant');
      case 'AUTONOME':
        return tProfile('levelAutonome');
      case 'EXPERT':
        return tProfile('levelExpert');
      default:
        return level;
    }
  };

  const getLangProficiencyLabel = (prof: string) => {
    switch (prof) {
      case 'NOTIONS':
        return tProfile('profNotions');
      case 'INTERMEDIAIRE':
        return tProfile('profIntermediaire');
      case 'COURANT_PROFESSIONNEL':
        return tProfile('profCourant');
      case 'LANGUE_MATERNELLE':
        return tProfile('profMaternelle');
      default:
        return prof;
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          href="/offers"
          data-testid="back-to-offers-link"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
        >
          ← {t('public.backToList')}
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : error || !offer ? (
        <div
          data-testid="offer-not-found"
          className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-600"
        >
          {error || t('public.notFound')}
        </div>
      ) : (
        <div
          data-testid="offer-detail-card"
          className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm space-y-6"
        >
          {/* En-tête */}
          <div className="border-b border-gray-100 pb-6">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 border border-brand-200">
                {t(`types.${offer.offerType}`)}
              </span>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                {t(`contracts.${offer.contractSubType}`)}
              </span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                {t(`degrees.${offer.requiredDegreeLevel}`)}
              </span>
            </div>

            <h1
              data-testid="offer-detail-title"
              className="text-2xl font-bold text-gray-900"
            >
              {offer.title}
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              <span className="font-semibold text-gray-800">
                {offer.organization?.tradeName}
              </span>{' '}
              • {offer.cityName} ({getRegionLabel(offer.regionCode)})
            </p>
          </div>

          {/* Informations clés */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 rounded-xl bg-gray-50 p-4 text-xs">
            <div>
              <span className="block font-medium text-gray-400">
                {t('public.specialty')}
              </span>
              <span className="mt-0.5 block font-semibold text-gray-800">
                {getSpecialtyLabel(offer.targetSpecialty)}
              </span>
            </div>

            <div>
              <span className="block font-medium text-gray-400">
                {t('public.degreeRequired')}
              </span>
              <span className="mt-0.5 block font-semibold text-gray-800">
                {t(`degrees.${offer.requiredDegreeLevel}`)}
              </span>
            </div>

            <div>
              <span className="block font-medium text-gray-400">
                {t('public.startDate')}
              </span>
              <span className="mt-0.5 block font-semibold text-gray-800">
                {new Date(offer.startDate).toLocaleDateString(locale)}
              </span>
            </div>

            {offer.durationMonths && (
              <div>
                <span className="block font-medium text-gray-400">
                  {t('public.duration')}
                </span>
                <span className="mt-0.5 block font-semibold text-gray-800">
                  {offer.durationMonths} {t('public.months')}
                </span>
              </div>
            )}

            <div>
              <span className="block font-medium text-gray-400">
                {t('public.minExperience')}
              </span>
              <span className="mt-0.5 block font-semibold text-gray-800">
                {offer.minExperienceMonths} {t('public.months')} (
                {offer.isExperienceMandatory
                  ? t('public.experienceMandatory')
                  : t('public.experienceOptional')}
                )
              </span>
            </div>

            {offer.remunerationStipend && (
              <div>
                <span className="block font-medium text-gray-400">
                  {t('public.remuneration')}
                </span>
                <span className="mt-0.5 block font-semibold text-gray-800">
                  {offer.remunerationStipend}
                </span>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <h2 className="text-base font-bold text-gray-900 mb-2">
              {t('public.description')}
            </h2>
            <p className="whitespace-pre-line text-sm text-gray-700 leading-relaxed">
              {offer.description}
            </p>
          </div>

          {/* Compétences requises */}
          {offer.requiredSkills && offer.requiredSkills.length > 0 && (
            <div className="border-t border-gray-100 pt-5">
              <h2 className="text-base font-bold text-gray-900 mb-3">
                {t('public.requiredSkills')}
              </h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {offer.requiredSkills.map((rs) => (
                  <div
                    key={rs.skillId}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-gray-900 block">
                        {getSkillLabel(rs.skill)}
                      </span>
                      <span className="text-gray-500">
                        {getSkillLevelLabel(rs.minRequiredLevel)}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        rs.isMandatory
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {rs.isMandatory
                        ? t('public.mandatory')
                        : t('public.desirable')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Langues requises */}
          {offer.requiredLanguages && offer.requiredLanguages.length > 0 && (
            <div className="border-t border-gray-100 pt-5">
              <h2 className="text-base font-bold text-gray-900 mb-3">
                {t('public.requiredLanguages')}
              </h2>
              <div className="flex flex-wrap gap-2">
                {offer.requiredLanguages.map((rl) => (
                  <span
                    key={rl.languageCode}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-800"
                  >
                    <strong>{rl.languageCode}</strong> :{' '}
                    {getLangProficiencyLabel(rl.minProficiencyLevel)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
