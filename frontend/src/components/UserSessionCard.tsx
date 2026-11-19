'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/context/auth-context';

export default function UserSessionCard() {
  const tHero = useTranslations('home.hero');
  const tSession = useTranslations('auth.session');
  const tNav = useTranslations('nav');
  const tOffers = useTranslations('offers.manage');
  const { user, logout, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (user) {
    return (
      <div
        data-testid="connected-user-card"
        className="mx-auto max-w-xl rounded-2xl border border-brand-200 bg-white p-6 shadow-sm text-left rtl:text-right"
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
          <div>
            <span className="text-xs font-semibold text-brand-600 uppercase tracking-wider">
              {tSession('connectedAs')}
            </span>
            <h3 className="text-lg font-bold text-gray-900" data-testid="dashboard-email">
              {user.email}
            </h3>
          </div>
          <span
            data-testid="dashboard-role-badge"
            className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 border border-brand-200"
          >
            {user.globalRole}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs text-gray-600 mb-4">
          <div>
            <span className="block font-medium text-gray-400">{tSession('userId')}</span>
            <span className="font-mono text-gray-700 truncate block">{user.id}</span>
          </div>
          <div>
            <span className="block font-medium text-gray-400">{tSession('preferredLocale')}</span>
            <span className="uppercase text-gray-700 font-semibold">{user.preferredLocale || 'fr'}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          {user.globalRole === 'CANDIDATE' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/candidate/profile"
                data-testid="card-candidate-profile-btn"
                className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
              >
                {tNav('profile')}
              </Link>
              <Link
                href="/candidate/applications"
                data-testid="card-candidate-applications-btn"
                className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition"
              >
                {tNav('applications')}
              </Link>
              <Link
                href="/candidate/saved-offers"
                data-testid="card-candidate-saved-offers-btn"
                className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition"
              >
                {tNav('savedOffers')}
              </Link>
            </div>
          ) : user.globalRole === 'ORGANIZATION_USER' ? (
            <Link
              href="/organization/offers"
              data-testid="card-org-offers-btn"
              className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition"
            >
              {tOffers('navLink')}
            </Link>
          ) : user.globalRole === 'SYSTEM_ADMIN' ? (
            <Link
              href="/admin"
              data-testid="card-admin-btn"
              className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 transition"
            >
              {tNav('admin')}
            </Link>
          ) : (
            <div />
          )}
          <button
            onClick={() => logout()}
            data-testid="card-logout-btn"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {tSession('logout')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
      <Link
        href="/register"
        data-testid="hero-cta-candidate"
        className="rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow hover:bg-brand-700 transition"
      >
        {tHero('ctaCandidate')}
      </Link>
      <Link
        href="/register"
        data-testid="hero-cta-org"
        className="rounded-lg border border-brand-600 px-6 py-3 text-base font-semibold text-brand-700 hover:bg-brand-50 transition"
      >
        {tHero('ctaOrganization')}
      </Link>
    </div>
  );
}
