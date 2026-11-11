import createMiddleware from 'next-intl/middleware';
import { routing } from './src/i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for
  // - …files in the `public` folder
  // - …files inside `/_next/`
  // - …API routes
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
