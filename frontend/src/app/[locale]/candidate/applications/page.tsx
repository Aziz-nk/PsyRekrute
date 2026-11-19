'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useAuth } from '@/context/auth-context';
import {
  applicationsApi,
  ApplicationStatus,
  CandidateApplication,
} from '@/lib/api-client';

export default function CandidateApplicationsPage() {
  const t = useTranslations('applications');
  const tOffers = useTranslations('offers');
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [applications, setApplications] = useState<CandidateApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [commentsByAppId, setCommentsByAppId] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const loadApplications = useCallback(async () => {
    if (!user || user.globalRole !== 'CANDIDATE') {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await applicationsApi.listMyApplications();
      setApplications(res.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error loading applications',
      );
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      loadApplications();
    }
  }, [authLoading, user, loadApplications]);

  const handleCandidateTransition = async (
    applicationId: string,
    targetStatus: ApplicationStatus,
  ) => {
    setActionLoadingId(applicationId);
    setError(null);
    setSuccessMsg(null);
    try {
      const comment = commentsByAppId[applicationId]?.trim() || undefined;
      await applicationsApi.transitionByCandidate(applicationId, {
        targetStatus,
        comment,
      });
      setCommentsByAppId((prev) => ({ ...prev, [applicationId]: '' }));
      setSuccessMsg(t('recruiter.transitionSuccess'));
      await loadApplications();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error updating application status',
      );
    } finally {
      setActionLoadingId(null);
    }
  };

  const canWithdraw = (status: ApplicationStatus) =>
    [
      'SUBMITTED',
      'REVIEWING',
      'INTERVIEW_PROPOSED',
      'INTERVIEW_CONFIRMED',
      'INTERVIEW_RESCHEDULE_REQUESTED',
      'OFFER_EXTENDED',
    ].includes(status);

  const getStatusBadgeClasses = (status: ApplicationStatus) => {
    switch (status) {
      case 'INVITED':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'SUBMITTED':
      case 'REVIEWING':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'INTERVIEW_PROPOSED':
      case 'INTERVIEW_RESCHEDULE_REQUESTED':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'INTERVIEW_CONFIRMED':
      case 'OFFER_EXTENDED':
        return 'bg-teal-50 text-teal-800 border-teal-200';
      case 'HIRED':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'REJECTED':
      case 'INVITATION_DECLINED':
      case 'INVITATION_EXPIRED':
      case 'WITHDRAWN':
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!user || user.globalRole !== 'CANDIDATE') {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p className="text-sm text-red-600">Accès non autorisé.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1
            data-testid="candidate-applications-title"
            className="text-2xl sm:text-3xl font-bold text-gray-900"
          >
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-600">{t('subtitle')}</p>
        </div>

        <Link
          href="/offers"
          data-testid="browse-offers-btn"
          className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-xs sm:text-sm font-semibold text-brand-700 hover:bg-brand-100 transition text-center"
        >
          {t('browseOffers')}
        </Link>
      </div>

      {error && (
        <div
          data-testid="candidate-applications-error"
          className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {successMsg && (
        <div
          data-testid="candidate-applications-success"
          className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {successMsg}
        </div>
      )}

      {applications.length === 0 ? (
        <div
          data-testid="no-candidate-applications"
          className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500"
        >
          {t('noApplications')}
        </div>
      ) : (
        <div className="space-y-5" data-testid="candidate-applications-list">
          {applications.map((app) => {
            const isBusy = actionLoadingId === app.id;
            const remainingReschedules = Math.max(
              0,
              2 - app.interviewRescheduleCount,
            );
            const hasActions =
              app.currentStatus === 'INVITED' ||
              app.currentStatus === 'INTERVIEW_PROPOSED' ||
              app.currentStatus === 'OFFER_EXTENDED' ||
              canWithdraw(app.currentStatus);

            return (
              <div
                key={app.id}
                data-testid={`candidate-application-card-${app.id}`}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4"
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span
                        data-testid={`candidate-app-status-${app.id}`}
                        className={`rounded-full px-3 py-0.5 text-xs font-semibold border ${getStatusBadgeClasses(
                          app.currentStatus,
                        )}`}
                      >
                        {t(`status.${app.currentStatus}`)}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                        {t(`origin.${app.origin}`)}
                      </span>
                      {app.initialMatchScore !== null && (
                        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200">
                          {t('candidateActions.matchScore')} :{' '}
                          {Number(app.initialMatchScore).toFixed(0)}%
                        </span>
                      )}
                    </div>

                    <h2 className="text-lg font-bold text-gray-900">
                      <Link
                        href={`/offers/${app.jobOfferId}`}
                        className="hover:text-brand-600 transition"
                      >
                        {app.jobOffer.title}
                      </Link>
                    </h2>

                    <p className="mt-1 text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">
                        {app.jobOffer.organization.tradeName}
                      </span>{' '}
                      • {app.jobOffer.cityName} ({app.jobOffer.regionCode}) •{' '}
                      {tOffers(`types.${app.jobOffer.offerType}`)}
                    </p>
                  </div>

                  {app.invitationExpiresAt &&
                    app.currentStatus === 'INVITED' && (
                      <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5">
                        {t('candidateActions.expiresOn')} :{' '}
                        <strong>
                          {new Date(app.invitationExpiresAt).toLocaleDateString(
                            locale,
                          )}
                        </strong>
                      </div>
                    )}
                </div>

                {/* Bandeau d'anonymisation pour les invitations en attente */}
                {app.currentStatus === 'INVITED' && (
                  <div
                    data-testid={`invitation-privacy-banner-${app.id}`}
                    className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-xs text-indigo-900"
                  >
                    {t('candidateActions.invitationPrivacyBanner')}
                  </div>
                )}

                {/* Détails de l'entretien proposé ou confirmé */}
                {app.interviewDate && (
                  <div
                    data-testid={`interview-details-box-${app.id}`}
                    className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs space-y-1.5"
                  >
                    <div className="font-bold text-amber-900">
                      {t('candidateActions.interviewBoxTitle')}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-gray-800">
                      <div>
                        <span className="text-gray-500">
                          {t('candidateActions.interviewDate')} :{' '}
                        </span>
                        <strong>
                          {new Date(app.interviewDate).toLocaleString(locale)}
                        </strong>
                      </div>
                      {app.interviewMode && (
                        <div>
                          <span className="text-gray-500">
                            {t('candidateActions.interviewMode')} :{' '}
                          </span>
                          <strong>
                            {t(`interviewMode.${app.interviewMode}`)}
                          </strong>
                        </div>
                      )}
                      {app.interviewLocationOrLink && (
                        <div>
                          <span className="text-gray-500">
                            {t('candidateActions.interviewLocation')} :{' '}
                          </span>
                          <strong>{app.interviewLocationOrLink}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Détails de la proposition d'embauche / stage */}
                {app.hiringOfferDetails && (
                  <div
                    data-testid={`hiring-offer-box-${app.id}`}
                    className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 text-xs space-y-1.5"
                  >
                    <div className="font-bold text-teal-900">
                      {t('candidateActions.offerBoxTitle')}
                    </div>
                    <p className="text-gray-800 whitespace-pre-line">
                      {app.hiringOfferDetails}
                    </p>
                    {app.hiringOfferDeadline && (
                      <div className="text-teal-800">
                        {t('candidateActions.offerDeadline')} :{' '}
                        <strong>
                          {new Date(app.hiringOfferDeadline).toLocaleDateString(
                            locale,
                          )}
                        </strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Contrôles d'action FSM Candidat */}
                {hasActions && (
                  <div className="border-t border-gray-100 pt-4 space-y-3">
                    <input
                      type="text"
                      maxLength={1000}
                      value={commentsByAppId[app.id] || ''}
                      onChange={(e) =>
                        setCommentsByAppId((prev) => ({
                          ...prev,
                          [app.id]: e.target.value,
                        }))
                      }
                      placeholder={t('candidateActions.commentPlaceholder')}
                      data-testid={`candidate-action-comment-${app.id}`}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {app.currentStatus === 'INVITED' && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleCandidateTransition(app.id, 'SUBMITTED')
                              }
                              data-testid={`accept-invitation-btn-${app.id}`}
                              className="rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {t('candidateActions.acceptInvitation')}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleCandidateTransition(
                                  app.id,
                                  'INVITATION_DECLINED',
                                )
                              }
                              data-testid={`decline-invitation-btn-${app.id}`}
                              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              {t('candidateActions.declineInvitation')}
                            </button>
                          </>
                        )}

                        {app.currentStatus === 'INTERVIEW_PROPOSED' && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                handleCandidateTransition(
                                  app.id,
                                  'INTERVIEW_CONFIRMED',
                                )
                              }
                              data-testid={`confirm-interview-btn-${app.id}`}
                              className="rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {t('candidateActions.confirmInterview')}
                            </button>

                            <button
                              type="button"
                              disabled={isBusy || remainingReschedules === 0}
                              onClick={() =>
                                handleCandidateTransition(
                                  app.id,
                                  'INTERVIEW_RESCHEDULE_REQUESTED',
                                )
                              }
                              data-testid={`request-reschedule-btn-${app.id}`}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {t('candidateActions.requestReschedule')} (
                              {remainingReschedules > 0
                                ? t('candidateActions.rescheduleRemaining', {
                                    count: remainingReschedules,
                                  })
                                : t('candidateActions.rescheduleLimitReached')}
                              )
                            </button>
                          </>
                        )}

                        {app.currentStatus === 'OFFER_EXTENDED' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleCandidateTransition(app.id, 'HIRED')
                            }
                            data-testid={`accept-hiring-offer-btn-${app.id}`}
                            className="rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {t('candidateActions.acceptOffer')}
                          </button>
                        )}
                      </div>

                      {canWithdraw(app.currentStatus) && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            handleCandidateTransition(app.id, 'WITHDRAWN')
                          }
                          data-testid={`withdraw-application-btn-${app.id}`}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {t('candidateActions.withdraw')}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Historique des transitions */}
                {app.history && app.history.length > 0 && (
                  <div className="border-t border-gray-100 pt-3">
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                      {t('candidateActions.historyTitle')}
                    </div>
                    <div className="space-y-1">
                      {app.history.map((h) => (
                        <div
                          key={h.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5"
                        >
                          <div>
                            <span className="font-semibold text-gray-800">
                              {t(`status.${h.newStatus}`)}
                            </span>
                            {h.comment && (
                              <span className="text-gray-500">
                                {' '}
                                — « {h.comment} »
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-gray-400">
                            {new Date(h.createdAt).toLocaleString(locale)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
