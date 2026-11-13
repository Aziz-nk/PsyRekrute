import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import type { Locale } from '@/i18n/request';
import HealthStatus from '@/components/HealthStatus';
import UserSessionCard from '@/components/UserSessionCard';

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

  return (
    <main className="flex flex-col">
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 to-white px-4 py-16 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-4 text-4xl font-extrabold tracking-tight text-brand-800 sm:text-5xl">
            {t('title')}
          </h1>
          <p className="mb-8 text-lg text-gray-600">{t('subtitle')}</p>
          <UserSessionCard />
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
