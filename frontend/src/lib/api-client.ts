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

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

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
    specialtyId?: string;
    search?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offerType) query.set('offerType', params.offerType);
    if (params?.regionCode) query.set('regionCode', params.regionCode);
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
