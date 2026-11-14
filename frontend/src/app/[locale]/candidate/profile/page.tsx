'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/auth-context';
import { useRouter } from '@/i18n/routing';
import {
  candidateApi,
  referenceApi,
  consentApi,
  CandidateProfile,
  MoroccanRegion,
  RefSpecialty,
  RefSkill,
  ApiClientError,
} from '@/lib/api-client';

export default function CandidateProfilePage() {
  const t = useTranslations('candidate.profile');
  const tNav = useTranslations('nav');
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Reference data
  const [regions, setRegions] = useState<MoroccanRegion[]>([]);
  const [specialties, setSpecialties] = useState<RefSpecialty[]>([]);
  const [availableSkills, setAvailableSkills] = useState<RefSkill[]>([]);

  // Profile Form State
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [category, setCategory] = useState<'STUDENT' | 'RECENT_GRADUATE' | 'EXPERIENCED_PROFESSIONAL'>('STUDENT');
  const [specialtyId, setSpecialtyId] = useState('');
  const [regionCode, setRegionCode] = useState('');
  const [cityName, setCityName] = useState('');
  const [mobilityRadius, setMobilityRadius] = useState<number>(0);
  const [openToRelocation, setOpenToRelocation] = useState(false);
  const [availability, setAvailability] = useState<'IMMEDIATE' | 'DATE' | 'CURRENTLY_EMPLOYED' | 'PART_TIME'>('IMMEDIATE');
  const [availableFrom, setAvailableFrom] = useState('');
  const [anonymizedInPool, setAnonymizedInPool] = useState(true);
  const [talentPoolConsent, setTalentPoolConsent] = useState(false);

  // Sub-entity Form States
  // Education form
  const [eduDegreeLevel, setEduDegreeLevel] = useState('BAC_3');
  const [eduDegreeTitle, setEduDegreeTitle] = useState('');
  const [eduInstitution, setEduInstitution] = useState('');
  const [eduSpecialtyId, setEduSpecialtyId] = useState('');
  const [eduStartYear, setEduStartYear] = useState<number>(2022);
  const [eduEndYear, setEduEndYear] = useState<number | undefined>(2025);
  const [eduEnrolled, setEduEnrolled] = useState(false);
  const [addingEdu, setAddingEdu] = useState(false);

  // Experience form
  const [expType, setExpType] = useState('STAGE_OBSERVATION');
  const [expOrg, setExpOrg] = useState('');
  const [expPosition, setExpPosition] = useState('');
  const [expAudience, setExpAudience] = useState('');
  const [expStartDate, setExpStartDate] = useState('2025-01-01');
  const [expEndDate, setExpEndDate] = useState('');
  const [expMonths, setExpMonths] = useState<number>(3);
  const [expDesc, setExpDesc] = useState('');
  const [addingExp, setAddingExp] = useState(false);

  // Skills
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [selectedSkillLevel, setSelectedSkillLevel] = useState('AUTONOME');

  // Languages
  const [selectedLangCode, setSelectedLangCode] = useState('FR');
  const [selectedLangProf, setSelectedLangProf] = useState('COURANT_PROFESSIONNEL');

  // CV
  const [uploadingCv, setUploadingCv] = useState(false);

  // Load Data
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.globalRole !== 'CANDIDATE') {
      router.push('/login');
      return;
    }

    async function loadData() {
      try {
        setLoading(true);
        const [regionsRes, specRes, skillsRes, profileRes, consentsRes] = await Promise.all([
          referenceApi.getRegions().catch(() => ({ data: [] })),
          referenceApi.getSpecialties().catch(() => ({ data: [] })),
          referenceApi.getSkills().catch(() => ({ data: [] })),
          candidateApi.getMyProfile().catch(() => ({ data: null })),
          consentApi.getConsents().catch(() => ({ data: [] })),
        ]);

        setRegions(regionsRes.data || []);
        setSpecialties(specRes.data || []);
        setAvailableSkills(skillsRes.data || []);

        // Talent pool consent
        const tpConsent = consentsRes.data?.find((c) => c.consentType === 'TALENT_POOL_MATCHING');
        setTalentPoolConsent(!!tpConsent?.hasConsented);

        // Pre-fill profile if existing
        const p = profileRes.data;
        if (p) {
          setProfile(p);
          setFirstName(p.firstName || '');
          setLastName(p.lastName || '');
          setPhone(p.phone || '');
          setBio(p.bio || '');
          setCategory((p.profileCategory as any) || 'STUDENT');
          setSpecialtyId(p.primarySpecialtyId || (specRes.data?.[0]?.id ?? ''));
          setEduSpecialtyId(p.primarySpecialtyId || (specRes.data?.[0]?.id ?? ''));
          setRegionCode(p.regionCode || (regionsRes.data?.[0]?.code ?? ''));
          setCityName(p.cityName || '');
          setMobilityRadius(p.mobilityRadiusKm || 0);
          setOpenToRelocation(!!p.openToRelocation);
          setAvailability((p.availabilityStatus as any) || 'IMMEDIATE');
          setAvailableFrom(p.availableFrom ? p.availableFrom.slice(0, 10) : '');
          setAnonymizedInPool(p.isAnonymizedInPool !== false);
        } else {
          if (specRes.data?.[0]) {
            setSpecialtyId(specRes.data[0].id);
            setEduSpecialtyId(specRes.data[0].id);
          }
          if (regionsRes.data?.[0]) setRegionCode(regionsRes.data[0].code);
        }
      } catch (err) {
        console.error('Failed to load candidate data', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user, authLoading, router]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (!firstName.trim() || !lastName.trim() || !cityName.trim() || !specialtyId || !regionCode) {
      setErrorMessage('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    setSaving(true);
    try {
      const res = await candidateApi.upsertProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        bio: bio.trim() || undefined,
        profileCategory: category,
        primarySpecialtyId: specialtyId,
        regionCode,
        cityName: cityName.trim(),
        mobilityRadiusKm: Number(mobilityRadius) || 0,
        openToRelocation,
        availabilityStatus: availability,
        availableFrom: availableFrom ? availableFrom : undefined,
        isAnonymizedInPool: anonymizedInPool,
      });

      // Update Talent pool matching consent
      await consentApi.updateConsent('TALENT_POOL_MATCHING', talentPoolConsent, '1.0');

      // Refresh profile state
      const refreshed = await candidateApi.getMyProfile();
      setProfile(refreshed.data);
      setStatusMessage(t('saveSuccess'));
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Une erreur est survenue lors de l enregistrement.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddEducation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) {
      setErrorMessage('Veuillez enregistrer votre profil général avant d ajouter une formation.');
      return;
    }
    if (!eduDegreeTitle.trim() || !eduInstitution.trim() || !eduSpecialtyId) return;

    setAddingEdu(true);
    try {
      await candidateApi.addEducation({
        degreeLevel: eduDegreeLevel,
        degreeTitle: eduDegreeTitle.trim(),
        institutionName: eduInstitution.trim(),
        specialtyId: eduSpecialtyId,
        startYear: Number(eduStartYear),
        endYear: eduEndYear ? Number(eduEndYear) : undefined,
        isCurrentlyEnrolled: eduEnrolled,
      });
      setEduDegreeTitle('');
      setEduInstitution('');
      const refreshed = await candidateApi.getMyProfile();
      setProfile(refreshed.data);
    } catch (err) {
      console.error(err);
    } finally {
      setAddingEdu(false);
    }
  };

  const handleDeleteEducation = async (eduId: string) => {
    try {
      await candidateApi.deleteEducation(eduId);
      const refreshed = await candidateApi.getMyProfile();
      setProfile(refreshed.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddExperience = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) {
      setErrorMessage('Veuillez enregistrer votre profil général avant d ajouter une expérience.');
      return;
    }
    if (!expOrg.trim() || !expPosition.trim() || !expStartDate) return;

    setAddingExp(true);
    try {
      await candidateApi.addExperience({
        experienceType: expType,
        organizationName: expOrg.trim(),
        positionTitle: expPosition.trim(),
        targetAudience: expAudience.trim() || undefined,
        startDate: expStartDate,
        endDate: expEndDate || undefined,
        totalMonths: Number(expMonths) || 1,
        description: expDesc.trim() || undefined,
        isCurrent: !expEndDate,
      });
      setExpOrg('');
      setExpPosition('');
      setExpDesc('');
      const refreshed = await candidateApi.getMyProfile();
      setProfile(refreshed.data);
    } catch (err) {
      console.error(err);
    } finally {
      setAddingExp(false);
    }
  };

  const handleDeleteExperience = async (expId: string) => {
    try {
      await candidateApi.deleteExperience(expId);
      const refreshed = await candidateApi.getMyProfile();
      setProfile(refreshed.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddSkill = async () => {
    if (!profile || !selectedSkillId) return;
    const currentSkills = profile.skills || [];
    const exists = currentSkills.some((s) => s.skillId === selectedSkillId);
    let updated;
    if (exists) {
      updated = currentSkills.map((s) =>
        s.skillId === selectedSkillId ? { skillId: s.skillId, level: selectedSkillLevel } : { skillId: s.skillId, level: s.level }
      );
    } else {
      updated = [...currentSkills.map((s) => ({ skillId: s.skillId, level: s.level })), { skillId: selectedSkillId, level: selectedSkillLevel }];
    }
    try {
      await candidateApi.setSkills(updated);
      const refreshed = await candidateApi.getMyProfile();
      setProfile(refreshed.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveSkill = async (skillIdToRemove: string) => {
    if (!profile) return;
    const updated = (profile.skills || [])
      .filter((s) => s.skillId !== skillIdToRemove)
      .map((s) => ({ skillId: s.skillId, level: s.level }));
    try {
      await candidateApi.setSkills(updated);
      const refreshed = await candidateApi.getMyProfile();
      setProfile(refreshed.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddLanguage = async () => {
    if (!profile || !selectedLangCode) return;
    const currentLangs = profile.languages || [];
    const exists = currentLangs.some((l) => l.languageCode === selectedLangCode);
    let updated;
    if (exists) {
      updated = currentLangs.map((l) =>
        l.languageCode === selectedLangCode ? { languageCode: l.languageCode, proficiencyLevel: selectedLangProf } : { languageCode: l.languageCode, proficiencyLevel: l.proficiencyLevel }
      );
    } else {
      updated = [...currentLangs.map((l) => ({ languageCode: l.languageCode, proficiencyLevel: l.proficiencyLevel })), { languageCode: selectedLangCode, proficiencyLevel: selectedLangProf }];
    }
    try {
      await candidateApi.setLanguages(updated);
      const refreshed = await candidateApi.getMyProfile();
      setProfile(refreshed.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveLanguage = async (langCodeToRemove: string) => {
    if (!profile) return;
    const updated = (profile.languages || [])
      .filter((l) => l.languageCode !== langCodeToRemove)
      .map((l) => ({ languageCode: l.languageCode, proficiencyLevel: l.proficiencyLevel }));
    try {
      await candidateApi.setLanguages(updated);
      const refreshed = await candidateApi.getMyProfile();
      setProfile(refreshed.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (file.type !== 'application/pdf') {
      setErrorMessage('Seuls les fichiers PDF sont acceptés.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Le fichier dépasse la taille maximale autorisée (5 Mo).');
      return;
    }

    setUploadingCv(true);
    setErrorMessage(null);
    try {
      const { data: uploadInfo } = await candidateApi.getCvUploadUrl();
      const uploadRes = await fetch(uploadInfo.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
        body: file,
      });

      if (!uploadRes.ok) throw new Error('Échec du téléversement du fichier');

      await candidateApi.confirmCvUpload(uploadInfo.storageKey);
      const refreshed = await candidateApi.getMyProfile();
      setProfile(refreshed.data);
      setStatusMessage('CV téléversé et validé avec succès !');
    } catch (err) {
      console.error(err);
      setErrorMessage('Erreur lors du téléversement du CV.');
    } finally {
      setUploadingCv(false);
    }
  };

  const handleCvDownload = async () => {
    try {
      const { data } = await candidateApi.getCvDownloadUrl();
      window.open(data.downloadUrl, '_blank');
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const completion = profile?.profileCompletionPercentage || 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header with Title & Completion Bar */}
      <div className="mb-8 rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900" data-testid="profile-page-title">
              {t('title')}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
          </div>
          <div className="flex flex-col items-end w-full sm:w-64">
            <div className="flex justify-between w-full text-xs font-semibold text-gray-700 mb-1">
              <span>{t('completion')}</span>
              <span className="text-brand-600 font-bold" data-testid="completion-percentage">{completion}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="bg-brand-600 h-3 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${completion}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {statusMessage && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 font-medium" data-testid="status-success-alert">
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-medium" data-testid="status-error-alert">
          {errorMessage}
        </div>
      )}

      <div className="space-y-8">
        {/* Section 1: Informations Générales & Localisation */}
        <form onSubmit={handleSaveProfile} className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">
            {t('personalInfo')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('firstName')} *</label>
              <input
                type="text"
                required
                data-testid="input-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('lastName')} *</label>
              <input
                type="text"
                required
                data-testid="input-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('phone')}</label>
              <input
                type="text"
                data-testid="input-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+212600000000"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('category')} *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                data-testid="select-category"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
              >
                <option value="STUDENT">{t('catStudent')}</option>
                <option value="RECENT_GRADUATE">{t('catRecentGraduate')}</option>
                <option value="EXPERIENCED_PROFESSIONAL">{t('catExperienced')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('specialty')} *</label>
            <select
              value={specialtyId}
              onChange={(e) => setSpecialtyId(e.target.value)}
              data-testid="select-specialty"
              required
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
            >
              <option value="">{t('selectSpecialty')}</option>
              {specialties.map((spec) => (
                <option key={spec.id} value={spec.id}>
                  {spec.titleFr} ({spec.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('region')} *</label>
              <select
                value={regionCode}
                onChange={(e) => setRegionCode(e.target.value)}
                data-testid="select-region"
                required
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
              >
                <option value="">{t('selectRegion')}</option>
                {regions.map((reg) => (
                  <option key={reg.code} value={reg.code}>
                    {reg.code} - {reg.nameFr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('city')} *</label>
              <input
                type="text"
                required
                data-testid="input-city"
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                placeholder="Ex: Casablanca, Rabat, Fès..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('mobility')}</label>
              <input
                type="number"
                min="0"
                max="500"
                data-testid="input-mobility-radius"
                value={mobilityRadius}
                onChange={(e) => setMobilityRadius(Number(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('availability')} *</label>
              <select
                value={availability}
                onChange={(e) => setAvailability(e.target.value as any)}
                data-testid="select-availability"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
              >
                <option value="IMMEDIATE">{t('availImmediate')}</option>
                <option value="DATE">{t('availDate')}</option>
                <option value="CURRENTLY_EMPLOYED">{t('availEmployed')}</option>
                <option value="PART_TIME">{t('availPartTime')}</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="relocation"
              checked={openToRelocation}
              onChange={(e) => setOpenToRelocation(e.target.checked)}
              data-testid="checkbox-relocation"
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="relocation" className="text-xs text-gray-700 font-medium">
              {t('relocation')}
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('bio')}</label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              data-testid="input-bio"
              placeholder="Présentez vos objectifs professionnels, vos domaines de prédilection..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none"
            />
          </div>

          {/* Talent pool consent & Privacy */}
          <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-700">{t('talentPool')}</h3>
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-gray-700">
              <input
                type="checkbox"
                checked={talentPoolConsent}
                onChange={(e) => setTalentPoolConsent(e.target.checked)}
                data-testid="checkbox-talent-pool-consent"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="font-medium">{t('talentPoolConsent')}</span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-gray-700">
              <input
                type="checkbox"
                checked={anonymizedInPool}
                onChange={(e) => setAnonymizedInPool(e.target.checked)}
                data-testid="checkbox-anonymized-in-pool"
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span>{t('anonymizedInPool')}</span>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              data-testid="btn-save-profile"
              className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 transition"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </form>

        {/* Section 2: Formations & Diplômes */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">
            {t('education')}
          </h2>

          <div className="space-y-3">
            {profile?.education && profile.education.length > 0 ? (
              profile.education.map((edu) => (
                <div key={edu.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-4 bg-gray-50/50">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">{edu.degreeTitle}</h4>
                    <p className="text-xs text-gray-600">{edu.institutionName} • {edu.degreeLevel} • {edu.startYear} - {edu.isCurrentlyEnrolled ? 'En cours' : edu.endYear}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteEducation(edu.id)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50"
                  >
                    {t('delete')}
                  </button>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500 italic">{t('noEducation')}</p>
            )}
          </div>

          <form onSubmit={handleAddEducation} className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">{t('addEducation')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('degreeLevel')}</label>
                <select
                  value={eduDegreeLevel}
                  onChange={(e) => setEduDegreeLevel(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                >
                  <option value="BAC_3">Bac +3 (Licence)</option>
                  <option value="BAC_5_MASTER">Bac +5 (Master / DESS)</option>
                  <option value="BAC_8_DOCTORAT">Bac +8 (Doctorat)</option>
                  <option value="DIPLOME_ETAT">Diplôme d&apos;État</option>
                  <option value="DU_SPECIALISE">D.U. Spécialisé</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('degreeTitle')}</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Licence de Psychologie Cognitive"
                  value={eduDegreeTitle}
                  onChange={(e) => setEduDegreeTitle(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('institution')}</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Université Mohammed V - Rabat"
                  value={eduInstitution}
                  onChange={(e) => setEduInstitution(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('startYear')} / {t('endYear')}</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={eduStartYear}
                    onChange={(e) => setEduStartYear(Number(e.target.value))}
                    className="w-1/2 rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                  />
                  <input
                    type="number"
                    value={eduEndYear || ''}
                    disabled={eduEnrolled}
                    onChange={(e) => setEduEndYear(Number(e.target.value))}
                    className="w-1/2 rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="eduEnrolled"
                checked={eduEnrolled}
                onChange={(e) => setEduEnrolled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="eduEnrolled" className="text-xs text-gray-700">
                {t('enrolled')}
              </label>
            </div>

            <button
              type="submit"
              disabled={addingEdu}
              className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
            >
              {addingEdu ? t('saving') : t('addEducation')}
            </button>
          </form>
        </div>

        {/* Section 3: Expériences & Stages */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">
            {t('experiences')}
          </h2>

          <div className="space-y-3">
            {profile?.experiences && profile.experiences.length > 0 ? (
              profile.experiences.map((exp) => (
                <div key={exp.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-4 bg-gray-50/50">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">{exp.positionTitle} ({exp.organizationName})</h4>
                    <p className="text-xs text-gray-600">{exp.experienceType} • {exp.totalMonths} mois • {exp.targetAudience || 'Tous publics'}</p>
                    {exp.description && <p className="text-xs text-gray-500 mt-1">{exp.description}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteExperience(exp.id)}
                    className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50"
                  >
                    {t('delete')}
                  </button>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-500 italic">{t('noExperience')}</p>
            )}
          </div>

          <form onSubmit={handleAddExperience} className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-4">
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">{t('addExperience')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('expType')}</label>
                <select
                  value={expType}
                  onChange={(e) => setExpType(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900"
                >
                  <option value="STAGE_OBSERVATION">Stage d&apos;observation</option>
                  <option value="STAGE_PFE">Stage de fin d&apos;études (PFE)</option>
                  <option value="STAGE_CLINIQUE">Stage clinique</option>
                  <option value="EMPLOI_SALARIE">Emploi salarié</option>
                  <option value="VOLONTARIAT">Volontariat / Bénévolat</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('organization')}</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Centre Médico-Psychologique"
                  value={expOrg}
                  onChange={(e) => setExpOrg(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('position')}</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Stagiaire psychologue clinicien"
                  value={expPosition}
                  onChange={(e) => setExpPosition(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('targetAudience')}</label>
                <input
                  type="text"
                  placeholder="Ex: Enfants DYS, Adolescents, Adultes..."
                  value={expAudience}
                  onChange={(e) => setExpAudience(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('startDate')}</label>
                <input
                  type="date"
                  required
                  value={expStartDate}
                  onChange={(e) => setExpStartDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{t('months')}</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={expMonths}
                  onChange={(e) => setExpMonths(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('description')}</label>
              <textarea
                rows={2}
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900"
              />
            </div>

            <button
              type="submit"
              disabled={addingExp}
              className="rounded-lg bg-gray-800 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
            >
              {addingExp ? t('saving') : t('addExperience')}
            </button>
          </form>
        </div>

        {/* Section 4: Compétences & Langues */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {/* Compétences */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
              {t('skills')}
            </h2>

            <div className="space-y-2">
              {profile?.skills && profile.skills.length > 0 ? (
                profile.skills.map((cs) => (
                  <div key={cs.skillId} className="flex items-center justify-between text-xs rounded-lg border border-gray-200 px-3 py-2 bg-gray-50">
                    <div>
                      <span className="font-semibold text-gray-900">{cs.skill?.titleFr || cs.skillId}</span>
                      <span className="ml-2 text-[10px] text-brand-600 bg-brand-50 px-2 py-0.5 rounded font-medium">{cs.level}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveSkill(cs.skillId)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-500 italic">{t('noSkills')}</p>
              )}
            </div>

            <div className="pt-2 border-t border-gray-100 space-y-2">
              <select
                value={selectedSkillId}
                onChange={(e) => setSelectedSkillId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900"
              >
                <option value="">{t('selectSkill')}</option>
                {availableSkills.map((sk) => (
                  <option key={sk.id} value={sk.id}>
                    {sk.titleFr} ({sk.category})
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <select
                  value={selectedSkillLevel}
                  onChange={(e) => setSelectedSkillLevel(e.target.value)}
                  className="w-2/3 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900"
                >
                  <option value="NOTIONS">{t('levelNotions')}</option>
                  <option value="PRATIQUANT">{t('levelPratiquant')}</option>
                  <option value="AUTONOME">{t('levelAutonome')}</option>
                  <option value="EXPERT">{t('levelExpert')}</option>
                </select>
                <button
                  onClick={handleAddSkill}
                  type="button"
                  className="w-1/3 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                >
                  {t('addSkill')}
                </button>
              </div>
            </div>
          </div>

          {/* Langues */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
              {t('languages')}
            </h2>

            <div className="space-y-2">
              {profile?.languages && profile.languages.length > 0 ? (
                profile.languages.map((cl) => (
                  <div key={cl.languageCode} className="flex items-center justify-between text-xs rounded-lg border border-gray-200 px-3 py-2 bg-gray-50">
                    <div>
                      <span className="font-semibold text-gray-900 uppercase">{cl.languageCode}</span>
                      <span className="ml-2 text-[10px] text-gray-600 bg-gray-200 px-2 py-0.5 rounded font-medium">{cl.proficiencyLevel}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveLanguage(cl.languageCode)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-gray-500 italic">{t('noLanguages')}</p>
              )}
            </div>

            <div className="pt-2 border-t border-gray-100 space-y-2">
              <div className="flex gap-2">
                <select
                  value={selectedLangCode}
                  onChange={(e) => setSelectedLangCode(e.target.value)}
                  className="w-1/2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900"
                >
                  <option value="FR">Français (FR)</option>
                  <option value="AR">Arabe (AR)</option>
                  <option value="EN">Anglais (EN)</option>
                  <option value="BER">Amazighe (BER)</option>
                  <option value="ES">Espagnol (ES)</option>
                </select>

                <select
                  value={selectedLangProf}
                  onChange={(e) => setSelectedLangProf(e.target.value)}
                  className="w-1/2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900"
                >
                  <option value="NOTIONS">{t('profNotions')}</option>
                  <option value="INTERMEDIAIRE">{t('profIntermediaire')}</option>
                  <option value="COURANT_PROFESSIONNEL">{t('profCourant')}</option>
                  <option value="LANGUE_MATERNELLE">{t('profMaternelle')}</option>
                </select>
              </div>

              <button
                onClick={handleAddLanguage}
                type="button"
                className="w-full rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
              >
                {t('addLanguage')}
              </button>
            </div>
          </div>
        </div>

        {/* Section 5: Curriculum Vitae (CV) */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">
            {t('cv')}
          </h2>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 bg-gray-50/50">
            <div>
              {profile?.cvStoragePath ? (
                <div className="flex items-center gap-2 text-green-700 text-xs font-semibold">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{t('cvUploaded')}</span>
                </div>
              ) : (
                <p className="text-xs text-gray-500">{t('uploadCv')}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              {profile?.cvStoragePath && (
                <button
                  type="button"
                  onClick={handleCvDownload}
                  data-testid="btn-download-cv"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t('downloadCv')}
                </button>
              )}

              <label className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 cursor-pointer transition">
                <span>{uploadingCv ? t('uploading') : t('uploadCv')}</span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleCvFileUpload}
                  disabled={uploadingCv}
                  className="hidden"
                  data-testid="input-cv-file"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
