import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import type { Locale } from '@/i18n/request';
import HealthStatus from '@/components/HealthStatus';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: Locale };
}): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'home.hero' });
  return { title: t('title') };
}

export default function HomePage() {
  const t = useTranslations('home.hero');
  const tFeatures = useTranslations('home.features');
  const tNav = useTranslations('nav');

  return (
    <main className="flex min-h-screen flex-col">
      {/* Navigation */}
      <nav className="border-b border-gray-100 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <span className="text-xl font-bold text-brand-700">PsyRekrute</span>
          <div className="flex items-center gap-4">
            <a href="#" className="text-sm text-gray-600 hover:text-brand-600">
              {tNav('offers')}
            </a>
            <a
              href="#"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              {tNav('login')}
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 to-white px-4 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-brand-800 sm:text-5xl">
            {t('title')}
          </h1>
          <p className="mb-8 text-lg text-gray-600">{t('subtitle')}</p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="#"
              className="rounded-lg bg-brand-600 px-6 py-3 text-base font-semibold text-white shadow hover:bg-brand-700"
            >
              {t('ctaCandidate')}
            </a>
            <a
              href="#"
              className="rounded-lg border border-brand-600 px-6 py-3 text-base font-semibold text-brand-700 hover:bg-brand-50"
            >
              {t('ctaOrganization')}
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:grid-cols-3 sm:px-6 lg:px-8">
          {(['matching', 'trilingual', 'privacy'] as const).map((key) => (
            <div
              key={key}
              className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
            >
              <h3 className="mb-2 text-lg font-semibold text-brand-700">
                {tFeatures(`${key}.title`)}
              </h3>
              <p className="text-sm text-gray-600">
                {tFeatures(`${key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Backend Health Check */}
      <section className="border-t border-gray-100 bg-gray-50 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <HealthStatus />
        </div>
      </section>
    </main>
  );
}
