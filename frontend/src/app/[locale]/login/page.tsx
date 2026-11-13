'use client';

import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useAuth } from '@/context/auth-context';
import { ApiClientError } from '@/lib/api-client';

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const tErrors = useTranslations('auth.errors');
  const tSession = useTranslations('auth.session');
  const { login, user, logout } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage(tErrors('emailInvalid'));
      return;
    }
    if (!password) {
      setErrorMessage(tErrors('passwordMinLength'));
      return;
    }

    setIsSubmitting(true);
    try {
      await login({
        email: trimmedEmail,
        password,
      });
      // Redirect home after successful login
      router.push('/');
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 401) {
          setErrorMessage(tErrors('invalidCredentials'));
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

  // If user is already logged in, show their session status
  if (user) {
    return (
      <div className="flex min-h-[calc(100vh-65px)] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
            <svg
              className="h-6 w-6"
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
          <h2 className="mb-2 text-xl font-bold text-gray-900">
            {tSession('connectedAs')}
          </h2>
          <p className="mb-1 text-sm font-semibold text-brand-700" data-testid="logged-in-user-email">
            {user.email}
          </p>
          <p className="mb-6 text-xs text-gray-500 uppercase tracking-wider" data-testid="logged-in-user-role">
            {user.globalRole}
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/"
              className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition"
            >
              {tSession('welcome')}
            </Link>
            <button
              onClick={() => logout()}
              data-testid="session-logout-button"
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              {tSession('logout')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-gray-600">{t('subtitle')}</p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            data-testid="auth-error-alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              {t('email')}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              data-testid="login-email-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              {t('password')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              data-testid="login-password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passwordPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            data-testid="login-submit-button"
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 transition"
          >
            {isSubmitting ? t('submitting') : t('submit')}
          </button>
        </form>

        <div className="border-t border-gray-100 pt-4 text-center text-sm text-gray-600">
          <span>{t('noAccount')} </span>
          <Link
            href="/register"
            data-testid="goto-register-link"
            className="font-semibold text-brand-600 hover:text-brand-700 underline"
          >
            {t('createAccount')}
          </Link>
        </div>
      </div>
    </div>
  );
}
