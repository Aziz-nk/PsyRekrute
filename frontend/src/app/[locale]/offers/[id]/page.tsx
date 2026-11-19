'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/context/auth-context';
import {
  applicationsApi,
  CandidateApplication,
  JobOffer,
  MoroccanRegion,
  offersApi,
  referenceApi,
  RefSkill,
  RefSpecialty,
  savedOffersApi,
} from '@/lib/api-client';

export default function OfferDetailPage() {
  const params = useParams();
  const offerId = typeof params?.id === 'string' ? params.id : '';
  const t = useTranslations('offers');
  const tProfile = useTranslations('candidate.profile');
  const tApps = useTranslations('applications');
  const tSaved = useTranslations('savedOffers');
  const locale = useLocale();
  const { user } = useAuth();

  const [offer, setOffer] = useState<JobOffer | null>(null);
  const [regions, setRegions] = useState<MoroccanRegion[]>([]);
  const [existingApp, setExistingApp] = useState<CandidateApplication | null>(
    null,
  );
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [applyComment, setApplyComment] = useState('');
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
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

  useEffect(() => {
    if (!offerId || user?.globalRole !== 'CANDIDATE') {
      setExistingApp(null);
      return;
    }

    applicationsApi
      .listMyApplications()
      .then((res) => {
        const match = res.data.find((a) => a.jobOfferId === offerId) || null;
        setExistingApp(match);
      })
      .catch(() => {
        // Ignore if candidate profile is not created yet
      });

    savedOffersApi
      .list()
      .then((res) => {
        const found = res.data.some((s) => s.jobOfferId === offerId);
        setIsSaved(found);
      })
      .catch(() => {});
  }, [offerId, user]);

  const handleToggleSave = async () => {
    if (!offerId || user?.globalRole !== 'CANDIDATE') return;
    setIsSaving(true);
    try {
      if (isSaved) {
        await savedOffersApi.unsave(offerId);
        setIsSaved(false);
      } else {
        await savedOffersApi.save(offerId);
        setIsSaved(true);
      }
    } catch {
      // ignore
    } finally {
      setIsSaving(false);
    }
  };

  const handleDirectApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerId) return;
    setIsApplying(true);
    setApplyError(null);
    setApplySuccess(null);
    try {
      const res = await applicationsApi.applyDirect({
        jobOfferId: offerId,
        comment: applyComment.trim() || undefined,
      });
      setExistingApp(res.data);
      setApplySuccess(tApps('directApply.successMessage'));
      setApplyComment('');
    } catch (err) {
      setApplyError(
        err instanceof Error ? err.message : 'Error submitting application',
      );
    } finally {
      setIsApplying(false);
    }
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

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h1
                data-testid="offer-detail-title"
                className="text-2xl font-bold text-gray-900"
              >
                {offer.title}
              </h1>

              {user?.globalRole === 'CANDIDATE' && (
                <button
                  type="button"
                  onClick={handleToggleSave}
                  disabled={isSaving}
                  data-testid="toggle-save-offer-btn"
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition shrink-0 self-start sm:self-auto ${
                    isSaved
                      ? 'border-brand-600 bg-brand-50 text-brand-700 hover:bg-brand-100'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <svg
                    className={`h-4 w-4 ${isSaved ? 'text-brand-600' : 'text-gray-400'}`}
                    fill={isSaved ? 'currentColor' : 'none'}
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                    />
                  </svg>
                  <span>{isSaved ? tSaved('saved') : tSaved('save')}</span>
                </button>
              )}
            </div>

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

          {/* Section Candidature Directe (CANDIDATE) */}
          {user?.globalRole === 'CANDIDATE' && (
            <div
              id="apply"
              data-testid="direct-apply-section"
              className="border-t border-gray-100 pt-6"
            >
              <h2 className="text-base font-bold text-gray-900 mb-2">
                {tApps('directApply.sectionTitle')}
              </h2>

              {applyError && (
                <div
                  data-testid="direct-apply-error"
                  className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                >
                  {applyError}
                </div>
              )}

              {applySuccess && (
                <div
                  data-testid="direct-apply-success"
                  className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800"
                >
                  {applySuccess}
                </div>
              )}

              {existingApp ? (
                <div
                  data-testid="already-applied-card"
                  className="rounded-xl border border-brand-200 bg-brand-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-bold text-brand-900">
                      {tApps('directApply.alreadyAppliedTitle')}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        data-testid="existing-application-status"
                        className="rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold text-white"
                      >
                        {tApps(`status.${existingApp.currentStatus}`)}
                      </span>
                      <span className="text-xs text-gray-600">
                        ({tApps(`origin.${existingApp.origin}`)})
                      </span>
                    </div>
                  </div>
                  <Link
                    href="/candidate/applications"
                    data-testid="go-to-my-applications-link"
                    className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition text-center"
                  >
                    {tApps('directApply.viewMyApplications')}
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleDirectApply} className="space-y-3">
                  <p className="text-xs text-gray-600">
                    {tApps('directApply.privacyNotice')}
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {tApps('directApply.commentLabel')}
                    </label>
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={applyComment}
                      onChange={(e) => setApplyComment(e.target.value)}
                      placeholder={tApps('directApply.commentPlaceholder')}
                      data-testid="direct-apply-comment-input"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isApplying}
                      data-testid="direct-apply-btn"
                      className="rounded-lg bg-brand-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition"
                    >
                      {isApplying
                        ? tApps('directApply.submitting')
                        : tApps('directApply.submitBtn')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Section Visiteur non connecté */}
          {!user && (
            <div
              id="apply"
              data-testid="visitor-apply-cta-section"
              className="border-t border-gray-100 pt-6"
            >
              <div className="rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 to-white p-6 shadow-sm">
                <h2 className="text-base font-bold text-gray-900 mb-2">
                  {tApps('directApply.sectionTitle')}
                </h2>
                <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                  {locale === 'ar'
                    ? 'هل ترغب في الترشح لهذا العرض؟ سجل الدخول بحساب مرشح أو أنشئ حسابك مجانًا لتقديم طلبك بنقرات قليلة.'
                    : locale === 'en'
                      ? 'Would you like to apply for this offer? Sign in with your candidate account or register for free to submit your application in a few clicks.'
                      : 'Vous souhaitez postuler à cette offre ? Connectez-vous avec votre compte candidat ou inscrivez-vous gratuitement pour soumettre votre candidature en quelques clics.'}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/login?returnUrl=/offers/${offer.id}`}
                    data-testid="visitor-login-to-apply-btn"
                    className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
                  >
                    {locale === 'ar'
                      ? 'تسجيل الدخول للترشح'
                      : locale === 'en'
                        ? 'Sign In to Apply'
                        : 'Se connecter pour postuler'}
                  </Link>
                  <Link
                    href={`/register?returnUrl=/offers/${offer.id}`}
                    data-testid="visitor-register-to-apply-btn"
                    className="rounded-lg border border-brand-600 bg-white px-4 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 transition"
                  >
                    {locale === 'ar'
                      ? 'إنشاء حساب مرشح'
                      : locale === 'en'
                        ? 'Create Candidate Account'
                        : 'Créer un compte candidat'}
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
