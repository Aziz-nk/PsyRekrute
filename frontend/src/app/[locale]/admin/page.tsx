'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/context/auth-context';
import {
  AdminAuditLogItem,
  AdminOrganizationItem,
  adminApi,
  ExternalJobListing,
  ExternalJobStatus,
  externalJobsApi,
} from '@/lib/api-client';

export default function AdminConsolePage() {
  const t = useTranslations('admin');
  const tNav = useTranslations('nav');
  const { user, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const initialTab =
    tabParam === 'external-jobs' ? 'external-jobs' : tabParam === 'audit' ? 'audit' : 'orgs';

  const [activeTab, setActiveTab] = useState<'orgs' | 'audit' | 'external-jobs'>(initialTab);

  // --------------------------------------------------------------------------
  // TAB 1: Organizations State
  // --------------------------------------------------------------------------
  const [orgs, setOrgs] = useState<AdminOrganizationItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isOrgsLoading, setIsOrgsLoading] = useState<boolean>(true);
  const [actionOrgId, setActionOrgId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'VERIFIED' | 'REJECTED' | null>(null);
  const [actionReason, setActionReason] = useState<string>('');
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // TAB 2: Audit Logs State
  // --------------------------------------------------------------------------
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogItem[]>([]);
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditTotalPages, setAuditTotalPages] = useState<number>(1);
  const [isAuditLoading, setIsAuditLoading] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // TAB 3: External Jobs State (Agrégateur d'offres externes)
  // --------------------------------------------------------------------------
  const [externalJobs, setExternalJobs] = useState<ExternalJobListing[]>([]);
  const [externalCounts, setExternalCounts] = useState<Record<ExternalJobStatus, number>>({
    PENDING_REVIEW: 0,
    PUBLISHED: 0,
    REJECTED: 0,
    EXPIRED: 0,
  });
  const [externalFilterStatus, setExternalFilterStatus] = useState<ExternalJobStatus | 'ALL'>(
    'PENDING_REVIEW',
  );
  const [externalPage, setExternalPage] = useState<number>(1);
  const [externalTotalPages, setExternalTotalPages] = useState<number>(1);
  const [isExternalLoading, setIsExternalLoading] = useState<boolean>(false);

  // RSS Collection
  const [isCollectingRss, setIsCollectingRss] = useState<boolean>(false);
  const [rssFeedback, setRssFeedback] = useState<string | null>(null);

  // URL Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importUrl, setImportUrl] = useState<string>('');
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Review Modal
  const [reviewJob, setReviewJob] = useState<ExternalJobListing | null>(null);
  const [reviewForm, setReviewForm] = useState<{
    title: string;
    organizationName: string;
    cityName: string;
    contractType: string;
    category: string;
    descriptionSummary: string;
    rejectionReason: string;
  }>({
    title: '',
    organizationName: '',
    cityName: '',
    contractType: '',
    category: '',
    descriptionSummary: '',
    rejectionReason: '',
  });
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // Data Loaders
  // --------------------------------------------------------------------------
  const loadOrganizations = async (status: string) => {
    setIsOrgsLoading(true);
    try {
      const res = await adminApi.listOrganizations(status === 'ALL' ? undefined : status);
      setOrgs(res.data || []);
    } catch {
      setOrgs([]);
    } finally {
      setIsOrgsLoading(false);
    }
  };

  const loadAuditLogs = async (page: number) => {
    setIsAuditLoading(true);
    try {
      const res = await adminApi.listAuditLogs({ page, limit: 20 });
      setAuditLogs(res.data || []);
      setAuditTotalPages(res.meta?.totalPages || 1);
    } catch {
      setAuditLogs([]);
    } finally {
      setIsAuditLoading(false);
    }
  };

  const loadExternalJobs = async (status: ExternalJobStatus | 'ALL', page: number) => {
    setIsExternalLoading(true);
    try {
      const res = await externalJobsApi.listForAdmin({
        page,
        limit: 15,
        status: status === 'ALL' ? undefined : status,
      });
      setExternalJobs(res.data || []);
      setExternalTotalPages(res.meta?.totalPages || 1);
      if (res.meta?.countsByStatus) {
        setExternalCounts(res.meta.countsByStatus);
      }
    } catch {
      setExternalJobs([]);
    } finally {
      setIsExternalLoading(false);
    }
  };

  useEffect(() => {
    if (user?.globalRole === 'SYSTEM_ADMIN') {
      if (activeTab === 'orgs') {
        loadOrganizations(statusFilter);
      } else if (activeTab === 'audit') {
        loadAuditLogs(auditPage);
      } else if (activeTab === 'external-jobs') {
        loadExternalJobs(externalFilterStatus, externalPage);
      }
    }
  }, [user, activeTab, statusFilter, auditPage, externalFilterStatus, externalPage]);

  // --------------------------------------------------------------------------
  // Actions: Organizations
  // --------------------------------------------------------------------------
  const handleVerifyOrReject = async () => {
    if (!actionOrgId || !actionType) return;
    setIsSubmittingAction(true);
    setFeedbackMessage(null);
    try {
      await adminApi.verifyOrganization(actionOrgId, {
        status: actionType,
        reason: actionReason.trim() || undefined,
      });
      setFeedbackMessage(actionType === 'VERIFIED' ? t('verifySuccess') : t('rejectSuccess'));
      setActionOrgId(null);
      setActionType(null);
      setActionReason('');
      await loadOrganizations(statusFilter);
    } catch (e: any) {
      setFeedbackMessage(e.message || 'Action failed');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // --------------------------------------------------------------------------
  // Actions: External Jobs
  // --------------------------------------------------------------------------
  const handleCollectRss = async () => {
    setIsCollectingRss(true);
    setRssFeedback(null);
    try {
      const res = await externalJobsApi.collectRss();
      const { collected, duplicates, errors } = res.data;
      setRssFeedback(
        `Collecte terminée : ${collected} annonce(s) importée(s), ${duplicates} doublon(s) ignoré(s)${
          errors > 0 ? `, ${errors} erreur(s)` : ''
        }.`,
      );
      await loadExternalJobs(externalFilterStatus, externalPage);
    } catch (e: any) {
      setRssFeedback(`Erreur lors de la collecte RSS : ${e.message || 'Échec réseau'}`);
    } finally {
      setIsCollectingRss(false);
    }
  };

  const handleImportUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setIsImporting(true);
    setImportError(null);
    try {
      await externalJobsApi.importUrl(importUrl.trim());
      setFeedbackMessage("L'annonce a été importée avec succès et soumise à révision.");
      setImportUrl('');
      setIsImportModalOpen(false);
      await loadExternalJobs(externalFilterStatus, externalPage);
    } catch (e: any) {
      setImportError(
        e.message || "Impossible d'importer cette URL (vérifiez l'accessibilité ou la sécurité anti-SSRF).",
      );
    } finally {
      setIsImporting(false);
    }
  };

  const openReviewModal = (job: ExternalJobListing) => {
    setReviewJob(job);
    setReviewForm({
      title: job.title || '',
      organizationName: job.organizationName || '',
      cityName: job.cityName || '',
      contractType: job.contractType || '',
      category: job.category || '',
      descriptionSummary: job.descriptionSummary || '',
      rejectionReason: job.rejectionReason || '',
    });
  };

  const handleReviewAction = async (action: 'APPROVE' | 'REJECT' | 'EXPIRE') => {
    if (!reviewJob) return;
    setIsSubmittingReview(true);
    try {
      await externalJobsApi.review(reviewJob.id, {
        action,
        title: reviewForm.title,
        organizationName: reviewForm.organizationName,
        cityName: reviewForm.cityName,
        contractType: reviewForm.contractType,
        category: reviewForm.category,
        descriptionSummary: reviewForm.descriptionSummary,
        rejectionReason: action === 'REJECT' ? reviewForm.rejectionReason || 'Non retenu' : undefined,
      });
      setFeedbackMessage(
        action === 'APPROVE'
          ? "L'annonce externe a été publiée avec succès."
          : action === 'REJECT'
            ? "L'annonce a été rejetée."
            : "L'annonce a été marquée comme expirée.",
      );
      setReviewJob(null);
      await loadExternalJobs(externalFilterStatus, externalPage);
    } catch (e: any) {
      setFeedbackMessage(e.message || 'Erreur lors de la mise à jour du statut.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleDirectReview = async (jobId: string, action: 'APPROVE' | 'REJECT' | 'EXPIRE') => {
    try {
      await externalJobsApi.review(jobId, { action });
      setFeedbackMessage(
        action === 'APPROVE'
          ? 'Annonce publiée.'
          : action === 'REJECT'
            ? 'Annonce rejetée.'
            : 'Annonce marquée expirée.',
      );
      await loadExternalJobs(externalFilterStatus, externalPage);
    } catch (e: any) {
      setFeedbackMessage(e.message || 'Erreur');
    }
  };

  // --------------------------------------------------------------------------
  // Access Guards
  // --------------------------------------------------------------------------
  if (authLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!user || user.globalRole !== 'SYSTEM_ADMIN') {
    return (
      <div className="mx-auto max-w-xl text-center py-16 px-4">
        <div className="rounded-2xl border border-red-200 bg-red-50/50 p-8 shadow-sm">
          <h2 className="text-xl font-bold text-red-900 mb-2">Accès Restreint</h2>
          <p className="text-sm text-red-700 mb-6">
            Cette console est strictement réservée aux administrateurs système (SYSTEM_ADMIN).
          </p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
          >
            {tNav('home')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="pb-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900" data-testid="admin-page-title">
              {t('title')}
            </h1>
            <span className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-800 border border-amber-300">
              SYSTEM_ADMIN
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{t('subtitle')}</p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setActiveTab('orgs')}
            data-testid="tab-orgs-btn"
            className={`rounded-md px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'orgs'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('tabOrgs')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('external-jobs')}
            data-testid="tab-external-jobs-btn"
            className={`rounded-md px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'external-jobs'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('tabExternalJobs')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            data-testid="tab-audit-btn"
            className={`rounded-md px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'audit'
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t('tabAudit')}
          </button>
        </div>
      </div>

      {feedbackMessage && (
        <div
          data-testid="admin-feedback-banner"
          className="my-4 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm font-medium text-brand-900 flex items-center justify-between"
        >
          <span>{feedbackMessage}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-xs font-bold text-brand-700 hover:underline ml-4"
          >
            Fermer
          </button>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 1: ORGANIZATIONS VERIFICATION                                     */}
      {/* ==================================================================== */}
      {activeTab === 'orgs' && (
        <div className="mt-6">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t('filterStatus')}:
              </span>
              {(['ALL', 'PENDING', 'VERIFIED', 'REJECTED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  data-testid={`filter-org-${st.toLowerCase()}-btn`}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    statusFilter === st
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {st === 'ALL'
                    ? t('allStatuses')
                    : st === 'PENDING'
                      ? t('statusPending')
                      : st === 'VERIFIED'
                        ? t('statusVerified')
                        : t('statusRejected')}
                </button>
              ))}
            </div>
          </div>

          {/* Organizations Table */}
          {isOrgsLoading ? (
            <div className="flex justify-center items-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-brand-600 border-t-transparent" />
            </div>
          ) : orgs.length === 0 ? (
            <div
              data-testid="admin-orgs-empty"
              className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center"
            >
              <p className="text-sm font-medium text-gray-600">{t('emptyOrgs')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-xs text-left rtl:text-right">
                <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">{t('legalName')}</th>
                    <th className="px-4 py-3">{t('tradeName')}</th>
                    <th className="px-4 py-3">{t('ice')}</th>
                    <th className="px-4 py-3">{t('cityRegion')}</th>
                    <th className="px-4 py-3">{t('filterStatus')}</th>
                    <th className="px-4 py-3">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-sans text-gray-700">
                  {orgs.map((org) => (
                    <tr key={org.id} data-testid={`org-row-${org.id}`} className="hover:bg-gray-50/70">
                      <td className="px-4 py-3 font-semibold text-gray-900">{org.legalName}</td>
                      <td className="px-4 py-3 text-gray-700">{org.tradeName || '—'}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-gray-600">
                        {org.identifierIce || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {org.cityName || '—'} ({org.regionCode || '—'})
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            org.verificationStatus === 'VERIFIED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : org.verificationStatus === 'REJECTED'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {org.verificationStatus}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {org.verificationStatus === 'PENDING' && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setActionOrgId(org.id);
                                setActionType('VERIFIED');
                              }}
                              data-testid={`verify-org-btn-${org.id}`}
                              className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                            >
                              {t('verifyBtn')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActionOrgId(org.id);
                                setActionType('REJECTED');
                              }}
                              data-testid={`reject-org-btn-${org.id}`}
                              className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 transition"
                            >
                              {t('rejectBtn')}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal Validation/Rejet Org */}
          {actionOrgId && actionType && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  {actionType === 'VERIFIED' ? t('confirmVerify') : t('confirmReject')}
                </h3>
                <p className="text-xs text-gray-600 mb-4">
                  {actionType === 'VERIFIED'
                    ? 'Confirmez-vous que les informations légales (ICE) ont été vérifiées ?'
                    : "Veuillez indiquer la raison du rejet de l'organisation."}
                </p>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={t('reasonPlaceholder')}
                  data-testid="admin-action-reason-input"
                  className="w-full rounded-xl border border-gray-300 p-3 text-xs focus:border-brand-500 focus:outline-none"
                  rows={3}
                />
                <div className="mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActionOrgId(null);
                      setActionType(null);
                      setActionReason('');
                    }}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleVerifyOrReject}
                    disabled={isSubmittingAction}
                    data-testid="admin-confirm-action-btn"
                    className={`rounded-lg px-4 py-2 text-xs font-bold text-white shadow-sm transition ${
                      actionType === 'VERIFIED'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {isSubmittingAction ? 'En cours…' : 'Confirmer'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: EXTERNAL JOBS AGGREGATOR (NOUVELLE FONCTIONNALITÉ SPRINT 5+)  */}
      {/* ==================================================================== */}
      {activeTab === 'external-jobs' && (
        <div className="mt-6 space-y-6" data-testid="external-jobs-admin-section">
          {/* Top Status Badges / Metrics */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <div className="text-xs font-semibold text-amber-800">
                {t('externalJobs.statusPending')}
              </div>
              <div
                className="mt-1 text-2xl font-bold text-amber-900"
                data-testid="stat-pending-count"
              >
                {externalCounts.PENDING_REVIEW}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
              <div className="text-xs font-semibold text-emerald-800">
                {t('externalJobs.statusPublished')}
              </div>
              <div
                className="mt-1 text-2xl font-bold text-emerald-900"
                data-testid="stat-published-count"
              >
                {externalCounts.PUBLISHED}
              </div>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
              <div className="text-xs font-semibold text-red-800">
                {t('externalJobs.statusRejected')}
              </div>
              <div
                className="mt-1 text-2xl font-bold text-red-900"
                data-testid="stat-rejected-count"
              >
                {externalCounts.REJECTED}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
              <div className="text-xs font-semibold text-gray-700">
                {t('externalJobs.statusExpired')}
              </div>
              <div
                className="mt-1 text-2xl font-bold text-gray-900"
                data-testid="stat-expired-count"
              >
                {externalCounts.EXPIRED}
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Statut :
              </span>
              {(['PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'EXPIRED', 'ALL'] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setExternalFilterStatus(st);
                      setExternalPage(1);
                    }}
                    data-testid={`filter-ext-${st.toLowerCase()}-btn`}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      externalFilterStatus === st
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {st === 'ALL'
                      ? t('externalJobs.allStatuses')
                      : st === 'PENDING_REVIEW'
                        ? t('externalJobs.statusPending')
                        : st === 'PUBLISHED'
                          ? t('externalJobs.statusPublished')
                          : st === 'REJECTED'
                            ? t('externalJobs.statusRejected')
                            : t('externalJobs.statusExpired')}
                  </button>
                ),
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Collecter RSS */}
              <button
                type="button"
                onClick={handleCollectRss}
                disabled={isCollectingRss}
                data-testid="admin-collect-rss-btn"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50 transition"
              >
                {isCollectingRss ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Collecte en cours…</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z"
                      />
                    </svg>
                    <span>{t('externalJobs.collectRssBtn')}</span>
                  </>
                )}
              </button>

              {/* Importer URL */}
              <button
                type="button"
                onClick={() => {
                  setImportUrl('');
                  setImportError(null);
                  setIsImportModalOpen(true);
                }}
                data-testid="admin-import-url-btn"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-700 transition"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span>{t('externalJobs.importUrlBtn')}</span>
              </button>
            </div>
          </div>

          {rssFeedback && (
            <div
              data-testid="admin-rss-feedback-banner"
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-medium text-amber-900 flex items-center justify-between"
            >
              <span>{rssFeedback}</span>
              <button
                type="button"
                onClick={() => setRssFeedback(null)}
                className="text-xs font-bold text-amber-800 hover:underline"
              >
                Fermer
              </button>
            </div>
          )}

          {/* Listings Table */}
          {isExternalLoading ? (
            <div className="flex justify-center items-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-brand-600 border-t-transparent" />
            </div>
          ) : externalJobs.length === 0 ? (
            <div
              data-testid="admin-external-empty"
              className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center"
            >
              <p className="text-sm font-medium text-gray-600">{t('externalJobs.empty')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-xs text-left rtl:text-right">
                <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">{t('externalJobs.titleCol')}</th>
                    <th className="px-4 py-3">{t('externalJobs.orgCol')}</th>
                    <th className="px-4 py-3">{t('externalJobs.cityCol')}</th>
                    <th className="px-4 py-3">{t('externalJobs.sourceCol')}</th>
                    <th className="px-4 py-3">{t('externalJobs.statusCol')}</th>
                    <th className="px-4 py-3">{t('externalJobs.dateCol')}</th>
                    <th className="px-4 py-3 text-right rtl:text-left">
                      {t('externalJobs.actionsCol')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-sans text-gray-700">
                  {externalJobs.map((job) => (
                    <tr
                      key={job.id}
                      data-testid={`external-job-row-${job.id}`}
                      className="hover:bg-gray-50/70"
                    >
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-semibold text-gray-900 truncate" title={job.title}>
                          {job.title}
                        </div>
                        <div className="text-[11px] text-gray-500 truncate mt-0.5">
                          {job.contractType} • {job.category}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium">
                        {job.organizationName || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{job.cityName || 'Maroc'}</td>
                      <td className="px-4 py-3">
                        <a
                          href={job.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 hover:underline"
                        >
                          <span className="truncate max-w-[120px]">
                            {job.sourceName || job.sourcePlatform || 'Dreamjob.ma'}
                          </span>
                          <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            job.status === 'PUBLISHED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : job.status === 'PENDING_REVIEW'
                                ? 'bg-amber-100 text-amber-800'
                                : job.status === 'REJECTED'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {job.status === 'PENDING_REVIEW'
                            ? t('externalJobs.statusPending')
                            : job.status === 'PUBLISHED'
                              ? t('externalJobs.statusPublished')
                              : job.status === 'REJECTED'
                                ? t('externalJobs.statusRejected')
                                : t('externalJobs.statusExpired')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(
                          job.discoveredAt || job.collectedAt || Date.now(),
                        ).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right rtl:text-left whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {job.status === 'PENDING_REVIEW' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openReviewModal(job)}
                                data-testid={`review-btn-${job.id}`}
                                className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 border border-brand-200 hover:bg-brand-100 transition"
                              >
                                {t('externalJobs.reviewBtn')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDirectReview(job.id, 'APPROVE')}
                                data-testid={`direct-approve-btn-${job.id}`}
                                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition"
                              >
                                {t('externalJobs.publishBtn')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDirectReview(job.id, 'REJECT')}
                                data-testid={`direct-reject-btn-${job.id}`}
                                className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 border border-red-200 hover:bg-red-100 transition"
                              >
                                {t('externalJobs.rejectBtn')}
                              </button>
                            </>
                          )}
                          {job.status === 'PUBLISHED' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openReviewModal(job)}
                                className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 border border-gray-200 hover:bg-gray-100 transition"
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDirectReview(job.id, 'EXPIRE')}
                                data-testid={`expire-btn-${job.id}`}
                                className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 transition"
                              >
                                {t('externalJobs.expireBtn')}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {externalTotalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-gray-600 pt-2">
              <span>
                Page {externalPage} sur {externalTotalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={externalPage <= 1 || isExternalLoading}
                  onClick={() => setExternalPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-gray-200 bg-white px-3 py-1.5 text-gray-700 disabled:opacity-40"
                >
                  ← Précédent
                </button>
                <button
                  type="button"
                  disabled={externalPage >= externalTotalPages || isExternalLoading}
                  onClick={() => setExternalPage((p) => p + 1)}
                  className="rounded border border-gray-200 bg-white px-3 py-1.5 text-gray-700 disabled:opacity-40"
                >
                  Suivant →
                </button>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Modal 1: Importer une URL externe (avec anti-SSRF)                 */}
          {/* ---------------------------------------------------------------- */}
          {isImportModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">
                    {t('externalJobs.importModalTitle')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                  {t('externalJobs.importModalDesc')}
                </p>
                <form onSubmit={handleImportUrlSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      URL de l&apos;annonce
                    </label>
                    <input
                      type="url"
                      required
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      placeholder={t('externalJobs.urlPlaceholder')}
                      data-testid="admin-import-url-input"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none"
                    />
                  </div>

                  {importError && (
                    <div
                      data-testid="admin-import-url-error"
                      className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800"
                    >
                      {importError}
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsImportModalOpen(false)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isImporting}
                      data-testid="admin-submit-import-url-btn"
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                    >
                      {isImporting ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          <span>Importation…</span>
                        </>
                      ) : (
                        <span>{t('externalJobs.importSubmit')}</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* Modal 2: Modération & Ajustement de l'annonce                      */}
          {/* ---------------------------------------------------------------- */}
          {reviewJob && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">
                    {t('externalJobs.reviewModalTitle')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setReviewJob(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                  {t('externalJobs.reviewModalDesc')}
                </p>

                <div className="mb-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-gray-700">Source :</span>{' '}
                    {reviewJob.sourcePlatform} ({reviewJob.sourceDomain})
                  </div>
                  <a
                    href={reviewJob.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-brand-600 hover:underline"
                  >
                    Consulter l&apos;annonce originale ↗
                  </a>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">
                      {t('externalJobs.fieldTitle')}
                    </label>
                    <input
                      type="text"
                      value={reviewForm.title}
                      onChange={(e) => setReviewForm({ ...reviewForm, title: e.target.value })}
                      data-testid="admin-review-title-input"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">
                        {t('externalJobs.fieldOrg')}
                      </label>
                      <input
                        type="text"
                        value={reviewForm.organizationName}
                        onChange={(e) =>
                          setReviewForm({ ...reviewForm, organizationName: e.target.value })
                        }
                        data-testid="admin-review-org-input"
                        className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">
                        {t('externalJobs.fieldCity')}
                      </label>
                      <input
                        type="text"
                        value={reviewForm.cityName}
                        onChange={(e) => setReviewForm({ ...reviewForm, cityName: e.target.value })}
                        data-testid="admin-review-city-input"
                        className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">
                        {t('externalJobs.fieldContract')}
                      </label>
                      <input
                        type="text"
                        value={reviewForm.contractType}
                        onChange={(e) =>
                          setReviewForm({ ...reviewForm, contractType: e.target.value })
                        }
                        data-testid="admin-review-contract-input"
                        className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">
                        {t('externalJobs.fieldCategory')}
                      </label>
                      <input
                        type="text"
                        value={reviewForm.category}
                        onChange={(e) => setReviewForm({ ...reviewForm, category: e.target.value })}
                        data-testid="admin-review-category-input"
                        className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">
                      {t('externalJobs.fieldSummary')}
                    </label>
                    <textarea
                      rows={4}
                      value={reviewForm.descriptionSummary}
                      onChange={(e) =>
                        setReviewForm({ ...reviewForm, descriptionSummary: e.target.value })
                      }
                      data-testid="admin-review-summary-input"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-700 mb-1 text-red-700">
                      {t('externalJobs.fieldRejectionReason')}
                    </label>
                    <input
                      type="text"
                      placeholder="Motif du rejet si l'annonce n'est pas retenue…"
                      value={reviewForm.rejectionReason}
                      onChange={(e) =>
                        setReviewForm({ ...reviewForm, rejectionReason: e.target.value })
                      }
                      data-testid="admin-review-rejection-input"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-xs text-gray-900 focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isSubmittingReview}
                      onClick={() => handleReviewAction('REJECT')}
                      data-testid="admin-review-reject-action-btn"
                      className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {t('externalJobs.confirmReject')}
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingReview}
                      onClick={() => handleReviewAction('EXPIRE')}
                      data-testid="admin-review-expire-action-btn"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {t('externalJobs.confirmExpire')}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReviewJob(null)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={isSubmittingReview}
                      onClick={() => handleReviewAction('APPROVE')}
                      data-testid="admin-review-approve-action-btn"
                      className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {isSubmittingReview ? 'Enregistrement…' : t('externalJobs.approveAndPublish')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: AUDIT LOGS                                                    */}
      {/* ==================================================================== */}
      {activeTab === 'audit' && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-gray-500">
              Page {auditPage} sur {auditTotalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={auditPage <= 1 || isAuditLoading}
                onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                data-testid="audit-prev-page-btn"
                className="rounded border border-gray-200 bg-white px-2.5 py-1 text-gray-700 disabled:opacity-40"
              >
                ← Précédent
              </button>
              <button
                type="button"
                disabled={auditPage >= auditTotalPages || isAuditLoading}
                onClick={() => setAuditPage((p) => p + 1)}
                data-testid="audit-next-page-btn"
                className="rounded border border-gray-200 bg-white px-2.5 py-1 text-gray-700 disabled:opacity-40"
              >
                Suivant →
              </button>
            </div>
          </div>

          {isAuditLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            </div>
          ) : auditLogs.length === 0 ? (
            <div
              data-testid="admin-audit-empty"
              className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-12 text-center"
            >
              <p className="text-sm font-medium text-gray-600">{t('audit.emptyAudit')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-gray-200 text-xs text-left rtl:text-right">
                <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">{t('audit.timestamp')}</th>
                    <th className="px-4 py-3">{t('audit.action')}</th>
                    <th className="px-4 py-3">{t('audit.entity')}</th>
                    <th className="px-4 py-3">{t('audit.user')}</th>
                    <th className="px-4 py-3">{t('audit.ip')}</th>
                    <th className="px-4 py-3">{t('audit.details')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-mono text-[11px] text-gray-700">
                  {auditLogs.map((log) => (
                    <tr key={log.id} data-testid={`audit-row-${log.id}`} className="hover:bg-gray-50/70">
                      <td className="px-4 py-2.5 whitespace-nowrap font-sans text-gray-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="rounded bg-brand-50 px-2 py-0.5 font-semibold text-brand-800 border border-brand-200">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {log.entityType} ({log.entityId ? log.entityId.slice(0, 8) + '…' : '—'})
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-600">
                        {log.userId ? log.userId.slice(0, 8) + '…' : 'Système'}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-gray-500">
                        {log.ipAddress || '—'}
                      </td>
                      <td className="px-4 py-2.5 max-w-xs truncate text-gray-500 font-sans text-[11px]">
                        {log.details ? JSON.stringify(log.details) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
