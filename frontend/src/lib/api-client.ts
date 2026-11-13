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

// In-memory access token storage strictly conforming to security constraint D5 & D6
// NEVER store tokens in localStorage or sessionStorage.
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
    // Always include credentials to send and receive HttpOnly cookies across origins
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
  async register(payload: RegisterPayload): Promise<{
    statusCode: number;
    message: string;
    data: {
      id: string;
      email: string;
      globalRole: string;
      preferredLocale: string;
      createdAt: string;
    };
  }> {
    return request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async login(payload: LoginPayload): Promise<{
    statusCode: number;
    message: string;
    data: AuthResponseData;
  }> {
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

  async refresh(): Promise<{
    statusCode: number;
    message: string;
    data: AuthResponseData;
  }> {
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

  async logout(): Promise<{
    statusCode: number;
    message: string;
    data: { revoked: boolean };
  }> {
    try {
      return await request('/auth/logout', {
        method: 'POST',
      });
    } finally {
      setAccessToken(null);
    }
  },

  async getMe(): Promise<{
    statusCode: number;
    data: AuthUser;
  }> {
    return request('/auth/me', {
      method: 'GET',
    });
  },
};
