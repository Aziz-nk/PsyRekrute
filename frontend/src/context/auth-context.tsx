'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  authApi,
  AuthUser,
  LoginPayload,
  RegisterPayload,
  setAccessToken,
} from '@/lib/api-client';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (credentials: LoginPayload) => Promise<AuthUser>;
  register: (payload: RegisterPayload) => Promise<{
    id: string;
    email: string;
    globalRole: string;
    preferredLocale: string;
  }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await authApi.refresh();
      if (res?.data?.user) {
        setUser(res.data.user);
        return true;
      }
      setUser(null);
      setAccessToken(null);
      return false;
    } catch {
      setUser(null);
      setAccessToken(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Attempt silent session restoration on initial mount via HttpOnly cookie
    refreshSession();
  }, [refreshSession]);

  const login = useCallback(
    async (credentials: LoginPayload): Promise<AuthUser> => {
      const res = await authApi.login(credentials);
      setUser(res.data.user);
      return res.data.user;
    },
    [],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const res = await authApi.register(payload);
      return res.data;
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch {
      // Ignored: clear client state even if backend network call fails
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        register,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
