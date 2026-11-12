import { getRequestConfig } from 'next-intl/server';

export const locales = ['fr', 'ar', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'fr';

export const localeConfig: Record<Locale, { dir: 'ltr' | 'rtl'; label: string }> = {
  fr: { dir: 'ltr', label: 'Français' },
  ar: { dir: 'rtl', label: 'العربية' },
  en: { dir: 'ltr', label: 'English' },
};

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !locales.includes(locale as Locale)) locale = defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
