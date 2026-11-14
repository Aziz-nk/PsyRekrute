'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/context/auth-context';
import LanguageSwitcher from './LanguageSwitcher';

export default function Navbar() {
  const tNav = useTranslations('nav');
  const tSession = useTranslations('auth.session');
  const { user, logout, isLoading } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'CANDIDATE':
        return tSession('roleCandidate');
      case 'ORGANIZATION_USER':
        return tSession('roleOrganization');
      case 'SYSTEM_ADMIN':
        return tSession('roleAdmin');
      default:
        return role;
    }
  };

  return (
    <nav className="border-b border-gray-100 bg-white shadow-sm sticky top-0 z-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold text-brand-700 hover:text-brand-800">
            PsyRekrute
          </Link>
          {user?.globalRole === 'CANDIDATE' && (
            <Link
              href="/candidate/profile"
              data-testid="nav-candidate-profile-link"
              className="text-xs sm:text-sm font-medium text-gray-700 hover:text-brand-600 transition"
            >
              {tNav('profile')}
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <LanguageSwitcher />

          {!isLoading && (
            <>
              {user ? (
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex flex-col text-right rtl:text-left">
                    <span className="text-xs font-semibold text-gray-800" data-testid="user-email">
                      {user.email}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-brand-600 font-medium" data-testid="user-role">
                      {getRoleLabel(user.globalRole)}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    data-testid="logout-button"
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                  >
                    {isLoggingOut ? tSession('loggingOut') : tNav('logout')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 sm:gap-3">
                  <Link
                    href="/login"
                    data-testid="nav-login-link"
                    className="rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 hover:text-brand-600"
                  >
                    {tNav('login')}
                  </Link>
                  <Link
                    href="/register"
                    data-testid="nav-register-link"
                    className="rounded-md bg-brand-600 px-3 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {tNav('register')}
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
