'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useAuth } from '@/context/auth-context';
import {
  applicationsApi,
  ApplicationStatus,
  CreateJobOfferPayload,
  InterviewMode,
  JobOffer,
  MoroccanRegion,
  offersApi,
  OrgMemberItem,
  orgMembersApi,
  RecommendedCandidate,
  RecruiterApplication,
  referenceApi,
  RefSkill,
  RefSpecialty,
  UserOrganizationMembership,
} from '@/lib/api-client';

export default function OrganizationOffersPage() {
  const t = useTranslations('offers');
  const tProfile = useTranslations('candidate.profile');
  const tApps = useTranslations('applications');
  const tMembers = useTranslations('orgMembers');
  const locale = useLocale();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [memberships, setMemberships] = useState<UserOrganizationMembership[]>(
    [],
  );
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [regions, setRegions] = useState<MoroccanRegion[]>([]);
  const [specialties, setSpecialties] = useState<RefSpecialty[]>([]);
  const [skillsCatalog, setSkillsCatalog] = useState<RefSkill[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Formulaire de création d'organisation (si aucune structure n'existe)
  const [orgLegalName, setOrgLegalName] = useState('');
  const [orgTradeName, setOrgTradeName] = useState('');
  const [orgType, setOrgType] = useState('CMPP');
  const [orgIce, setOrgIce] = useState('');
  const [orgPhone, setOrgPhone] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [orgRegion, setOrgRegion] = useState('MA-04');
  const [orgCity, setOrgCity] = useState('');
  const [orgAddress, setOrgAddress] = useState('');

  // Formulaire d'offre (création / édition)
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [offerType, setOfferType] = useState<
    'STAGE_OBSERVATION' | 'STAGE_PFE' | 'EMPLOI'
  >('STAGE_PFE');
  const [contractSubType, setContractSubType] = useState('CONVENTION_STAGE');
  const [requiredDegreeLevel, setRequiredDegreeLevel] =
    useState('BAC_5_MASTER');
  const [targetSpecialtyId, setTargetSpecialtyId] = useState('');
  const [regionCode, setRegionCode] = useState('MA-04');
  const [cityName, setCityName] = useState('');
  const [minExperienceMonths, setMinExperienceMonths] = useState(0);
  const [isExperienceMandatory, setIsExperienceMandatory] = useState(false);
  const [startDate, setStartDate] = useState('2026-04-01');
  const [durationMonths, setDurationMonths] = useState<string>('6');
  const [remunerationStipend, setRemunerationStipend] = useState('');
  const [description, setDescription] = useState('');
  const [requiredSkills, setRequiredSkills] = useState<
    Array<{
      skillId: string;
      isMandatory: boolean;
      minRequiredLevel: string;
      weight: number;
    }>
  >([]);
  const [requiredLanguages, setRequiredLanguages] = useState<
    Array<{
      languageCode: string;
      minProficiencyLevel: string;
      isMandatory: boolean;
    }>
  >([]);

  // Sélection temporaire pour ajout de compétence / langue
  const [newSkillId, setNewSkillId] = useState('');
  const [newSkillLevel, setNewSkillLevel] = useState('PRATIQUANT');
  const [newSkillMandatory, setNewSkillMandatory] = useState(true);
  const [newLangCode, setNewLangCode] = useState('FR');
  const [newLangProf, setNewLangProf] = useState('COURANT_PROFESSIONNEL');

  // Panneau de candidats recommandés (M3.3 Matching)
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);
  const [minScoreFilter, setMinScoreFilter] = useState<number>(60);
  const [recommendedCandidates, setRecommendedCandidates] = useState<
    RecommendedCandidate[]
  >([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] =
    useState(false);
  const [invitingCandidateId, setInvitingCandidateId] = useState<string | null>(
    null,
  );

  // Panneau de gestion des candidatures reçues & invitations (Sprint 4)
  const [expandedAppsOfferId, setExpandedAppsOfferId] = useState<string | null>(
    null,
  );
  const [offerApplications, setOfferApplications] = useState<
    RecruiterApplication[]
  >([]);
  const [isLoadingApplications, setIsLoadingApplications] = useState(false);
  const [activeRecruiterForm, setActiveRecruiterForm] = useState<{
    appId: string;
    action: 'INTERVIEW' | 'OFFER' | 'REJECT';
  } | null>(null);
  const [interviewDateInput, setInterviewDateInput] = useState('');
  const [interviewModeInput, setInterviewModeInput] =
    useState<InterviewMode>('IN_PERSON');
  const [interviewLocationInput, setInterviewLocationInput] = useState('');
  const [offerDetailsInput, setOfferDetailsInput] = useState('');
  const [offerDeadlineInput, setOfferDeadlineInput] = useState('');
  const [recruiterCommentInput, setRecruiterCommentInput] = useState('');
  const [transitioningAppId, setTransitioningAppId] = useState<string | null>(
    null,
  );
  const [downloadingCvAppId, setDownloadingCvAppId] = useState<string | null>(
    null,
  );

  // Gestion des membres d'organisation (Sprint 5)
  const [members, setMembers] = useState<OrgMemberItem[]>([]);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<
    'ADMIN' | 'RECRUITER' | 'VIEWER'
  >('RECRUITER');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberSuccess, setMemberSuccess] = useState<string | null>(null);

  const loadOrgMembers = useCallback(async (orgId: string) => {
    if (!orgId) return;
    setIsMembersLoading(true);
    try {
      const res = await orgMembersApi.listMembers(orgId);
      setMembers(res.data || []);
    } catch {
      setMembers([]);
    } finally {
      setIsMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedOrgId) {
      loadOrgMembers(selectedOrgId);
    }
  }, [selectedOrgId, loadOrgMembers]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId || !newMemberEmail.trim()) return;
    setIsAddingMember(true);
    setMemberError(null);
    setMemberSuccess(null);
    try {
      await orgMembersApi.addMember(selectedOrgId, {
        email: newMemberEmail.trim(),
        role: newMemberRole,
      });
      setMemberSuccess(tMembers('memberAdded'));
      setNewMemberEmail('');
      await loadOrgMembers(selectedOrgId);
    } catch (err: any) {
      setMemberError(err.message || 'Failed to add member');
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!selectedOrgId) return;
    if (!window.confirm(tMembers('confirmRemove'))) return;
    setMemberError(null);
    setMemberSuccess(null);
    try {
      await orgMembersApi.removeMember(selectedOrgId, targetUserId);
      setMemberSuccess(tMembers('memberRemoved'));
      await loadOrgMembers(selectedOrgId);
    } catch (err: any) {
      setMemberError(err.message || 'Failed to remove member');
    }
  };

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  const loadInitialData = useCallback(async () => {
    if (!user || user.globalRole !== 'ORGANIZATION_USER') {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [orgsRes, regRes, specRes, skRes] = await Promise.all([
        offersApi.getMyOrganizations(),
        referenceApi.getRegions(),
        referenceApi.getSpecialties(),
        referenceApi.getSkills(),
      ]);

      setMemberships(orgsRes.data);
      setRegions(regRes.data);
      setSpecialties(specRes.data);
      setSkillsCatalog(skRes.data);

      if (specRes.data.length > 0) {
        setTargetSpecialtyId(specRes.data[0].id);
      }

      if (orgsRes.data.length > 0) {
        setSelectedOrgId(orgsRes.data[0].organization.id);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error loading recruiter data',
      );
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      loadInitialData();
    }
  }, [authLoading, user, loadInitialData]);

  const loadOrgOffers = useCallback(async () => {
    if (!selectedOrgId) return;
    setError(null);
    try {
      const res = await offersApi.listOrgOffers(selectedOrgId, {
        status: statusFilter || undefined,
      });
      setOffers(res.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error loading organization offers',
      );
    }
  }, [selectedOrgId, statusFilter]);

  useEffect(() => {
    if (selectedOrgId) {
      loadOrgOffers();
    }
  }, [selectedOrgId, loadOrgOffers]);

  const activeMembership = memberships.find(
    (m) => m.organization.id === selectedOrgId,
  );
  const activeOrg = activeMembership?.organization;
  const activeRole = activeMembership?.role;
  const canWrite =
    activeRole === 'OWNER' ||
    activeRole === 'ADMIN' ||
    activeRole === 'RECRUITER';
  const canArchive = activeRole === 'OWNER' || activeRole === 'ADMIN';

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await offersApi.createOrganization({
        legalName: orgLegalName,
        tradeName: orgTradeName,
        organizationType: orgType,
        identifierIce: orgIce.trim() || undefined,
        phone: orgPhone,
        email: orgEmail,
        regionCode: orgRegion,
        cityName: orgCity,
        addressLine: orgAddress,
      });
      await loadInitialData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error creating organization',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const resetOfferForm = () => {
    setEditingOfferId(null);
    setTitle('');
    setOfferType('STAGE_PFE');
    setContractSubType('CONVENTION_STAGE');
    setRequiredDegreeLevel('BAC_5_MASTER');
    if (specialties.length > 0) setTargetSpecialtyId(specialties[0].id);
    setRegionCode(activeOrg?.regionCode || 'MA-04');
    setCityName(activeOrg?.cityName || '');
    setMinExperienceMonths(0);
    setIsExperienceMandatory(false);
    setStartDate('2026-04-01');
    setDurationMonths('6');
    setRemunerationStipend('');
    setDescription('');
    setRequiredSkills([]);
    setRequiredLanguages([]);
  };

  const openCreateForm = () => {
    resetOfferForm();
    setShowOfferForm(true);
  };

  const openEditForm = (offer: JobOffer) => {
    setEditingOfferId(offer.id);
    setTitle(offer.title);
    setOfferType(offer.offerType);
    setContractSubType(offer.contractSubType);
    setRequiredDegreeLevel(offer.requiredDegreeLevel);
    setTargetSpecialtyId(offer.targetSpecialtyId);
    setRegionCode(offer.regionCode);
    setCityName(offer.cityName);
    setMinExperienceMonths(offer.minExperienceMonths);
    setIsExperienceMandatory(offer.isExperienceMandatory);
    setStartDate(offer.startDate.slice(0, 10));
    setDurationMonths(
      offer.durationMonths !== null && offer.durationMonths !== undefined
        ? String(offer.durationMonths)
        : '',
    );
    setRemunerationStipend(offer.remunerationStipend || '');
    setDescription(offer.description);
    setRequiredSkills(
      (offer.requiredSkills || []).map((s) => ({
        skillId: s.skillId,
        isMandatory: s.isMandatory,
        minRequiredLevel: s.minRequiredLevel,
        weight: s.weight,
      })),
    );
    setRequiredLanguages(
      (offer.requiredLanguages || []).map((l) => ({
        languageCode: l.languageCode,
        minProficiencyLevel: l.minProficiencyLevel,
        isMandatory: l.isMandatory,
      })),
    );
    setShowOfferForm(true);
  };

  const handleSaveOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;
    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);

    const payload: CreateJobOfferPayload = {
      title,
      offerType,
      contractSubType,
      requiredDegreeLevel,
      targetSpecialtyId,
      regionCode,
      cityName,
      minExperienceMonths: Number(minExperienceMonths) || 0,
      isExperienceMandatory,
      startDate,
      durationMonths: durationMonths ? Number(durationMonths) : undefined,
      remunerationStipend: remunerationStipend.trim() || undefined,
      description,
      requiredSkills,
      requiredLanguages,
    };

    try {
      if (editingOfferId) {
        await offersApi.updateOffer(selectedOrgId, editingOfferId, payload);
        setSuccessMsg(t('manage.successUpdated'));
      } else {
        await offersApi.createOffer(selectedOrgId, payload);
        setSuccessMsg(t('manage.successCreated'));
      }
      setShowOfferForm(false);
      resetOfferForm();
      await loadOrgOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving offer');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async (offerId: string) => {
    if (!selectedOrgId) return;
    setError(null);
    setSuccessMsg(null);
    try {
      await offersApi.publishOffer(selectedOrgId, offerId);
      setSuccessMsg(t('manage.successPublished'));
      await loadOrgOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error publishing offer');
    }
  };

  const handleClose = async (offerId: string) => {
    if (!selectedOrgId) return;
    setError(null);
    setSuccessMsg(null);
    try {
      await offersApi.closeOffer(selectedOrgId, offerId);
      setSuccessMsg(t('manage.successClosed'));
      await loadOrgOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error closing offer');
    }
  };

  const handleArchive = async (offerId: string) => {
    if (!selectedOrgId) return;
    setError(null);
    setSuccessMsg(null);
    try {
      await offersApi.archiveOffer(selectedOrgId, offerId);
      setSuccessMsg(t('manage.successArchived'));
      await loadOrgOffers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error archiving offer');
    }
  };

  const fetchRecommendations = async (offerId: string, threshold: number) => {
    setIsLoadingRecommendations(true);
    setError(null);
    try {
      const res = await offersApi.getRecommendedCandidates(offerId, {
        minScore: threshold,
      });
      setRecommendedCandidates(res.data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error loading recommended candidates',
      );
    } finally {
      setIsLoadingRecommendations(false);
    }
  };

  const toggleRecommendationsPanel = async (offerId: string) => {
    if (expandedOfferId === offerId) {
      setExpandedOfferId(null);
      setRecommendedCandidates([]);
      return;
    }
    setExpandedOfferId(offerId);
    await fetchRecommendations(offerId, minScoreFilter);
  };

  const fetchOfferApplications = async (offerId: string) => {
    if (!selectedOrgId) return;
    setIsLoadingApplications(true);
    setError(null);
    try {
      const res = await applicationsApi.listOfferApplications(
        selectedOrgId,
        offerId,
      );
      setOfferApplications(res.data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error loading offer applications',
      );
    } finally {
      setIsLoadingApplications(false);
    }
  };

  const toggleApplicationsPanel = async (offerId: string) => {
    if (expandedAppsOfferId === offerId) {
      setExpandedAppsOfferId(null);
      setOfferApplications([]);
      setActiveRecruiterForm(null);
      return;
    }
    setExpandedAppsOfferId(offerId);
    setActiveRecruiterForm(null);
    await fetchOfferApplications(offerId);
  };

  const handleInviteCandidate = async (
    offerId: string,
    candidateId: string,
  ) => {
    setInvitingCandidateId(candidateId);
    setError(null);
    setSuccessMsg(null);
    try {
      await applicationsApi.inviteCandidate({
        jobOfferId: offerId,
        candidateId,
      });
      setSuccessMsg(tApps('recruiter.inviteSuccess'));
      await fetchRecommendations(offerId, minScoreFilter);
      if (expandedAppsOfferId === offerId) {
        await fetchOfferApplications(offerId);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error inviting candidate',
      );
    } finally {
      setInvitingCandidateId(null);
    }
  };

  const openRecruiterActionForm = (
    appId: string,
    action: 'INTERVIEW' | 'OFFER' | 'REJECT',
  ) => {
    const defaultInterview = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16);
    const defaultDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    setInterviewDateInput(defaultInterview);
    setInterviewModeInput('IN_PERSON');
    setInterviewLocationInput(activeOrg?.cityName || 'Cabinet / Visio');
    setOfferDetailsInput('');
    setOfferDeadlineInput(defaultDeadline);
    setRecruiterCommentInput('');
    setActiveRecruiterForm({ appId, action });
  };

  const handleRecruiterTransition = async (
    offerId: string,
    applicationId: string,
    targetStatus: ApplicationStatus,
  ) => {
    if (!selectedOrgId) return;
    setTransitioningAppId(applicationId);
    setError(null);
    setSuccessMsg(null);
    try {
      await applicationsApi.transitionByRecruiter(selectedOrgId, applicationId, {
        targetStatus,
        comment: recruiterCommentInput.trim() || undefined,
        interviewDate:
          targetStatus === 'INTERVIEW_PROPOSED'
            ? new Date(interviewDateInput).toISOString()
            : undefined,
        interviewMode:
          targetStatus === 'INTERVIEW_PROPOSED'
            ? interviewModeInput
            : undefined,
        interviewLocationOrLink:
          targetStatus === 'INTERVIEW_PROPOSED'
            ? interviewLocationInput.trim()
            : undefined,
        hiringOfferDetails:
          targetStatus === 'OFFER_EXTENDED'
            ? offerDetailsInput.trim()
            : undefined,
        hiringOfferDeadline:
          targetStatus === 'OFFER_EXTENDED' && offerDeadlineInput
            ? new Date(offerDeadlineInput).toISOString()
            : undefined,
      });
      setActiveRecruiterForm(null);
      setSuccessMsg(tApps('recruiter.transitionSuccess'));
      await fetchOfferApplications(offerId);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Error updating application status',
      );
    } finally {
      setTransitioningAppId(null);
    }
  };

  const handleDownloadCandidateCv = async (app: RecruiterApplication) => {
    setDownloadingCvAppId(app.id);
    setError(null);
    try {
      const res = await applicationsApi.getCvDownloadUrl(app.candidateId);
      window.open(res.data.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error downloading CV');
    } finally {
      setDownloadingCvAppId(null);
    }
  };

  const addSkillToOffer = () => {
    if (!newSkillId) return;
    if (requiredSkills.some((s) => s.skillId === newSkillId)) return;
    setRequiredSkills((prev) => [
      ...prev,
      {
        skillId: newSkillId,
        isMandatory: newSkillMandatory,
        minRequiredLevel: newSkillLevel,
        weight: newSkillMandatory ? 2 : 1,
      },
    ]);
    setNewSkillId('');
  };

  const removeSkillFromOffer = (skillId: string) => {
    setRequiredSkills((prev) => prev.filter((s) => s.skillId !== skillId));
  };

  const addLanguageToOffer = () => {
    if (!newLangCode) return;
    if (requiredLanguages.some((l) => l.languageCode === newLangCode)) return;
    setRequiredLanguages((prev) => [
      ...prev,
      {
        languageCode: newLangCode,
        minProficiencyLevel: newLangProf,
        isMandatory: true,
      },
    ]);
  };

  const removeLanguageFromOffer = (code: string) => {
    setRequiredLanguages((prev) =>
      prev.filter((l) => l.languageCode !== code),
    );
  };

  const getSpecialtyLabel = (spec?: RefSpecialty) => {
    if (!spec) return '';
    if (locale === 'ar') return spec.titleAr;
    if (locale === 'en') return spec.titleEn;
    return spec.titleFr;
  };

  const getSkillLabel = (id: string) => {
    const sk = skillsCatalog.find((s) => s.id === id);
    if (!sk) return id;
    if (locale === 'ar') return sk.titleAr;
    if (locale === 'en') return sk.titleEn;
    return sk.titleFr;
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!user || user.globalRole !== 'ORGANIZATION_USER') {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12 text-center">
        <p className="text-sm text-red-600">Accès non autorisé.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1
            data-testid="manage-offers-title"
            className="text-2xl sm:text-3xl font-bold text-gray-900"
          >
            {t('manage.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-600">{t('manage.subtitle')}</p>
        </div>

        {activeOrg && canWrite && !showOfferForm && (
          <button
            type="button"
            onClick={openCreateForm}
            data-testid="new-offer-btn"
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition"
          >
            + {t('manage.newOffer')}
          </button>
        )}
      </div>

      {error && (
        <div
          data-testid="manage-offers-error"
          className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {successMsg && (
        <div
          data-testid="manage-offers-success"
          className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {successMsg}
        </div>
      )}

      {memberships.length === 0 ? (
        /* Formulaire de création d'organisation si l'utilisateur n'en a pas encore */
        <div
          data-testid="create-org-card"
          className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm"
        >
          <h2 className="text-lg font-bold text-gray-900">
            {t('manage.createOrgTitle')}
          </h2>
          <p className="mt-1 text-xs text-gray-600 mb-6">
            {t('manage.createOrgSubtitle')}
          </p>

          <form onSubmit={handleCreateOrganization} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t('manage.legalName')} *
                </label>
                <input
                  type="text"
                  required
                  value={orgLegalName}
                  onChange={(e) => setOrgLegalName(e.target.value)}
                  data-testid="org-legal-name-input"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t('manage.tradeName')} *
                </label>
                <input
                  type="text"
                  required
                  value={orgTradeName}
                  onChange={(e) => setOrgTradeName(e.target.value)}
                  data-testid="org-trade-name-input"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t('manage.orgType')} *
                </label>
                <select
                  value={orgType}
                  onChange={(e) => setOrgType(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                >
                  <option value="CMPP">CMPP</option>
                  <option value="ASSOCIATION">Association</option>
                  <option value="CABINET_LIBERAL">Cabinet libéral</option>
                  <option value="ECOLE_INCLUSIVE">École inclusive</option>
                  <option value="CLINIQUE_SPECIALISEE">
                    Clinique spécialisée
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t('manage.ice')}
                </label>
                <input
                  type="text"
                  pattern="\d{15}"
                  placeholder="001234567890012"
                  value={orgIce}
                  onChange={(e) => setOrgIce(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t('manage.phone')} *
                </label>
                <input
                  type="text"
                  required
                  value={orgPhone}
                  onChange={(e) => setOrgPhone(e.target.value)}
                  data-testid="org-phone-input"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t('manage.email')} *
                </label>
                <input
                  type="email"
                  required
                  value={orgEmail}
                  onChange={(e) => setOrgEmail(e.target.value)}
                  data-testid="org-email-input"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t('manage.formRegion')} *
                </label>
                <select
                  value={orgRegion}
                  onChange={(e) => setOrgRegion(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                >
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
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {t('manage.formCity')} *
                </label>
                <input
                  type="text"
                  required
                  value={orgCity}
                  onChange={(e) => setOrgCity(e.target.value)}
                  data-testid="org-city-input"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {t('manage.address')} *
              </label>
              <input
                type="text"
                required
                value={orgAddress}
                onChange={(e) => setOrgAddress(e.target.value)}
                data-testid="org-address-input"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSaving}
                data-testid="create-org-submit-btn"
                className="rounded-lg bg-brand-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
              >
                {isSaving ? t('manage.saving') : t('manage.createOrgBtn')}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <>
          {/* Bandeau d'état de l'organisation active */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-3">
                {memberships.length > 1 ? (
                  <select
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900"
                  >
                    {memberships.map((m) => (
                      <option
                        key={m.organization.id}
                        value={m.organization.id}
                      >
                        {m.organization.tradeName} ({m.role})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span
                    data-testid="active-org-name"
                    className="text-base font-bold text-gray-900"
                  >
                    {activeOrg?.tradeName}
                  </span>
                )}

                <span
                  data-testid="active-org-role"
                  className="rounded-full bg-brand-50 px-3 py-0.5 text-xs font-semibold text-brand-700 border border-brand-200"
                >
                  {t('manage.yourRole')} : {activeRole}
                </span>

                {activeOrg && (
                  <span
                    data-testid="active-org-verification-badge"
                    className={`rounded-full px-3 py-0.5 text-xs font-semibold border ${
                      activeOrg.verificationStatus === 'VERIFIED'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : activeOrg.verificationStatus === 'REJECTED'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {t(`verification.${activeOrg.verificationStatus}`)}
                  </span>
                )}
              </div>

              {/* Filtre par statut */}
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  data-testid="org-offers-status-filter"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
                >
                  <option value="">{t('statuses.ALL')}</option>
                  <option value="DRAFT">{t('statuses.DRAFT')}</option>
                  <option value="PUBLISHED">{t('statuses.PUBLISHED')}</option>
                  <option value="CLOSED">{t('statuses.CLOSED')}</option>
                  <option value="ARCHIVED">{t('statuses.ARCHIVED')}</option>
                </select>
              </div>
            </div>

            {activeOrg && activeOrg.verificationStatus !== 'VERIFIED' && (
              <div
                data-testid="unverified-org-warning"
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
              >
                {t('verification.unverifiedWarning')}
              </div>
            )}

            {activeRole === 'VIEWER' && (
              <div className="mt-3 text-xs text-gray-500 italic">
                {t('manage.viewerNotice')}
              </div>
            )}

            {/* Toggle Panel Membres & Collaborateurs (Sprint 5) */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowMembersPanel(!showMembersPanel)}
                data-testid="toggle-members-panel-btn"
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                <svg
                  className="h-4 w-4 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <span>
                  {tMembers('title')} ({members.length})
                </span>
                <span className="text-[10px] text-gray-400">
                  {showMembersPanel ? '▲' : '▼'}
                </span>
              </button>
            </div>

            {/* Panneau dépliable de gestion des membres */}
            {showMembersPanel && (
              <div
                data-testid="org-members-panel"
                className="mt-4 pt-4 border-t border-gray-200"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">
                      {tMembers('title')}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {tMembers('subtitle')}
                    </p>
                  </div>
                </div>

                {memberSuccess && (
                  <div
                    data-testid="member-success-banner"
                    className="mb-4 rounded-lg bg-green-50 p-3 text-xs text-green-800 border border-green-200"
                  >
                    {memberSuccess}
                  </div>
                )}
                {memberError && (
                  <div
                    data-testid="member-error-banner"
                    className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-800 border border-red-200"
                  >
                    {memberError}
                  </div>
                )}

                {/* Formulaire d'ajout de membre si OWNER ou ADMIN */}
                {(activeRole === 'OWNER' || activeRole === 'ADMIN') && (
                  <form
                    onSubmit={handleAddMember}
                    data-testid="add-member-form"
                    className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3">
                      {tMembers('addMember')}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {tMembers('emailOrUserId')}
                        </label>
                        <input
                          type="text"
                          required
                          value={newMemberEmail}
                          onChange={(e) => setNewMemberEmail(e.target.value)}
                          placeholder={tMembers('emailPlaceholder')}
                          data-testid="new-member-email-input"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {tMembers('role')}
                        </label>
                        <select
                          value={newMemberRole}
                          onChange={(e) =>
                            setNewMemberRole(
                              e.target.value as 'ADMIN' | 'RECRUITER' | 'VIEWER',
                            )
                          }
                          data-testid="new-member-role-select"
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        >
                          {activeRole === 'OWNER' && (
                            <option value="ADMIN">
                              {tMembers('roleAdmin')}
                            </option>
                          )}
                          <option value="RECRUITER">
                            {tMembers('roleRecruiter')}
                          </option>
                          <option value="VIEWER">
                            {tMembers('roleViewer')}
                          </option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="submit"
                        disabled={isAddingMember}
                        data-testid="submit-add-member-btn"
                        className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50 transition"
                      >
                        {isAddingMember
                          ? tMembers('adding')
                          : tMembers('addMember')}
                      </button>
                    </div>
                  </form>
                )}

                {/* Table des membres existants */}
                {isMembersLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50 text-gray-600 font-semibold">
                        <tr>
                          <th className="px-4 py-2.5 text-left rtl:text-right">
                            Utilisateur
                          </th>
                          <th className="px-4 py-2.5 text-left rtl:text-right">
                            Rôle
                          </th>
                          <th className="px-4 py-2.5 text-left rtl:text-right">
                            Date d&apos;ajout
                          </th>
                          <th className="px-4 py-2.5 text-right rtl:text-left">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {members.map((m) => {
                          const isSelf = m.userId === user?.id;
                          const isTargetOwner = m.role === 'OWNER';
                          const cannotRemove =
                            isTargetOwner ||
                            (activeRole === 'ADMIN' && m.role === 'ADMIN') ||
                            (activeRole !== 'OWNER' && activeRole !== 'ADMIN');

                          return (
                            <tr
                              key={m.id}
                              data-testid={`member-row-${m.userId}`}
                              className="hover:bg-gray-50/70"
                            >
                              <td className="px-4 py-2.5 font-medium text-gray-900">
                                {m.user?.email || m.userId}
                                {isSelf && (
                                  <span className="ml-2 text-[10px] text-gray-400">
                                    (Vous)
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                                    m.role === 'OWNER'
                                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                                      : m.role === 'ADMIN'
                                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                                        : m.role === 'RECRUITER'
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : 'bg-gray-100 text-gray-700 border-gray-200'
                                  }`}
                                >
                                  {m.role}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-gray-500">
                                {new Date(m.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-2.5 text-right rtl:text-left">
                                {cannotRemove ? (
                                  <span className="text-[11px] text-gray-400 italic">
                                    {isTargetOwner
                                      ? tMembers('ownerCannotBeRemoved')
                                      : '—'}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMember(m.userId)}
                                    data-testid={`remove-member-btn-${m.userId}`}
                                    className="rounded border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 transition"
                                  >
                                    {tMembers('removeMember')}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Formulaire de création / modification d'offre */}
          {showOfferForm && canWrite && (
            <div
              data-testid="offer-editor-form-card"
              className="mb-8 rounded-2xl border border-brand-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-5">
                <h2 className="text-lg font-bold text-gray-900">
                  {editingOfferId
                    ? t('manage.editOffer')
                    : t('manage.newOffer')}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowOfferForm(false)}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  {t('manage.cancelForm')}
                </button>
              </div>

              <form onSubmit={handleSaveOffer} className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('manage.formTitle')} *
                    </label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      data-testid="offer-title-input"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('manage.formOfferType')} *
                    </label>
                    <select
                      value={offerType}
                      onChange={(e) =>
                        setOfferType(
                          e.target.value as
                            | 'STAGE_OBSERVATION'
                            | 'STAGE_PFE'
                            | 'EMPLOI',
                        )
                      }
                      data-testid="offer-type-select"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                    >
                      <option value="STAGE_OBSERVATION">
                        {t('types.STAGE_OBSERVATION')}
                      </option>
                      <option value="STAGE_PFE">{t('types.STAGE_PFE')}</option>
                      <option value="EMPLOI">{t('types.EMPLOI')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('manage.formContract')} *
                    </label>
                    <select
                      value={contractSubType}
                      onChange={(e) => setContractSubType(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                    >
                      <option value="CONVENTION_STAGE">
                        {t('contracts.CONVENTION_STAGE')}
                      </option>
                      <option value="CDD">{t('contracts.CDD')}</option>
                      <option value="CDI">{t('contracts.CDI')}</option>
                      <option value="VACATION">
                        {t('contracts.VACATION')}
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('manage.formDegree')} *
                    </label>
                    <select
                      value={requiredDegreeLevel}
                      onChange={(e) => setRequiredDegreeLevel(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                    >
                      <option value="BAC_3">{t('degrees.BAC_3')}</option>
                      <option value="BAC_5_MASTER">
                        {t('degrees.BAC_5_MASTER')}
                      </option>
                      <option value="BAC_8_DOCTORAT">
                        {t('degrees.BAC_8_DOCTORAT')}
                      </option>
                      <option value="DIPLOME_ETAT">
                        {t('degrees.DIPLOME_ETAT')}
                      </option>
                      <option value="DU_SPECIALISE">
                        {t('degrees.DU_SPECIALISE')}
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('manage.formSpecialty')} *
                    </label>
                    <select
                      value={targetSpecialtyId}
                      onChange={(e) => setTargetSpecialtyId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                    >
                      {specialties.map((s) => (
                        <option key={s.id} value={s.id}>
                          {getSpecialtyLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('manage.formRegion')} *
                    </label>
                    <select
                      value={regionCode}
                      onChange={(e) => setRegionCode(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                    >
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
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('manage.formCity')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={cityName}
                      onChange={(e) => setCityName(e.target.value)}
                      data-testid="offer-city-input"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('manage.formStartDate')} *
                    </label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('manage.formDuration')}
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={durationMonths}
                      onChange={(e) => setDurationMonths(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('manage.formMinExp')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={600}
                      value={minExperienceMonths}
                      onChange={(e) =>
                        setMinExperienceMonths(Number(e.target.value))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('manage.formRemuneration')}
                    </label>
                    <input
                      type="text"
                      value={remunerationStipend}
                      onChange={(e) => setRemunerationStipend(e.target.value)}
                      placeholder="Ex: 2000 MAD / mois"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="expMandatory"
                    type="checkbox"
                    checked={isExperienceMandatory}
                    onChange={(e) => setIsExperienceMandatory(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600"
                  />
                  <label
                    htmlFor="expMandatory"
                    className="text-xs font-medium text-gray-700"
                  >
                    {t('manage.formExpMandatory')}
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('manage.formDescription')} *
                  </label>
                  <textarea
                    rows={4}
                    required
                    minLength={10}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    data-testid="offer-description-input"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                  />
                </div>

                {/* Compétences requises */}
                <div className="border-t border-gray-100 pt-4">
                  <h3 className="text-xs font-bold text-gray-800 mb-2">
                    {t('public.requiredSkills')}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <select
                      value={newSkillId}
                      onChange={(e) => setNewSkillId(e.target.value)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900"
                    >
                      <option value="">{tProfile('selectSkill')}</option>
                      {skillsCatalog.map((sk) => (
                        <option key={sk.id} value={sk.id}>
                          {locale === 'ar'
                            ? sk.titleAr
                            : locale === 'en'
                              ? sk.titleEn
                              : sk.titleFr}
                        </option>
                      ))}
                    </select>

                    <select
                      value={newSkillLevel}
                      onChange={(e) => setNewSkillLevel(e.target.value)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900"
                    >
                      <option value="NOTIONS">
                        {tProfile('levelNotions')}
                      </option>
                      <option value="PRATIQUANT">
                        {tProfile('levelPratiquant')}
                      </option>
                      <option value="AUTONOME">
                        {tProfile('levelAutonome')}
                      </option>
                      <option value="EXPERT">{tProfile('levelExpert')}</option>
                    </select>

                    <label className="inline-flex items-center gap-1.5 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={newSkillMandatory}
                        onChange={(e) => setNewSkillMandatory(e.target.checked)}
                        className="rounded border-gray-300 text-brand-600"
                      />
                      {t('public.mandatory')}
                    </label>

                    <button
                      type="button"
                      onClick={addSkillToOffer}
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-200"
                    >
                      + {tProfile('addSkill')}
                    </button>
                  </div>

                  {requiredSkills.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {requiredSkills.map((rs) => (
                        <span
                          key={rs.skillId}
                          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-800"
                        >
                          <span>
                            {getSkillLabel(rs.skillId)} ({rs.minRequiredLevel} •{' '}
                            {rs.isMandatory
                              ? t('public.mandatory')
                              : t('public.desirable')}
                            )
                          </span>
                          <button
                            type="button"
                            onClick={() => removeSkillFromOffer(rs.skillId)}
                            className="text-red-600 hover:text-red-800 font-bold"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Langues requises */}
                <div className="border-t border-gray-100 pt-4">
                  <h3 className="text-xs font-bold text-gray-800 mb-2">
                    {t('public.requiredLanguages')}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <select
                      value={newLangCode}
                      onChange={(e) => setNewLangCode(e.target.value)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900"
                    >
                      <option value="FR">Français (FR)</option>
                      <option value="AR_STANDARD">Arabe Standard</option>
                      <option value="AR_DARIJA">Darija Marocaine</option>
                      <option value="EN">English (EN)</option>
                    </select>

                    <select
                      value={newLangProf}
                      onChange={(e) => setNewLangProf(e.target.value)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900"
                    >
                      <option value="NOTIONS">{tProfile('profNotions')}</option>
                      <option value="INTERMEDIAIRE">
                        {tProfile('profIntermediaire')}
                      </option>
                      <option value="COURANT_PROFESSIONNEL">
                        {tProfile('profCourant')}
                      </option>
                      <option value="LANGUE_MATERNELLE">
                        {tProfile('profMaternelle')}
                      </option>
                    </select>

                    <button
                      type="button"
                      onClick={addLanguageToOffer}
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-800 hover:bg-gray-200"
                    >
                      + {tProfile('addLanguage')}
                    </button>
                  </div>

                  {requiredLanguages.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {requiredLanguages.map((rl) => (
                        <span
                          key={rl.languageCode}
                          className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-800"
                        >
                          <span>
                            {rl.languageCode} : {rl.minProficiencyLevel}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              removeLanguageFromOffer(rl.languageCode)
                            }
                            className="text-red-600 hover:text-red-800 font-bold"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowOfferForm(false)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t('manage.cancelForm')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    data-testid="save-offer-submit-btn"
                    className="rounded-lg bg-brand-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                  >
                    {isSaving
                      ? t('manage.saving')
                      : editingOfferId
                        ? t('manage.saveChanges')
                        : t('manage.saveDraft')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Liste des offres de l'organisation */}
          {offers.length === 0 ? (
            <div
              data-testid="no-org-offers"
              className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500"
            >
              {t('manage.noOrgOffers')}
            </div>
          ) : (
            <div className="space-y-4" data-testid="org-offers-list">
              {offers.map((offer) => (
                <div
                  key={offer.id}
                  data-testid={`org-offer-card-${offer.id}`}
                  className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span
                          data-testid={`org-offer-status-${offer.id}`}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                            offer.status === 'PUBLISHED'
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : offer.status === 'DRAFT'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200'
                          }`}
                        >
                          {t(`statuses.${offer.status}`)}
                        </span>
                        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                          {t(`types.${offer.offerType}`)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {offer.cityName} ({offer.regionCode})
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-gray-900">
                        {offer.status === 'PUBLISHED' ? (
                          <Link
                            href={`/offers/${offer.id}`}
                            className="hover:text-brand-600 transition"
                          >
                            {offer.title}
                          </Link>
                        ) : (
                          offer.title
                        )}
                      </h3>

                      <p className="mt-1 text-xs text-gray-500">
                        {getSpecialtyLabel(offer.targetSpecialty)} •{' '}
                        {t(`degrees.${offer.requiredDegreeLevel}`)}
                      </p>
                    </div>

                    {/* Actions selon rôle et statut */}
                    <div className="flex flex-wrap items-center gap-2">
                      {canWrite && offer.status !== 'ARCHIVED' && (
                        <button
                          type="button"
                          onClick={() => openEditForm(offer)}
                          data-testid={`edit-offer-btn-${offer.id}`}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          {t('manage.editOffer')}
                        </button>
                      )}

                      {canWrite &&
                        (offer.status === 'DRAFT' ||
                          offer.status === 'PAUSED') && (
                          <button
                            type="button"
                            onClick={() => handlePublish(offer.id)}
                            disabled={
                              activeOrg?.verificationStatus !== 'VERIFIED'
                            }
                            data-testid={`publish-offer-btn-${offer.id}`}
                            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {t('manage.publish')}
                          </button>
                        )}

                      {canWrite && offer.status === 'PUBLISHED' && (
                        <button
                          type="button"
                          onClick={() => handleClose(offer.id)}
                          data-testid={`close-offer-btn-${offer.id}`}
                          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                        >
                          {t('manage.close')}
                        </button>
                      )}

                      {canArchive && offer.status !== 'ARCHIVED' && (
                        <button
                          type="button"
                          onClick={() => handleArchive(offer.id)}
                          data-testid={`archive-offer-btn-${offer.id}`}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                        >
                          {t('manage.archive')}
                        </button>
                      )}

                      {canWrite &&
                        activeOrg?.verificationStatus === 'VERIFIED' && (
                          <button
                            type="button"
                            onClick={() => toggleRecommendationsPanel(offer.id)}
                            data-testid={`view-recommendations-btn-${offer.id}`}
                            className="rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
                          >
                            {expandedOfferId === offer.id
                              ? t('matching.hideRecommendations')
                              : t('matching.viewRecommendations')}
                          </button>
                        )}

                      <button
                        type="button"
                        onClick={() => toggleApplicationsPanel(offer.id)}
                        data-testid={`view-applications-btn-${offer.id}`}
                        className="rounded-lg border border-brand-300 bg-brand-50 px-3.5 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100 transition"
                      >
                        {expandedAppsOfferId === offer.id
                          ? tApps('recruiter.hideApplicationsBtn')
                          : tApps('recruiter.viewApplicationsBtn')}
                      </button>
                    </div>
                  </div>

                  {/* Panneau de candidats recommandés (M3.3 Matching) */}
                  {expandedOfferId === offer.id && (
                    <div
                      data-testid={`recommendations-panel-${offer.id}`}
                      className="mt-6 border-t border-gray-100 pt-5 space-y-4"
                    >
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                        <h4
                          data-testid="recommendations-panel-title"
                          className="text-sm font-bold text-gray-900"
                        >
                          {t('matching.panelTitle')}
                        </h4>

                        <div className="flex flex-wrap items-center gap-2">
                          <label className="text-xs font-medium text-gray-700">
                            {t('matching.minScoreLabel')}
                          </label>
                          <select
                            value={minScoreFilter}
                            onChange={(e) => {
                              const nextScore = Number(e.target.value);
                              setMinScoreFilter(nextScore);
                              fetchRecommendations(offer.id, nextScore);
                            }}
                            data-testid={`recommendations-minscore-select-${offer.id}`}
                            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-900"
                          >
                            <option value={0}>0%</option>
                            <option value={40}>40%</option>
                            <option value={60}>60%</option>
                            <option value={75}>75%</option>
                            <option value={85}>85%</option>
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              fetchRecommendations(offer.id, minScoreFilter)
                            }
                            data-testid={`recommendations-refresh-btn-${offer.id}`}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            {t('matching.refreshBtn')}
                          </button>
                        </div>
                      </div>

                      {/* Mention d'aide à la décision RH & Loi 09-08 */}
                      <div
                        data-testid="matching-hr-disclaimer"
                        className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 leading-relaxed"
                      >
                        {t('matching.disclaimer')}
                      </div>

                      {isLoadingRecommendations ? (
                        <div className="flex justify-center py-6">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                        </div>
                      ) : recommendedCandidates.length === 0 ? (
                        <div
                          data-testid="no-recommended-candidates"
                          className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-xs text-gray-600"
                        >
                          {t('matching.noCandidates')}
                        </div>
                      ) : (
                        <div
                          data-testid="recommended-candidates-list"
                          className="space-y-4"
                        >
                          {recommendedCandidates.map((cand) => (
                            <div
                              key={cand.candidateId}
                              data-testid={`recommended-candidate-card-${cand.candidateId}`}
                              className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-3"
                            >
                              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    data-testid="candidate-anonymized-id"
                                    className="text-sm font-bold text-gray-900"
                                  >
                                    {cand.displayName}
                                  </span>
                                  <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200">
                                    {t('matching.anonymizedBadge')}
                                  </span>
                                  <span className="text-xs text-gray-600">
                                    {cand.cityName} ({cand.regionCode} • ±
                                    {cand.mobilityRadiusKm} km)
                                  </span>
                                  {cand.openToRelocation && (
                                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700 border border-teal-200">
                                      {t('matching.relocationYes')}
                                    </span>
                                  )}
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                                      cand.mandatoryCriteriaSatisfied
                                        ? 'bg-green-50 text-green-700 border-green-200'
                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                    }`}
                                  >
                                    {cand.mandatoryCriteriaSatisfied
                                      ? t('matching.mandatoryOk')
                                      : t('matching.mandatoryMissing')}
                                  </span>
                                  <span
                                    data-testid="candidate-total-score"
                                    className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-bold text-white shadow-sm"
                                  >
                                    {t('matching.totalScore')} :{' '}
                                    {cand.totalScore.toFixed(2)}%
                                  </span>

                                  {canWrite &&
                                    offer.status === 'PUBLISHED' &&
                                    (cand.hasApplied ? (
                                      <span
                                        data-testid={`candidate-applied-badge-${cand.candidateId}`}
                                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                                      >
                                        {tApps('recruiter.appliedBadge')}
                                      </span>
                                    ) : cand.isInvited ? (
                                      <span
                                        data-testid={`candidate-invited-badge-${cand.candidateId}`}
                                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"
                                      >
                                        {tApps('recruiter.invitedBadge')}
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={
                                          invitingCandidateId ===
                                          cand.candidateId
                                        }
                                        onClick={() =>
                                          handleInviteCandidate(
                                            offer.id,
                                            cand.candidateId,
                                          )
                                        }
                                        data-testid={`invite-candidate-btn-${cand.candidateId}`}
                                        className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition"
                                      >
                                        {invitingCandidateId ===
                                        cand.candidateId
                                          ? tApps('recruiter.inviting')
                                          : tApps('recruiter.inviteBtn')}
                                      </button>
                                    ))}
                                </div>
                              </div>

                              {/* Sous-scores des 6 dimensions */}
                              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                                <div className="rounded-lg border border-gray-200 bg-white p-2 text-center">
                                  <div className="text-[11px] text-gray-500">
                                    {t('matching.subFormation')}
                                  </div>
                                  <div className="text-xs font-bold text-gray-900">
                                    {cand.subScores.formation.toFixed(0)}%
                                  </div>
                                </div>
                                <div className="rounded-lg border border-gray-200 bg-white p-2 text-center">
                                  <div className="text-[11px] text-gray-500">
                                    {t('matching.subSkills')}
                                  </div>
                                  <div className="text-xs font-bold text-gray-900">
                                    {cand.subScores.skills.toFixed(0)}%
                                  </div>
                                </div>
                                <div className="rounded-lg border border-gray-200 bg-white p-2 text-center">
                                  <div className="text-[11px] text-gray-500">
                                    {t('matching.subExperience')}
                                  </div>
                                  <div className="text-xs font-bold text-gray-900">
                                    {cand.subScores.experience.toFixed(0)}%
                                  </div>
                                </div>
                                <div className="rounded-lg border border-gray-200 bg-white p-2 text-center">
                                  <div className="text-[11px] text-gray-500">
                                    {t('matching.subLocation')}
                                  </div>
                                  <div className="text-xs font-bold text-gray-900">
                                    {cand.subScores.location.toFixed(0)}%
                                  </div>
                                </div>
                                <div className="rounded-lg border border-gray-200 bg-white p-2 text-center">
                                  <div className="text-[11px] text-gray-500">
                                    {t('matching.subLanguages')}
                                  </div>
                                  <div className="text-xs font-bold text-gray-900">
                                    {cand.subScores.languages.toFixed(0)}%
                                  </div>
                                </div>
                                <div className="rounded-lg border border-gray-200 bg-white p-2 text-center">
                                  <div className="text-[11px] text-gray-500">
                                    {t('matching.subAvailability')}
                                  </div>
                                  <div className="text-xs font-bold text-gray-900">
                                    {cand.subScores.availability.toFixed(0)}%
                                  </div>
                                </div>
                              </div>

                              {/* Explications : Points forts & Écarts */}
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {cand.explanations.strengths.length > 0 && (
                                  <div className="rounded-lg border border-green-100 bg-green-50/60 p-2.5">
                                    <div className="text-[11px] font-bold text-green-800 mb-1">
                                      {t('matching.strengths')}
                                    </div>
                                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-green-900">
                                      {cand.explanations.strengths.map(
                                        (s, idx) => (
                                          <li key={idx}>{s}</li>
                                        ),
                                      )}
                                    </ul>
                                  </div>
                                )}

                                {cand.explanations.gaps.length > 0 && (
                                  <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-2.5">
                                    <div className="text-[11px] font-bold text-amber-800 mb-1">
                                      {t('matching.gaps')}
                                    </div>
                                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-900">
                                      {cand.explanations.gaps.map((g, idx) => (
                                        <li key={idx}>{g}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Panneau de gestion des candidatures reçues & invitations (Sprint 4) */}
                  {expandedAppsOfferId === offer.id && (
                    <div
                      data-testid={`applications-panel-${offer.id}`}
                      className="mt-6 border-t border-gray-100 pt-5 space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h4
                          data-testid="applications-panel-title"
                          className="text-sm font-bold text-gray-900"
                        >
                          {tApps('recruiter.panelTitle')}
                        </h4>
                        <button
                          type="button"
                          onClick={() => fetchOfferApplications(offer.id)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          {t('matching.refreshBtn')}
                        </button>
                      </div>

                      {isLoadingApplications ? (
                        <div className="flex justify-center py-6">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                        </div>
                      ) : offerApplications.length === 0 ? (
                        <div
                          data-testid="no-offer-applications"
                          className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-xs text-gray-600"
                        >
                          {tApps('recruiter.noApplications')}
                        </div>
                      ) : (
                        <div
                          data-testid="offer-applications-list"
                          className="space-y-4"
                        >
                          {offerApplications.map((app) => {
                            const isBusy = transitioningAppId === app.id;
                            const canReject = [
                              'SUBMITTED',
                              'REVIEWING',
                              'INTERVIEW_PROPOSED',
                              'INTERVIEW_CONFIRMED',
                              'INTERVIEW_RESCHEDULE_REQUESTED',
                              'OFFER_EXTENDED',
                            ].includes(app.currentStatus);

                            return (
                              <div
                                key={app.id}
                                data-testid={`recruiter-application-card-${app.id}`}
                                className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-3"
                              >
                                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                      <span
                                        data-testid={`recruiter-app-candidate-name-${app.id}`}
                                        className="text-sm font-bold text-gray-900"
                                      >
                                        {app.candidate.displayName}
                                      </span>

                                      {app.isAnonymized ? (
                                        <span
                                          data-testid={`recruiter-app-anonymized-badge-${app.id}`}
                                          className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 border border-indigo-200"
                                        >
                                          {t('matching.anonymizedBadge')}
                                        </span>
                                      ) : (
                                        <span
                                          data-testid={`recruiter-app-unmasked-badge-${app.id}`}
                                          className="rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-700 border border-green-200"
                                        >
                                          {tApps('recruiter.unmaskedBadge')}
                                        </span>
                                      )}

                                      <span
                                        data-testid={`recruiter-app-status-${app.id}`}
                                        className="rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-semibold text-white"
                                      >
                                        {tApps(`status.${app.currentStatus}`)}
                                      </span>

                                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] text-gray-700">
                                        {tApps(`origin.${app.origin}`)}
                                      </span>

                                      {app.initialMatchScore !== null && (
                                        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-700 border border-brand-200">
                                          {Number(
                                            app.initialMatchScore,
                                          ).toFixed(0)}
                                          %
                                        </span>
                                      )}
                                    </div>

                                    {app.isAnonymized ? (
                                      <p className="text-xs text-indigo-800">
                                        {tApps('recruiter.anonymizedNotice')} •{' '}
                                        {app.candidate.cityName} (
                                        {app.candidate.regionCode})
                                      </p>
                                    ) : (
                                      <div
                                        data-testid={`recruiter-app-contact-${app.id}`}
                                        className="text-xs text-gray-700 space-y-0.5"
                                      >
                                        <div>
                                          <strong>Email :</strong>{' '}
                                          {app.candidate.email || '—'} •{' '}
                                          <strong>Tél :</strong>{' '}
                                          {app.candidate.phone || '—'} •{' '}
                                          <strong>Ville :</strong>{' '}
                                          {app.candidate.cityName} (
                                          {app.candidate.regionCode})
                                        </div>
                                        {app.candidate.bio && (
                                          <p className="text-gray-600 italic">
                                            {app.candidate.bio}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {!app.isAnonymized &&
                                    app.candidate.hasCv && (
                                      <button
                                        type="button"
                                        disabled={
                                          downloadingCvAppId === app.id
                                        }
                                        onClick={() =>
                                          handleDownloadCandidateCv(app)
                                        }
                                        data-testid={`download-cv-btn-${app.id}`}
                                        className="rounded-lg border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                                      >
                                        {downloadingCvAppId === app.id
                                          ? tApps('recruiter.downloadingCv')
                                          : tApps('recruiter.downloadCvBtn')}
                                      </button>
                                    )}
                                </div>

                                {/* Détails d'entretien ou d'offre déjà renseignés */}
                                {app.interviewDate && (
                                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-900">
                                    <strong>
                                      {tApps(
                                        'candidateActions.interviewBoxTitle',
                                      )}{' '}
                                      :
                                    </strong>{' '}
                                    {new Date(app.interviewDate).toLocaleString(
                                      locale,
                                    )}{' '}
                                    •{' '}
                                    {app.interviewMode
                                      ? tApps(
                                          `interviewMode.${app.interviewMode}`,
                                        )
                                      : ''}{' '}
                                    • {app.interviewLocationOrLink}
                                  </div>
                                )}

                                {app.hiringOfferDetails && (
                                  <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-2.5 text-xs text-teal-900">
                                    <strong>
                                      {tApps('candidateActions.offerBoxTitle')} :
                                    </strong>{' '}
                                    {app.hiringOfferDetails}
                                  </div>
                                )}

                                {/* Boutons d'action FSM Recruteur */}
                                {canWrite && (
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    {app.currentStatus === 'SUBMITTED' && (
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                          handleRecruiterTransition(
                                            offer.id,
                                            app.id,
                                            'REVIEWING',
                                          )
                                        }
                                        data-testid={`recruiter-reviewing-btn-${app.id}`}
                                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                      >
                                        {tApps('recruiter.markReviewing')}
                                      </button>
                                    )}

                                    {(app.currentStatus === 'REVIEWING' ||
                                      app.currentStatus ===
                                        'INTERVIEW_RESCHEDULE_REQUESTED') && (
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                          openRecruiterActionForm(
                                            app.id,
                                            'INTERVIEW',
                                          )
                                        }
                                        data-testid={`recruiter-propose-interview-btn-${app.id}`}
                                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                                      >
                                        {tApps('recruiter.proposeInterview')}
                                      </button>
                                    )}

                                    {app.currentStatus ===
                                      'INTERVIEW_CONFIRMED' && (
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                          openRecruiterActionForm(
                                            app.id,
                                            'OFFER',
                                          )
                                        }
                                        data-testid={`recruiter-extend-offer-btn-${app.id}`}
                                        className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                                      >
                                        {tApps('recruiter.extendOffer')}
                                      </button>
                                    )}

                                    {canReject && (
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                          openRecruiterActionForm(
                                            app.id,
                                            'REJECT',
                                          )
                                        }
                                        data-testid={`recruiter-reject-btn-${app.id}`}
                                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                                      >
                                        {tApps('recruiter.rejectBtn')}
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* Formulaire inline pour Entretien / Proposition / Refus */}
                                {activeRecruiterForm?.appId === app.id && (
                                  <div
                                    data-testid={`recruiter-transition-form-${app.id}`}
                                    className="rounded-xl border border-gray-300 bg-white p-3 space-y-3"
                                  >
                                    {activeRecruiterForm.action ===
                                      'INTERVIEW' && (
                                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        <div>
                                          <label className="block text-[11px] font-medium text-gray-700 mb-1">
                                            {tApps(
                                              'recruiter.interviewDateLabel',
                                            )}{' '}
                                            *
                                          </label>
                                          <input
                                            type="datetime-local"
                                            value={interviewDateInput}
                                            onChange={(e) =>
                                              setInterviewDateInput(
                                                e.target.value,
                                              )
                                            }
                                            data-testid={`interview-date-input-${app.id}`}
                                            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[11px] font-medium text-gray-700 mb-1">
                                            {tApps(
                                              'recruiter.interviewModeLabel',
                                            )}{' '}
                                            *
                                          </label>
                                          <select
                                            value={interviewModeInput}
                                            onChange={(e) =>
                                              setInterviewModeInput(
                                                e.target.value as InterviewMode,
                                              )
                                            }
                                            data-testid={`interview-mode-select-${app.id}`}
                                            className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900"
                                          >
                                            <option value="IN_PERSON">
                                              {tApps('interviewMode.IN_PERSON')}
                                            </option>
                                            <option value="REMOTE_VIDEO">
                                              {tApps(
                                                'interviewMode.REMOTE_VIDEO',
                                              )}
                                            </option>
                                            <option value="PHONE">
                                              {tApps('interviewMode.PHONE')}
                                            </option>
                                          </select>
                                        </div>
                                        <div>
                                          <label className="block text-[11px] font-medium text-gray-700 mb-1">
                                            {tApps(
                                              'recruiter.interviewLocationLabel',
                                            )}{' '}
                                            *
                                          </label>
                                          <input
                                            type="text"
                                            value={interviewLocationInput}
                                            onChange={(e) =>
                                              setInterviewLocationInput(
                                                e.target.value,
                                              )
                                            }
                                            data-testid={`interview-location-input-${app.id}`}
                                            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900"
                                          />
                                        </div>
                                      </div>
                                    )}

                                    {activeRecruiterForm.action === 'OFFER' && (
                                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                        <div className="sm:col-span-2">
                                          <label className="block text-[11px] font-medium text-gray-700 mb-1">
                                            {tApps(
                                              'recruiter.offerDetailsLabel',
                                            )}{' '}
                                            *
                                          </label>
                                          <input
                                            type="text"
                                            value={offerDetailsInput}
                                            onChange={(e) =>
                                              setOfferDetailsInput(
                                                e.target.value,
                                              )
                                            }
                                            data-testid={`offer-details-input-${app.id}`}
                                            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[11px] font-medium text-gray-700 mb-1">
                                            {tApps(
                                              'recruiter.offerDeadlineLabel',
                                            )}
                                          </label>
                                          <input
                                            type="date"
                                            value={offerDeadlineInput}
                                            onChange={(e) =>
                                              setOfferDeadlineInput(
                                                e.target.value,
                                              )
                                            }
                                            data-testid={`offer-deadline-input-${app.id}`}
                                            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900"
                                          />
                                        </div>
                                      </div>
                                    )}

                                    <div>
                                      <label className="block text-[11px] font-medium text-gray-700 mb-1">
                                        {tApps('recruiter.commentLabel')}
                                      </label>
                                      <input
                                        type="text"
                                        value={recruiterCommentInput}
                                        onChange={(e) =>
                                          setRecruiterCommentInput(
                                            e.target.value,
                                          )
                                        }
                                        data-testid={`recruiter-comment-input-${app.id}`}
                                        className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-900"
                                      />
                                    </div>

                                    <div className="flex justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setActiveRecruiterForm(null)
                                        }
                                        className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700"
                                      >
                                        {tApps('recruiter.cancelAction')}
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() =>
                                          handleRecruiterTransition(
                                            offer.id,
                                            app.id,
                                            activeRecruiterForm.action ===
                                              'INTERVIEW'
                                              ? 'INTERVIEW_PROPOSED'
                                              : activeRecruiterForm.action ===
                                                  'OFFER'
                                                ? 'OFFER_EXTENDED'
                                                : 'REJECTED',
                                          )
                                        }
                                        data-testid={`confirm-recruiter-transition-btn-${app.id}`}
                                        className="rounded-lg bg-brand-600 px-3.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                                      >
                                        {tApps('recruiter.confirmAction')}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
