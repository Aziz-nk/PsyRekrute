'use client';

import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/context/auth-context';
import { ApiClientError } from '@/lib/api-client';

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const currentLocale = useLocale() as 'fr' | 'ar' | 'en';
  const t = useTranslations('auth.register');
  const tErrors = useTranslations('auth.errors');
  const { register } = useAuth();

  const [role, setRole] = useState<'CANDIDATE' | 'ORGANIZATION_USER'>('CANDIDATE');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [preferredLocale, setPreferredLocale] = useState<'fr' | 'ar' | 'en'>(
    ['fr', 'ar', 'en'].includes(currentLocale) ? currentLocale : 'fr',
  );
  const [termsConsent, setTermsConsent] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMessage(tErrors('emailInvalid'));
      return;
    }

    if (password.length < 12) {
      setErrorMessage(tErrors('passwordMinLength'));
      return;
    }

    if (password.length > 128) {
      setErrorMessage(tErrors('passwordMaxLength'));
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(tErrors('passwordMismatch'));
      return;
    }

    if (!termsConsent || !privacyConsent) {
      setErrorMessage(tErrors('termsRequired'));
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        email: trimmedEmail,
        password,
        globalRole: role,
        preferredLocale,
        termsAccepted: true,
      });
      setSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setErrorMessage(tErrors('emailAlreadyExists'));
        } else if (err.statusCode === 429) {
          setErrorMessage(tErrors('tooManyRequests'));
        } else {
          setErrorMessage(err.message || tErrors('generic'));
        }
      } else {
        setErrorMessage(tErrors('generic'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-[calc(100vh-65px)] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
            <svg
              className="h-8 w-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900" data-testid="register-success-title">
            {t('successTitle')}
          </h2>
          <p className="mb-6 text-sm text-gray-600 leading-relaxed">
            {t('successMessage')}
          </p>
          <Link
            href={
              returnUrl
                ? `/login?returnUrl=${encodeURIComponent(returnUrl)}`
                : '/login'
            }
            data-testid="success-goto-login-btn"
            className="inline-flex w-full items-center justify-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition"
          >
            {t('loginLink')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-600">{t('subtitle')}</p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            data-testid="register-error-alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {/* Account Type Selection (CANDIDATE vs ORGANIZATION_USER per D2) */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              {t('accountType')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                data-testid="role-candidate-option"
                className={`relative flex flex-col rounded-xl border p-3 cursor-pointer transition ${
                  role === 'CANDIDATE'
                    ? 'border-brand-600 bg-brand-50/50 ring-2 ring-brand-500'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="role"
                    value="CANDIDATE"
                    checked={role === 'CANDIDATE'}
                    onChange={() => setRole('CANDIDATE')}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300"
                  />
                  <span className="text-xs font-bold text-gray-900">
                    {t('candidate')}
                  </span>
                </div>
                <span className="mt-1 text-[11px] text-gray-500">
                  {t('candidateDesc')}
                </span>
              </label>

              <label
                data-testid="role-org-option"
                className={`relative flex flex-col rounded-xl border p-3 cursor-pointer transition ${
                  role === 'ORGANIZATION_USER'
                    ? 'border-brand-600 bg-brand-50/50 ring-2 ring-brand-500'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="role"
                    value="ORGANIZATION_USER"
                    checked={role === 'ORGANIZATION_USER'}
                    onChange={() => setRole('ORGANIZATION_USER')}
                    className="h-4 w-4 text-brand-600 focus:ring-brand-500 border-gray-300"
                  />
                  <span className="text-xs font-bold text-gray-900">
                    {t('organization')}
                  </span>
                </div>
                <span className="mt-1 text-[11px] text-gray-500">
                  {t('organizationDesc')}
                </span>
              </label>
            </div>
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="register-email"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              {t('email')}
            </label>
            <input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              data-testid="register-email-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="register-password"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              {t('password')}
            </label>
            <input
              id="register-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              data-testid="register-password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passwordPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="register-confirm-password"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              {t('confirmPassword')}
            </label>
            <input
              id="register-confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              data-testid="register-confirm-password-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('confirmPasswordPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Preferred Locale */}
          <div>
            <label
              htmlFor="register-locale"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              {t('preferredLocale')}
            </label>
            <select
              id="register-locale"
              name="preferredLocale"
              value={preferredLocale}
              onChange={(e) =>
                setPreferredLocale(e.target.value as 'fr' | 'ar' | 'en')
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="fr">Français (FR)</option>
              <option value="ar">العربية (AR)</option>
              <option value="en">English (EN)</option>
            </select>
          </div>

          {/* Consents (Terms and Privacy checkboxes) */}
          <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50/70 p-3.5">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-gray-700">
              <input
                type="checkbox"
                required
                data-testid="register-terms-checkbox"
                checked={termsConsent}
                onChange={(e) => setTermsConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span>{t('termsConsent')}</span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-gray-700">
              <input
                type="checkbox"
                required
                data-testid="register-privacy-checkbox"
                checked={privacyConsent}
                onChange={(e) => setPrivacyConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span>{t('privacyConsent')}</span>
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="register-submit-button"
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 transition"
          >
            {isSubmitting ? t('submitting') : t('submit')}
          </button>
        </form>

        <div className="border-t border-gray-100 pt-4 text-center text-sm text-gray-600">
          <span>{t('hasAccount')} </span>
          <Link
            href={
              returnUrl
                ? `/login?returnUrl=${encodeURIComponent(returnUrl)}`
                : '/login'
            }
            data-testid="goto-login-link"
            className="font-semibold text-brand-600 hover:text-brand-700 underline"
          >
            {t('loginLink')}
          </Link>
        </div>
      </div>
    </div>
  );
}
