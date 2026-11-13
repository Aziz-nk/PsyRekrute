'use client';

import React from 'react';
import { useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';

const LOCALES: Array<{ code: 'fr' | 'ar' | 'en'; label: string }> = [
  { code: 'fr', label: 'FR' },
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'EN' },
];

export default function LanguageSwitcher() {
  const currentLocale = useLocale();
  const pathname = usePathname();

  return (
    <div
      role="group"
      aria-label="Language selector"
      className="inline-flex items-center rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs font-medium"
    >
      {LOCALES.map((locale) => {
        const isActive = currentLocale === locale.code;
        return (
          <Link
            key={locale.code}
            href={pathname}
            locale={locale.code}
            className={`rounded-md px-2.5 py-1 transition-colors ${
              isActive
                ? 'bg-brand-600 text-white shadow-sm font-semibold'
                : 'text-gray-600 hover:text-brand-700 hover:bg-gray-100'
            }`}
          >
            {locale.label}
          </Link>
        );
      })}
    </div>
  );
}
