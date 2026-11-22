export interface AuthUser {
  id: string;
  email: string;
  globalRole: 'CANDIDATE' | 'ORGANIZATION_USER' | 'SYSTEM_ADMIN';
  preferredLocale?: 'fr' | 'ar' | 'en';
  organizations?: Array<{
    organizationId: string;
    role: 'OWNER' | 'ADMIN' | 'RECRUITER' | 'VIEWER';
    joinedAt: string;
  }>;
  currentOrgId?: string | null;
}

export interface RegisterPayload {
  email: string;
  password: string;
  globalRole: 'CANDIDATE' | 'ORGANIZATION_USER';
  preferredLocale?: 'fr' | 'ar' | 'en';
  termsAccepted: boolean;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponseData {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
}

export interface MoroccanRegion {
  code: string;
  nameFr: string;
  nameAr: string;
  nameEn: string;
}

export interface RefSpecialty {
  id: string;
  code: string;
  titleFr: string;
  titleAr: string;
  titleEn: string;
  description?: string;
  parentId?: string;
}

export interface RefSkill {
  id: string;
  code: string;
  category: string;
  titleFr: string;
  titleAr: string;
  titleEn: string;
  isVerifiedEligible: boolean;
  parentId?: string;
}

export interface CandidateEducation {
  id: string;
  degreeLevel: string;
  degreeTitle: string;
  institutionName: string;
  specialtyId: string;
  startYear: number;
  endYear?: number;
  isCurrentlyEnrolled: boolean;
  specialty?: RefSpecialty;
}

export interface CandidateExperience {
  id: string;
  experienceType: string;
  organizationName: string;
  positionTitle: string;
  targetAudience?: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  totalMonths: number;
  description?: string;
}

export interface CandidateSkill {
  id: string;
  skillId: string;
  level: string;
  isVerified: boolean;
  skill?: RefSkill;
}

export interface CandidateLanguage {
  id: string;
  languageCode: string;
  proficiencyLevel: string;
}

export interface CandidateProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  profileCategory: string;
  primarySpecialtyId: string;
  regionCode: string;
  cityName: string;
  mobilityRadiusKm: number;
  openToRelocation: boolean;
  availabilityStatus: string;
  availableFrom?: string;
  targetContractTypes: string[];
  bio?: string;
  cvStoragePath?: string;
  isAnonymizedInPool: boolean;
  profileCompletionPercentage: number;
  primarySpecialty?: RefSpecialty;
  education?: CandidateEducation[];
  experiences?: CandidateExperience[];
  skills?: CandidateSkill[];
  languages?: CandidateLanguage[];
}

export class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

let inMemoryAccessToken: string | null = null;

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (networkError) {
    throw new ApiClientError(
      0,
      `Impossible de contacter le serveur API (${API_BASE_URL}). Vérifiez que le backend NestJS est démarré et accessible.`,
      networkError,
    );
  }

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorMessage =
      data?.message ||
      (Array.isArray(data?.message) ? data.message.join(', ') : null) ||
      `Request failed with status ${response.status}`;
    throw new ApiClientError(response.status, errorMessage, data);
  }

  return data as T;
}

export const authApi = {
  async register(payload: RegisterPayload) {
    return request<{
      statusCode: number;
      message: string;
      data: {
        id: string;
        email: string;
        globalRole: string;
        preferredLocale: string;
        createdAt: string;
      };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async login(payload: LoginPayload) {
    const res = await request<{
      statusCode: number;
      message: string;
      data: AuthResponseData;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (res?.data?.accessToken) {
      setAccessToken(res.data.accessToken);
    }

    return res;
  },

  async refresh() {
    const res = await request<{
      statusCode: number;
      message: string;
      data: AuthResponseData;
    }>('/auth/refresh', {
      method: 'POST',
    });

    if (res?.data?.accessToken) {
      setAccessToken(res.data.accessToken);
    }

    return res;
  },

  async logout() {
    try {
      return await request<{
        statusCode: number;
        message: string;
        data: { revoked: boolean };
      }>('/auth/logout', {
        method: 'POST',
      });
    } finally {
      setAccessToken(null);
    }
  },

  async getMe() {
    return request<{
      statusCode: number;
      data: AuthUser;
    }>('/auth/me', {
      method: 'GET',
    });
  },
};

export const referenceApi = {
  async getRegions() {
    return request<{ statusCode: number; data: MoroccanRegion[] }>(
      '/reference/regions',
      { method: 'GET' },
    );
  },

  async getSpecialties() {
    return request<{ statusCode: number; data: RefSpecialty[] }>(
      '/reference/specialties',
      { method: 'GET' },
    );
  },

  async getSkills() {
    return request<{ statusCode: number; data: RefSkill[] }>(
      '/reference/skills',
      { method: 'GET' },
    );
  },
};

export const candidateApi = {
  async getMyProfile() {
    return request<{ statusCode: number; data: CandidateProfile | null }>(
      '/candidates/me',
      { method: 'GET' },
    );
  },

  async upsertProfile(payload: Partial<CandidateProfile>) {
    return request<{ statusCode: number; message: string; data: CandidateProfile }>(
      '/candidates/me',
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );
  },

  async addEducation(payload: Omit<CandidateEducation, 'id' | 'specialty'>) {
    return request<{ statusCode: number; message: string; data: CandidateEducation }>(
      '/candidates/me/education',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  async deleteEducation(educationId: string) {
    return request<{ statusCode: number; message: string; data: { deleted: boolean } }>(
      `/candidates/me/education/${educationId}`,
      { method: 'DELETE' },
    );
  },

  async addExperience(payload: Omit<CandidateExperience, 'id'>) {
    return request<{ statusCode: number; message: string; data: CandidateExperience }>(
      '/candidates/me/experiences',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  async deleteExperience(experienceId: string) {
    return request<{ statusCode: number; message: string; data: { deleted: boolean } }>(
      `/candidates/me/experiences/${experienceId}`,
      { method: 'DELETE' },
    );
  },

  async setSkills(skills: Array<{ skillId: string; level: string }>) {
    return request<{ statusCode: number; message: string; data: CandidateSkill[] }>(
      '/candidates/me/skills',
      {
        method: 'PUT',
        body: JSON.stringify({ skills }),
      },
    );
  },

  async setLanguages(languages: Array<{ languageCode: string; proficiencyLevel: string }>) {
    return request<{ statusCode: number; message: string; data: CandidateLanguage[] }>(
      '/candidates/me/languages',
      {
        method: 'PUT',
        body: JSON.stringify({ languages }),
      },
    );
  },

  async getCvUploadUrl() {
    return request<{
      statusCode: number;
      data: { uploadUrl: string; storageKey: string; expiresInSeconds: number };
    }>('/candidates/me/cv/upload-url', { method: 'POST' });
  },

  async confirmCvUpload(storageKey: string) {
    return request<{ statusCode: number; message: string; data: CandidateProfile }>(
      '/candidates/me/cv/confirm',
      {
        method: 'POST',
        body: JSON.stringify({ storageKey }),
      },
    );
  },

  async getCvDownloadUrl() {
    return request<{
      statusCode: number;
      data: { downloadUrl: string; expiresInSeconds: number };
    }>('/candidates/me/cv/download-url', { method: 'GET' });
  },
};

export const consentApi = {
  async getConsents() {
    return request<{
      statusCode: number;
      data: Array<{
        consentType: string;
        hasConsented: boolean;
        version: string;
        consentedAt: string | null;
      }>;
    }>('/me/consents', { method: 'GET' });
  },

  async updateConsent(consentType: string, hasConsented: boolean, version: string = '1.0') {
    return request<{ statusCode: number; message: string }>(
      '/me/consents',
      {
        method: 'PUT',
        body: JSON.stringify({ consentType, hasConsented, version }),
      },
    );
  },
};

export interface OrganizationDetails {
  id: string;
  legalName: string;
  tradeName: string;
  organizationType: string;
  identifierIce?: string | null;
  officialRegistrationNumber?: string | null;
  website?: string | null;
  phone: string;
  email: string;
  regionCode: string;
  cityName: string;
  addressLine: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verifiedAt?: string | null;
  isActive: boolean;
}

export interface UserOrganizationMembership {
  membershipId: string;
  role: 'OWNER' | 'ADMIN' | 'RECRUITER' | 'VIEWER';
  organization: OrganizationDetails;
}

export interface CreateOrganizationPayload {
  legalName: string;
  tradeName: string;
  organizationType: string;
  identifierIce?: string;
  officialRegistrationNumber?: string;
  website?: string;
  phone: string;
  email: string;
  regionCode: string;
  cityName: string;
  addressLine: string;
}

export interface JobRequiredSkillItem {
  id?: string;
  skillId: string;
  isMandatory: boolean;
  minRequiredLevel: string;
  weight: number;
  skill?: RefSkill;
}

export interface JobRequiredLanguageItem {
  id?: string;
  languageCode: string;
  minProficiencyLevel: string;
  isMandatory: boolean;
}

export interface JobOffer {
  id: string;
  organizationId: string;
  authorMemberId: string;
  title: string;
  offerType: 'STAGE_OBSERVATION' | 'STAGE_PFE' | 'EMPLOI';
  contractSubType: string;
  requiredDegreeLevel: string;
  targetSpecialtyId: string;
  regionCode: string;
  cityName: string;
  minExperienceMonths: number;
  isExperienceMandatory: boolean;
  startDate: string;
  durationMonths?: number | null;
  remunerationStipend?: string | null;
  description: string;
  status: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'CLOSED' | 'ARCHIVED';
  publishedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  organization?: {
    id: string;
    tradeName: string;
    legalName?: string;
    organizationType: string;
    cityName: string;
    regionCode: string;
    website?: string | null;
    verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
  };
  targetSpecialty?: RefSpecialty;
  requiredSkills?: JobRequiredSkillItem[];
  requiredLanguages?: JobRequiredLanguageItem[];
}

export interface CreateJobOfferPayload {
  title: string;
  offerType: 'STAGE_OBSERVATION' | 'STAGE_PFE' | 'EMPLOI';
  contractSubType: string;
  requiredDegreeLevel: string;
  targetSpecialtyId: string;
  regionCode: string;
  cityName: string;
  minExperienceMonths?: number;
  isExperienceMandatory?: boolean;
  startDate: string;
  durationMonths?: number;
  remunerationStipend?: string;
  description: string;
  requiredSkills?: Array<{
    skillId: string;
    isMandatory?: boolean;
    minRequiredLevel: string;
    weight?: number;
  }>;
  requiredLanguages?: Array<{
    languageCode: string;
    minProficiencyLevel: string;
    isMandatory?: boolean;
  }>;
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface RecommendedCandidate {
  candidateId: string;
  displayName: string;
  isAnonymized: boolean;
  profileCategory: string;
  regionCode: string;
  cityName: string;
  mobilityRadiusKm: number;
  openToRelocation: boolean;
  availabilityStatus: string;
  totalScore: number;
  subScores: {
    formation: number;
    skills: number;
    experience: number;
    location: number;
    languages: number;
    availability: number;
  };
  mandatoryCriteriaSatisfied: boolean;
  explanations: {
    strengths: string[];
    gaps: string[];
  };
  algoVersion: string;
  calculatedAt: string;
  hasApplied: boolean;
  isInvited: boolean;
}

export const offersApi = {
  async listPublicOffers(params?: {
    page?: number;
    limit?: number;
    offerType?: string;
    regionCode?: string;
    cityName?: string;
    specialtyId?: string;
    search?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offerType) query.set('offerType', params.offerType);
    if (params?.regionCode) query.set('regionCode', params.regionCode);
    if (params?.cityName) query.set('cityName', params.cityName);
    if (params?.specialtyId) query.set('specialtyId', params.specialtyId);
    if (params?.search) query.set('search', params.search);
    const qs = query.toString();

    return request<{
      statusCode: number;
      data: JobOffer[];
      meta: PaginatedMeta;
    }>(`/job-offers${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },

  async getPublicOffer(offerId: string) {
    return request<{ statusCode: number; data: JobOffer }>(
      `/job-offers/${offerId}`,
      { method: 'GET' },
    );
  },

  async getMyOrganizations() {
    return request<{ statusCode: number; data: UserOrganizationMembership[] }>(
      '/job-offers/my-organizations',
      { method: 'GET' },
    );
  },

  async createOrganization(payload: CreateOrganizationPayload) {
    return request<{
      statusCode: number;
      message: string;
      data: OrganizationDetails;
    }>('/organizations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async listOrgOffers(
    organizationId: string,
    params?: { page?: number; limit?: number; status?: string },
  ) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();

    return request<{
      statusCode: number;
      data: JobOffer[];
      meta: PaginatedMeta;
    }>(
      `/organizations/${organizationId}/job-offers${qs ? `?${qs}` : ''}`,
      { method: 'GET' },
    );
  },

  async getOrgOffer(organizationId: string, offerId: string) {
    return request<{ statusCode: number; data: JobOffer }>(
      `/organizations/${organizationId}/job-offers/${offerId}`,
      { method: 'GET' },
    );
  },

  async createOffer(organizationId: string, payload: CreateJobOfferPayload) {
    return request<{ statusCode: number; message: string; data: JobOffer }>(
      `/organizations/${organizationId}/job-offers`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  async updateOffer(
    organizationId: string,
    offerId: string,
    payload: Partial<CreateJobOfferPayload>,
  ) {
    return request<{ statusCode: number; message: string; data: JobOffer }>(
      `/organizations/${organizationId}/job-offers/${offerId}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );
  },

  async publishOffer(organizationId: string, offerId: string) {
    return request<{ statusCode: number; message: string; data: JobOffer }>(
      `/organizations/${organizationId}/job-offers/${offerId}/publish`,
      { method: 'POST' },
    );
  },

  async closeOffer(organizationId: string, offerId: string) {
    return request<{ statusCode: number; message: string; data: JobOffer }>(
      `/organizations/${organizationId}/job-offers/${offerId}/close`,
      { method: 'POST' },
    );
  },

  async archiveOffer(organizationId: string, offerId: string) {
    return request<{ statusCode: number; message: string; data: JobOffer }>(
      `/organizations/${organizationId}/job-offers/${offerId}/archive`,
      { method: 'POST' },
    );
  },

  async getRecommendedCandidates(
    offerId: string,
    params?: { page?: number; limit?: number; minScore?: number },
  ) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.minScore !== undefined) {
      query.set('minScore', String(params.minScore));
    }
    const qs = query.toString();

    return request<{
      statusCode: number;
      data: RecommendedCandidate[];
      meta: PaginatedMeta;
    }>(`/job-offers/${offerId}/recommended-candidates${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
  },
};

export type ApplicationOrigin = 'DIRECT_APPLY' | 'CENTER_INVITATION';

export type ApplicationStatus =
  | 'INVITED'
  | 'INVITATION_DECLINED'
  | 'INVITATION_EXPIRED'
  | 'SUBMITTED'
  | 'REVIEWING'
  | 'INTERVIEW_PROPOSED'
  | 'INTERVIEW_CONFIRMED'
  | 'INTERVIEW_RESCHEDULE_REQUESTED'
  | 'OFFER_EXTENDED'
  | 'HIRED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type InterviewMode = 'IN_PERSON' | 'REMOTE_VIDEO' | 'PHONE';

export interface ApplicationHistoryItem {
  id: string;
  previousStatus: ApplicationStatus | null;
  newStatus: ApplicationStatus;
  changedByUserId: string;
  comment: string | null;
  createdAt: string;
}

export interface CandidateApplication {
  id: string;
  jobOfferId: string;
  candidateId: string;
  origin: ApplicationOrigin;
  currentStatus: ApplicationStatus;
  initialMatchScore: number | null;
  interviewRescheduleCount: number;
  interviewDate: string | null;
  interviewMode: InterviewMode | null;
  interviewLocationOrLink: string | null;
  hiringOfferDetails: string | null;
  hiringOfferDeadline: string | null;
  invitationExpiresAt: string | null;
  appliedAt: string;
  updatedAt: string;
  jobOffer: {
    id: string;
    title: string;
    offerType: string;
    contractSubType: string;
    cityName: string;
    regionCode: string;
    status: string;
    organization: {
      id: string;
      legalName: string;
      tradeName: string;
      organizationType: string;
      cityName: string;
      regionCode: string;
      verificationStatus: string;
    };
  };
  history: ApplicationHistoryItem[];
}

export interface RecruiterApplication {
  id: string;
  jobOfferId: string;
  candidateId: string;
  origin: ApplicationOrigin;
  currentStatus: ApplicationStatus;
  initialMatchScore: number | null;
  interviewRescheduleCount: number;
  interviewDate: string | null;
  interviewMode: InterviewMode | null;
  interviewLocationOrLink: string | null;
  hiringOfferDetails: string | null;
  hiringOfferDeadline: string | null;
  invitationExpiresAt: string | null;
  appliedAt: string;
  updatedAt: string;
  isAnonymized: boolean;
  candidate: {
    id: string;
    displayName: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    bio: string | null;
    profileCategory: string;
    regionCode: string;
    cityName: string;
    mobilityRadiusKm: number;
    openToRelocation: boolean;
    availabilityStatus: string;
    availableFromDate: string | null;
    hasCv: boolean;
    primarySpecialty?: RefSpecialty | null;
    education?: CandidateEducation[];
    experiences?: CandidateExperience[];
    skills?: CandidateSkill[];
    languages?: CandidateLanguage[];
  };
  history: ApplicationHistoryItem[];
}

export const applicationsApi = {
  async applyDirect(payload: { jobOfferId: string; comment?: string }) {
    return request<{
      statusCode: number;
      message: string;
      data: CandidateApplication;
    }>('/applications', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async inviteCandidate(payload: {
    jobOfferId: string;
    candidateId: string;
    comment?: string;
  }) {
    return request<{
      statusCode: number;
      message: string;
      data: RecruiterApplication;
    }>('/applications/invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async listMyApplications() {
    return request<{
      statusCode: number;
      data: CandidateApplication[];
    }>('/candidates/me/applications', {
      method: 'GET',
    });
  },

  async transitionByCandidate(
    applicationId: string,
    payload: { targetStatus: ApplicationStatus; comment?: string },
  ) {
    return request<{
      statusCode: number;
      message: string;
      data: CandidateApplication;
    }>(`/candidates/me/applications/${applicationId}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async listOfferApplications(organizationId: string, offerId: string) {
    return request<{
      statusCode: number;
      data: RecruiterApplication[];
    }>(
      `/organizations/${organizationId}/job-offers/${offerId}/applications`,
      {
        method: 'GET',
      },
    );
  },

  async transitionByRecruiter(
    organizationId: string,
    applicationId: string,
    payload: {
      targetStatus: ApplicationStatus;
      comment?: string;
      interviewDate?: string;
      interviewMode?: InterviewMode;
      interviewLocationOrLink?: string;
      hiringOfferDetails?: string;
      hiringOfferDeadline?: string;
    },
  ) {
    return request<{
      statusCode: number;
      message: string;
      data: RecruiterApplication;
    }>(
      `/organizations/${organizationId}/applications/${applicationId}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  },

  async getCvDownloadUrl(candidateId: string) {
    return request<{
      statusCode: number;
      data: {
        downloadUrl: string;
        fileName: string | null;
        expiresInSeconds: number;
      };
    }>('/candidate/cv/download-url', {
      method: 'POST',
      body: JSON.stringify({ candidateId }),
    });
  },
};

// ==========================================
// SPRINT 5 APIS
// ==========================================

export interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

export const notificationsApi = {
  async list(params?: { unreadOnly?: boolean; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.unreadOnly) query.set('unreadOnly', 'true');
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<{
      statusCode: number;
      data: NotificationItem[];
      unreadCount: number;
      meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(`/notifications${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },

  async markAsRead(notificationId: string) {
    return request<{
      statusCode: number;
      message: string;
      data: NotificationItem;
    }>(`/notifications/${notificationId}/read`, { method: 'PATCH' });
  },

  async markAllAsRead() {
    return request<{
      statusCode: number;
      message: string;
    }>('/notifications/read-all', { method: 'POST' });
  },
};

export interface AdminOrganizationItem {
  id: string;
  legalName: string;
  tradeName: string;
  organizationType: string;
  identifierIce: string | null;
  officialRegistrationNumber: string | null;
  website: string | null;
  phone: string;
  email: string;
  regionCode: string;
  cityName: string;
  addressLine: string;
  verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verifiedAt: string | null;
  createdAt: string;
  _count: {
    members: number;
    jobOffers: number;
  };
  members?: Array<{
    id: string;
    role: string;
    user: {
      id: string;
      email: string;
    };
  }>;
}

export interface AdminAuditLogItem {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export const adminApi = {
  async listOrganizations(status?: string) {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<{
      statusCode: number;
      data: AdminOrganizationItem[];
    }>(`/admin/organizations${qs}`, { method: 'GET' });
  },

  async verifyOrganization(
    organizationId: string,
    payload: { status: 'VERIFIED' | 'REJECTED'; reason?: string },
  ) {
    return request<{
      statusCode: number;
      message: string;
      data: AdminOrganizationItem;
    }>(`/admin/organizations/${organizationId}/verification`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async listAuditLogs(params?: {
    page?: number;
    limit?: number;
    action?: string;
    entityType?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.action) query.set('action', params.action);
    if (params?.entityType) query.set('entityType', params.entityType);
    const qs = query.toString();
    return request<{
      statusCode: number;
      data: AdminAuditLogItem[];
      meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(`/admin/audit-logs${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },
};

export interface SavedOfferItem {
  id: string;
  jobOfferId: string;
  createdAt: string;
  jobOffer: JobOffer;
}

export const savedOffersApi = {
  async list() {
    return request<{
      statusCode: number;
      data: SavedOfferItem[];
    }>('/candidates/me/saved-offers', { method: 'GET' });
  },

  async save(jobOfferId: string) {
    return request<{
      statusCode: number;
      message: string;
      data: SavedOfferItem;
    }>(`/candidates/me/saved-offers/${jobOfferId}`, { method: 'POST' });
  },

  async unsave(jobOfferId: string) {
    return request<{
      statusCode: number;
      message: string;
    }>(`/candidates/me/saved-offers/${jobOfferId}`, { method: 'DELETE' });
  },
};

export interface OrgMemberItem {
  id: string;
  organizationId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'RECRUITER' | 'VIEWER';
  createdAt: string;
  user: {
    id: string;
    email: string;
    globalRole: string;
    preferredLocale: string;
    createdAt: string;
  };
}

export const orgMembersApi = {
  async listMembers(organizationId: string) {
    return request<{
      statusCode: number;
      data: OrgMemberItem[];
    }>(`/organizations/${organizationId}/members`, { method: 'GET' });
  },

  async addMember(
    organizationId: string,
    payload: {
      userId?: string;
      email?: string;
      role: 'ADMIN' | 'RECRUITER' | 'VIEWER';
    },
  ) {
    return request<{
      statusCode: number;
      message: string;
      data: OrgMemberItem;
    }>(`/organizations/${organizationId}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async removeMember(organizationId: string, userId: string) {
    return request<{
      statusCode: number;
      message?: string;
      data?: { revoked: boolean };
    }>(`/organizations/${organizationId}/members/${userId}`, {
      method: 'DELETE',
    });
  },
};

export type ExternalJobStatus = 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'EXPIRED';

export interface ExternalJobListing {
  id: string;
  title: string;
  organizationName: string;
  descriptionSummary: string;
  cityName?: string | null;
  regionCode?: string | null;
  contractType?: string | null;
  category?: string | null;
  publicationDate?: string | null;
  expirationDate?: string | null;
  sourceName: string;
  sourceUrl: string;
  originalApplicationUrl?: string | null;
  applicationInstructions?: string | null;
  discoveredAt: string;
  lastCheckedAt: string;
  status: ExternalJobStatus;
  contentHash: string;
  reviewedAt?: string | null;
  reviewedByUserId?: string | null;
  rejectionReason?: string | null;
  // Helpers optionnels
  sourceDomain?: string;
  sourcePlatform?: string;
  collectedAt?: string;
}

export const externalJobsApi = {
  async listPublished(params?: {
    page?: number;
    limit?: number;
    cityName?: string;
    category?: string;
    contractType?: string;
    search?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.cityName) query.set('cityName', params.cityName);
    if (params?.category) query.set('category', params.category);
    if (params?.contractType) query.set('contractType', params.contractType);
    if (params?.search) query.set('search', params.search);

    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<{
      statusCode: number;
      data: ExternalJobListing[];
      meta: PaginatedMeta;
    }>(`/external-jobs${qs}`, { method: 'GET' });
  },

  async getPublished(id: string) {
    return request<{
      statusCode: number;
      data: ExternalJobListing;
    }>(`/external-jobs/${id}`, { method: 'GET' });
  },

  async listForAdmin(params?: {
    page?: number;
    limit?: number;
    status?: ExternalJobStatus;
    cityName?: string;
    category?: string;
    search?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.status) query.set('status', params.status);
    if (params?.cityName) query.set('cityName', params.cityName);
    if (params?.category) query.set('category', params.category);
    if (params?.search) query.set('search', params.search);

    const qs = query.toString() ? `?${query.toString()}` : '';
    return request<{
      statusCode: number;
      data: ExternalJobListing[];
      meta: PaginatedMeta & {
        countsByStatus?: Record<ExternalJobStatus, number>;
      };
    }>(`/admin/external-jobs${qs}`, { method: 'GET' });
  },

  async collectRss(keywords?: string[]) {
    return request<{
      statusCode: number;
      message: string;
      data: {
        collected: number;
        duplicates: number;
        errors: number;
        items: ExternalJobListing[];
      };
    }>('/admin/external-jobs/collect-rss', {
      method: 'POST',
      body: JSON.stringify({ keywords }),
    });
  },

  async importUrl(url: string) {
    return request<{
      statusCode: number;
      message: string;
      data: ExternalJobListing;
    }>('/admin/external-jobs/import-url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  },

  async review(
    id: string,
    payload: {
      action: 'APPROVE' | 'REJECT' | 'EXPIRE';
      rejectionReason?: string;
      title?: string;
      organizationName?: string;
      descriptionSummary?: string;
      cityName?: string;
      contractType?: string;
      category?: string;
    },
  ) {
    return request<{
      statusCode: number;
      message: string;
      data: ExternalJobListing;
    }>(`/admin/external-jobs/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};

