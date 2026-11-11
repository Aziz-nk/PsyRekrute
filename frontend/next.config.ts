import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Support RTL and LTR
  reactStrictMode: true,
  // Allow images from common domains
  images: {
    domains: ['localhost'],
  },
};

export default withNextIntl(nextConfig);
