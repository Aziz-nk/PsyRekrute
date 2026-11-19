'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export default function Footer() {
  const tHome = useTranslations('home');
  const tNav = useTranslations('nav');

  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white text-gray-700" data-testid="app-footer">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Col 1: Plateforme */}
          <div className="md:col-span-1 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold text-brand-700">PsyRekrute</span>
              <span className="rounded bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-800">
                MAROC
              </span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              {tHome('footer.tagline')}
            </p>
            <div className="pt-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                {tHome('footer.cndp')}
              </span>
            </div>
          </div>

          {/* Col 2: Navigation rapide */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900">
              {tHome('footer.navigation')}
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <Link href="/" className="hover:text-brand-600 transition">
                  {tNav('home')}
                </Link>
              </li>
              <li>
                <Link href="/offers" className="hover:text-brand-600 transition">
                  {tNav('offers')}
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-brand-600 transition">
                  {tNav('register')}
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-brand-600 transition">
                  {tNav('login')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Spécialités au Maroc */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900">
              {tHome('categories.domainsTitle')}
            </h4>
            <ul className="space-y-1.5 text-xs text-gray-600">
              <li>• {tHome('categories.schoolPsy')}</li>
              <li>• {tHome('categories.neuropsy')}</li>
              <li>• {tHome('categories.tsa')}</li>
              <li>• {tHome('categories.ortho')}</li>
              <li>• {tHome('categories.psychomot')}</li>
            </ul>
          </div>

          {/* Col 4: Conformité & Contact */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900">
              {tHome('footer.contact')}
            </h4>
            <div className="space-y-2 text-xs text-gray-600">
              <p>
                <span className="font-semibold text-gray-900">Email :</span>{' '}
                <a href="mailto:contact@psyrekrute.ma" className="text-brand-600 hover:underline">
                  {tHome('footer.contactEmail')}
                </a>
              </p>
              <p>
                <span className="font-semibold text-gray-900">Implantation :</span>{' '}
                {tHome('footer.contactAddress')}
              </p>
              <p className="text-[11px] text-gray-500 pt-2 border-t border-gray-100">
                {tHome('footer.terms')} • {tHome('footer.privacy')}
              </p>
            </div>
          </div>
        </div>

        {/* Barème inférieur / Copyright */}
        <div className="mt-8 border-t border-gray-100 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-3">
          <p>© {currentYear} PsyRekrute. {tHome('footer.rights')}</p>
          <div className="flex items-center gap-4 text-[11px] text-gray-500">
            <span>Rabat • Casablanca • Fès • Marrakech • Tanger</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
